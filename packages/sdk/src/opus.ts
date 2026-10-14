import {
    getAddress,
    parseAbi,
    parseSignature,
    zeroAddress,
    type Address,
    type Hash,
    type Hex,
    type PublicClient,
    type WalletClient,
} from "viem";

import { coreAbi, erc20Abi, evaluatorAbi } from "./abi";
import { amoyGasPrice } from "./gas";
import { descriptionOf } from "./description";
import { decodeOpusError } from "./errors";
import { jobIdFromReceipt } from "./events";
import { encodeForwarderExecute as encodeExecute, signForwardRequest, type ForwardRequest } from "./forwarder";
import { statusFor } from "./status";
import type { EvaluatorConfig, Job, PhaseName, ProtocolAddresses, WalletStatus } from "./types";

const EMPTY = "0x" as Hex;
const JOB_STATUS = ["Open", "Funded", "Submitted", "Completed", "Rejected", "Expired"] as const;
const PHASE = ["None", "Funded", "Submitted", "Escalated", "ArbiterPending", "Resolved"] as const;

const PERMIT_TYPES = {
    Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
    ],
} as const;

type WriteAbi = typeof coreAbi | typeof evaluatorAbi | typeof erc20Abi;

/**
 * App, keeper, and relayer entry point. Callers pass viem clients.
 * This class never accepts a private key.
 */
export class Opus {
    constructor(
        readonly publicClient: PublicClient,
        readonly addresses: ProtocolAddresses,
        readonly walletClient?: WalletClient
    ) {}

    withWallet(walletClient: WalletClient): Opus {
        return new Opus(this.publicClient, this.addresses, walletClient);
    }

    async createJob(
        input: {
            provider?: Address;
            evaluator?: Address;
            expiredAt: bigint;
            description: string;
            hook?: Address;
        },
        onSent?: (hash: Hash) => void
    ): Promise<bigint> {
        const hash = await this.write(this.addresses.instance, coreAbi, "createJob", [
            input.provider ?? zeroAddress,
            input.evaluator ?? this.addresses.evaluator,
            input.expiredAt,
            descriptionOf(input.description),
            input.hook ?? this.addresses.evaluator,
        ]);
        // Lets a screen tell "waiting for the signature" from "waiting for the block".
        onSent?.(hash);
        const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
        return jobIdFromReceipt(receipt.logs);
    }

    setProvider(jobId: bigint, provider: Address): Promise<Hash> {
        return this.write(this.addresses.instance, coreAbi, "setProvider", [jobId, provider, EMPTY]);
    }

    /** `setBudget`. The name matches the quote step in the app flow. */
    quote(jobId: bigint, amount: bigint): Promise<Hash> {
        return this.write(this.addresses.instance, coreAbi, "setBudget", [jobId, amount, EMPTY]);
    }

    fund(jobId: bigint, expectedBudget: bigint): Promise<Hash> {
        return this.write(this.addresses.instance, coreAbi, "fund", [jobId, expectedBudget, EMPTY]);
    }

    async fundWithPermit(jobId: bigint, expectedBudget: bigint): Promise<Hash> {
        const permit = await this.signPermit(this.addresses.instance, expectedBudget);
        return this.write(this.addresses.instance, coreAbi, "fundWithPermit", [
            jobId,
            expectedBudget,
            EMPTY,
            permit.deadline,
            permit.v,
            permit.r,
            permit.s,
        ]);
    }

    async submit(jobId: bigint, deliverable: Hex, agreedAmount: bigint): Promise<Hash> {
        const job = await this.job(jobId);
        if (job.budget !== agreedAmount) {
            throw new Error("The funded amount does not match the agreed budget");
        }
        // A client-chosen hook or evaluator could block payment after the work is delivered.
        if (!sameAddress(job.evaluator, this.addresses.evaluator) || !sameAddress(job.hook, this.addresses.evaluator)) {
            throw new Error("The job does not use the OPUS review contract as its evaluator and hook");
        }
        return this.write(this.addresses.instance, coreAbi, "submit", [jobId, deliverable, EMPTY]);
    }

    claimRefund(jobId: bigint): Promise<Hash> {
        return this.write(this.addresses.instance, coreAbi, "claimRefund", [jobId]);
    }

    withdrawFromInstance(to?: Address): Promise<Hash> {
        return this.write(this.addresses.instance, coreAbi, "withdraw", [to ?? this.sender()]);
    }

    async configure(jobId: bigint, config: EvaluatorConfig): Promise<Hash> {
        await this.assertEvaluatorHook(jobId);
        return this.write(this.addresses.evaluator, evaluatorAbi, "configure", [
            this.addresses.instance,
            jobId,
            configTuple(config),
        ]);
    }

    async configureWithPermit(jobId: bigint, config: EvaluatorConfig): Promise<Hash> {
        await this.assertEvaluatorHook(jobId);
        const pull = config.evaluationFee + (config.autoCompleteOnSilence ? 0n : config.disputeDeposit);
        const permit = await this.signPermit(this.addresses.evaluator, pull);
        return this.write(this.addresses.evaluator, evaluatorAbi, "configureWithPermit", [
            this.addresses.instance,
            jobId,
            configTuple(config),
            permit.deadline,
            permit.v,
            permit.r,
            permit.s,
        ]);
    }

    approve(jobId: bigint): Promise<Hash> {
        return this.write(this.addresses.evaluator, evaluatorAbi, "approveJob", [this.addresses.instance, jobId]);
    }

    object(jobId: bigint, evidenceHash: Hex): Promise<Hash> {
        return this.write(this.addresses.evaluator, evaluatorAbi, "object", [
            this.addresses.instance,
            jobId,
            evidenceHash,
        ]);
    }

    extendReview(jobId: bigint, secondsExtended: number): Promise<Hash> {
        return this.write(this.addresses.evaluator, evaluatorAbi, "extendReview", [
            this.addresses.instance,
            jobId,
            secondsExtended,
        ]);
    }

    withdrawAsProvider(jobId: bigint): Promise<Hash> {
        return this.write(this.addresses.evaluator, evaluatorAbi, "withdrawAsProvider", [
            this.addresses.instance,
            jobId,
        ]);
    }

    postDeposit(jobId: bigint): Promise<Hash> {
        return this.write(this.addresses.evaluator, evaluatorAbi, "postDeposit", [this.addresses.instance, jobId]);
    }

    async postDepositWithPermit(jobId: bigint): Promise<Hash> {
        const config = await this.config(jobId);
        const permit = await this.signPermit(this.addresses.evaluator, config.disputeDeposit);
        return this.write(this.addresses.evaluator, evaluatorAbi, "postDepositWithPermit", [
            this.addresses.instance,
            jobId,
            permit.deadline,
            permit.v,
            permit.r,
            permit.s,
        ]);
    }

    timeoutNoSubmission(jobId: bigint): Promise<Hash> {
        return this.write(this.addresses.evaluator, evaluatorAbi, "timeoutNoSubmission", [
            this.addresses.instance,
            jobId,
        ]);
    }

    finalize(jobId: bigint): Promise<Hash> {
        return this.write(this.addresses.evaluator, evaluatorAbi, "finalize", [this.addresses.instance, jobId]);
    }

    escalateOnSilence(jobId: bigint): Promise<Hash> {
        return this.write(this.addresses.evaluator, evaluatorAbi, "escalateOnSilence", [
            this.addresses.instance,
            jobId,
        ]);
    }

    resolveMissingDeposit(jobId: bigint): Promise<Hash> {
        return this.write(this.addresses.evaluator, evaluatorAbi, "resolveMissingDeposit", [
            this.addresses.instance,
            jobId,
        ]);
    }

    resolveByDefault(jobId: bigint): Promise<Hash> {
        return this.write(this.addresses.evaluator, evaluatorAbi, "resolveByDefault", [this.addresses.instance, jobId]);
    }

    sweep(jobId: bigint): Promise<Hash> {
        return this.write(this.addresses.evaluator, evaluatorAbi, "sweep", [this.addresses.instance, jobId]);
    }

    withdrawFromEvaluator(token: Address, to?: Address): Promise<Hash> {
        return this.write(this.addresses.evaluator, evaluatorAbi, "withdraw", [token, to ?? this.sender()]);
    }

    /** Budget allowance for the instance. */
    approveBudget(amount: bigint): Promise<Hash> {
        return this.approveToken(this.addresses.instance, amount);
    }

    /** Evaluation fee, plus the client's dispute deposit when confirmation mode prepays it. */
    approveEvaluation(amount: bigint): Promise<Hash> {
        return this.approveToken(this.addresses.evaluator, amount);
    }

    async job(jobId: bigint): Promise<Job> {
        const row = await this.publicClient.readContract({
            address: this.addresses.instance,
            abi: coreAbi,
            functionName: "getJob",
            args: [jobId],
        });
        return {
            client: row.client,
            provider: row.provider,
            evaluator: row.evaluator,
            description: row.description,
            budget: row.budget,
            expiredAt: row.expiredAt,
            status: JOB_STATUS[row.status] ?? "Open",
            hook: row.hook,
        };
    }

    async status(jobId: bigint, wallet: Address): Promise<WalletStatus> {
        const job = await this.job(jobId);
        const config = await this.config(jobId);
        const [
            phase,
            reviewEnd,
            depositDeadline,
            disputeDeadline,
            fundedAt,
            clientDeposit,
            providerDeposit,
            feeHeld,
            block,
            instanceClaimable,
            evaluatorClaimable,
        ] = await Promise.all([
            this.readEvaluator("phase", jobId),
            this.readEvaluator("reviewEnd", jobId),
            this.readEvaluator("depositDeadlineOf", jobId),
            this.readEvaluator("disputeDeadlineOf", jobId),
            this.readEvaluator("fundedAt", jobId),
            this.readEvaluator("clientDepositOf", jobId),
            this.readEvaluator("providerDepositOf", jobId),
            this.readEvaluator("feeHeld", jobId),
            this.publicClient.getBlock(),
            this.publicClient.readContract({
                address: this.addresses.instance,
                abi: coreAbi,
                functionName: "claimable",
                args: [wallet],
            }),
            this.publicClient.readContract({
                address: this.addresses.evaluator,
                abi: evaluatorAbi,
                functionName: "claimable",
                args: [this.addresses.usdc, wallet],
            }),
        ]);
        return statusFor(wallet, {
            job,
            phase: PHASE[Number(phase)] as PhaseName,
            now: block.timestamp,
            reviewEnd,
            depositDeadline,
            disputeDeadline,
            fundedAt,
            submitWindow: config.submitWindow,
            autoCompleteOnSilence: config.autoCompleteOnSilence,
            arbiter: config.arbiter,
            disputeDeposit: config.disputeDeposit,
            maxExtension: config.maxExtension,
            clientDeposit,
            providerDeposit,
            feeHeld,
            instanceClaimable,
            evaluatorClaimable,
            configured: config.submitWindow > 0,
            evaluatorAddress: this.addresses.evaluator,
        });
    }

    async claimableOnInstance(account: Address): Promise<bigint> {
        return this.publicClient.readContract({
            address: this.addresses.instance,
            abi: coreAbi,
            functionName: "claimable",
            args: [account],
        });
    }

    async claimableOnEvaluator(token: Address, account: Address): Promise<bigint> {
        return this.publicClient.readContract({
            address: this.addresses.evaluator,
            abi: evaluatorAbi,
            functionName: "claimable",
            args: [token, account],
        });
    }

    signForwardRequest(request: Omit<ForwardRequest, "signature">): Promise<ForwardRequest> {
        return signForwardRequest(this.publicClient, this.requireWallet(), this.addresses.forwarder, request);
    }

    encodeForwarderExecute(request: ForwardRequest): Hex {
        return encodeExecute(request);
    }

    private async config(jobId: bigint): Promise<EvaluatorConfig> {
        const row = await this.publicClient.readContract({
            address: this.addresses.evaluator,
            abi: evaluatorAbi,
            functionName: "getConfig",
            args: [this.addresses.instance, jobId],
        });
        return {
            submitWindow: row.submitWindow,
            reviewWindow: row.reviewWindow,
            maxExtension: row.maxExtension,
            depositWindow: row.depositWindow,
            disputeWindow: row.disputeWindow,
            autoCompleteOnSilence: row.autoCompleteOnSilence,
            defaultComplete: row.defaultComplete,
            budgetLock: row.budgetLock,
            arbiter: row.arbiter,
            operator: row.operator,
            evaluationFee: row.evaluationFee,
            keeperTip: row.keeperTip,
            disputeDeposit: row.disputeDeposit,
        };
    }

    private readEvaluator<
        K extends
            | "phase"
            | "reviewEnd"
            | "depositDeadlineOf"
            | "disputeDeadlineOf"
            | "fundedAt"
            | "clientDepositOf"
            | "providerDepositOf"
            | "feeHeld"
    >(name: K, jobId: bigint) {
        return this.publicClient.readContract({
            address: this.addresses.evaluator,
            abi: evaluatorAbi,
            functionName: name,
            args: [this.addresses.instance, jobId],
        } as never) as Promise<bigint>;
    }

    private async assertEvaluatorHook(jobId: bigint): Promise<void> {
        const job = await this.job(jobId);
        const evaluator = getAddress(this.addresses.evaluator);
        if (getAddress(job.evaluator) !== evaluator || getAddress(job.hook) !== evaluator) {
            throw new Error("configure requires the job evaluator and hook to be the OptimisticEvaluator");
        }
    }

    private approveToken(spender: Address, amount: bigint): Promise<Hash> {
        return this.write(this.addresses.usdc, erc20Abi, "approve", [spender, amount]);
    }

    private async signPermit(
        spender: Address,
        value: bigint
    ): Promise<{ deadline: bigint; v: number; r: Hex; s: Hex }> {
        const wallet = this.requireWallet();
        const owner = this.sender();
        const token = this.addresses.usdc;
        let nonce: bigint;
        let name: string;
        try {
            [nonce, name] = await Promise.all([
                this.publicClient.readContract({
                    address: token,
                    abi: erc20Abi,
                    functionName: "nonces",
                    args: [owner],
                }),
                this.publicClient.readContract({ address: token, abi: erc20Abi, functionName: "name" }),
            ]);
        } catch {
            throw new Error("This token does not support permit");
        }
        const block = await this.publicClient.getBlock();
        const deadline = block.timestamp + 3600n;
        let version = "1";
        try {
            version = await this.publicClient.readContract({
                address: token,
                abi: parseAbi(["function version() view returns (string)"]),
                functionName: "version",
            });
        } catch {
            version = "1";
        }
        const signature = await wallet.signTypedData({
            account: wallet.account!,
            domain: { name, version, chainId: this.addresses.chainId, verifyingContract: token },
            types: PERMIT_TYPES,
            primaryType: "Permit",
            message: { owner, spender, value, nonce, deadline },
        });
        const parsed = parseSignature(signature);
        const v = parsed.v ?? (parsed.yParity === 0 ? 27 : 28);
        return { deadline, v: Number(v), r: parsed.r, s: parsed.s };
    }

    private async write(
        address: Address,
        abi: WriteAbi,
        functionName: string,
        args: readonly unknown[]
    ): Promise<Hash> {
        const wallet = this.requireWallet();
        try {
            const gasPrice = this.addresses.chainId === 80002 ? await amoyGasPrice(this.publicClient) : undefined;
            return await wallet.writeContract({
                address,
                abi,
                functionName,
                args,
                account: wallet.account,
                chain: wallet.chain,
                ...(gasPrice === undefined ? {} : { gasPrice }),
            } as never);
        } catch (error) {
            throw new Error(decodeOpusError(error));
        }
    }

    private requireWallet(): WalletClient {
        if (this.walletClient?.account === undefined) throw new Error("A WalletClient is required");
        return this.walletClient;
    }

    private sender(): Address {
        return this.requireWallet().account!.address;
    }
}

function configTuple(config: EvaluatorConfig) {
    return { ...config };
}

function sameAddress(a: string, b: string): boolean {
    return a.toLowerCase() === b.toLowerCase();
}
