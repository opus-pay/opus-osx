import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { Wallet } from "ethers";
import { ethers, network } from "hardhat";
import {
    createPublicClient,
    createWalletClient,
    custom,
    encodeFunctionData,
    getAddress,
    keccak256,
    stringToBytes,
    zeroAddress,
    zeroHash,
    type Address,
    type Hash,
    type PublicClient,
} from "viem";

import { MockBlacklistToken, MockPermitToken, OpusForwarder } from "../../typechain-types";
import { testWallets } from "../helpers/acp";
import {
    coreAbi,
    descriptionOf,
    evaluatorAbi,
    forwarderAbi,
    loadAddresses,
    localHardhat,
    minimumExpiredAt,
    Opus,
    presetAiToAi,
    presetPersonToAny,
    presetSmallNoArbiter,
    tokenUnitsForUsd,
    type EvaluatorConfig,
    type ForwardRequest,
    type ProtocolAddresses,
} from "../../../sdk/src";

const BUDGET = tokenUnitsForUsd(100n, 6);
const FEE = tokenUnitsForUsd(1n, 6);
const DEPOSIT = tokenUnitsForUsd(1n, 6);

function units(amount: bigint) {
    return ethers.BigNumber.from(amount.toString());
}

async function rejected(run: Promise<unknown>): Promise<string> {
    try {
        await run;
    } catch (error) {
        return error instanceof Error ? error.message : String(error);
    }
    throw new Error("expected a revert");
}

describe("SDK on a local Hardhat node (#23)", () => {
    const wallets = testWallets();
    const [, operator, arbiter, relayer, client, provider] = wallets;

    async function world(kind: "MockPermitToken" | "MockBlacklistToken" = "MockPermitToken") {
        const tokenFactory = await ethers.getContractFactory(kind);
        const token = (await tokenFactory.deploy("USD Coin", "USDC", 6)) as MockPermitToken;
        await token.deployed();
        const forwarder = (await (await ethers.getContractFactory("OpusForwarder")).deploy()) as OpusForwarder;
        await forwarder.deployed();
        const core = await (
            await ethers.getContractFactory("OpusAgenticCommerce")
        ).deploy(token.address, 6, ethers.constants.AddressZero, 0, forwarder.address, ethers.constants.AddressZero);
        await core.deployed();
        const evaluator = await (await ethers.getContractFactory("OptimisticEvaluator")).deploy(forwarder.address);
        await evaluator.deployed();

        const addresses: ProtocolAddresses = {
            network: "hardhat",
            chainId: 31337,
            forwarder: getAddress(forwarder.address),
            factory: zeroAddress,
            usdc: getAddress(token.address),
            instance: getAddress(core.address),
            evaluator: getAddress(evaluator.address),
        };
        const transport = custom(network.provider);
        const publicClient = createPublicClient({ chain: localHardhat, transport });
        const asOpus = (account: Wallet) =>
            new Opus(
                publicClient,
                addresses,
                createWalletClient({ account: getAddress(account.address), chain: localHardhat, transport })
            );
        await token.mint(client.address, units(tokenUnitsForUsd(5_000n, 6)));
        await token.mint(provider.address, units(tokenUnitsForUsd(50n, 6)));
        return {
            token,
            forwarder,
            addresses,
            publicClient,
            client: asOpus(client),
            provider: asOpus(provider),
            keeper: asOpus(relayer),
        };
    }

    async function mine(publicClient: PublicClient, hash: Hash) {
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        expect(receipt.status).to.equal("success");
        return receipt;
    }

    async function create(opus: Opus, config: EvaluatorConfig, who: Address = getAddress(provider.address)) {
        const now = BigInt(await time.latest()) + 300n;
        return opus.createJob({
            provider: who,
            expiredAt: minimumExpiredAt(now, config),
            description: "please deliver the parcel",
        });
    }

    async function quoteAndFund(opus: Opus, publicClient: PublicClient, jobId: bigint, budget = BUDGET) {
        await mine(publicClient, await opus.quote(jobId, budget));
        await mine(publicClient, await opus.approveBudget(budget));
        await mine(publicClient, await opus.fund(jobId, budget));
    }

    it("matches compiled selectors and reads the Amoy address file", () => {
        const coreArtifact = require("../../artifacts/contracts/acp/OpusAgenticCommerce.sol/OpusAgenticCommerce.json");
        const evaluatorArtifact = require("../../artifacts/contracts/evaluators/OptimisticEvaluator.sol/OptimisticEvaluator.json");
        const forwarderArtifact = require("../../artifacts/contracts/forwarder/OpusForwarder.sol/OpusForwarder.json");
        const core = new ethers.utils.Interface(coreArtifact.abi);
        const evaluatorIface = new ethers.utils.Interface(evaluatorArtifact.abi);
        const forwarderIface = new ethers.utils.Interface(forwarderArtifact.abi);
        const zeroConfig = {
            submitWindow: 0,
            reviewWindow: 0,
            maxExtension: 0,
            depositWindow: 0,
            disputeWindow: 0,
            autoCompleteOnSilence: false,
            defaultComplete: false,
            budgetLock: 0,
            arbiter: zeroAddress,
            operator: zeroAddress,
            evaluationFee: 0n,
            keeperTip: 0n,
            disputeDeposit: 0n,
        };
        const checks: Array<[ethers.utils.Interface, readonly unknown[], string, readonly unknown[]]> = [
            [core, coreAbi, "createJob", [zeroAddress, zeroAddress, 0n, "", zeroAddress]],
            [core, coreAbi, "fund", [1n, 1n, "0x"]],
            [core, coreAbi, "fundWithPermit", [1n, 1n, "0x", 0n, 27, zeroHash, zeroHash]],
            [core, coreAbi, "submit", [1n, zeroHash, "0x"]],
            [evaluatorIface, evaluatorAbi, "configure", [zeroAddress, 1n, zeroConfig]],
            [
                evaluatorIface,
                evaluatorAbi,
                "configureWithPermit",
                [zeroAddress, 1n, zeroConfig, 0n, 27, zeroHash, zeroHash],
            ],
            [evaluatorIface, evaluatorAbi, "postDeposit", [zeroAddress, 1n]],
            [evaluatorIface, evaluatorAbi, "postDepositWithPermit", [zeroAddress, 1n, 0n, 27, zeroHash, zeroHash]],
            [evaluatorIface, evaluatorAbi, "object", [zeroAddress, 1n, zeroHash]],
            [evaluatorIface, evaluatorAbi, "extendReview", [zeroAddress, 1n, 1]],
            [evaluatorIface, evaluatorAbi, "withdrawAsProvider", [zeroAddress, 1n]],
            [evaluatorIface, evaluatorAbi, "timeoutNoSubmission", [zeroAddress, 1n]],
            [evaluatorIface, evaluatorAbi, "finalize", [zeroAddress, 1n]],
            [evaluatorIface, evaluatorAbi, "escalateOnSilence", [zeroAddress, 1n]],
            [evaluatorIface, evaluatorAbi, "resolveMissingDeposit", [zeroAddress, 1n]],
            [evaluatorIface, evaluatorAbi, "resolveByDefault", [zeroAddress, 1n]],
            [evaluatorIface, evaluatorAbi, "sweep", [zeroAddress, 1n]],
            [
                forwarderIface,
                forwarderAbi,
                "execute",
                [{ from: zeroAddress, to: zeroAddress, value: 0n, gas: 0n, deadline: 0, data: "0x", signature: "0x" }],
            ],
        ];
        for (const [iface, abi, name, args] of checks) {
            const data = encodeFunctionData({ abi, functionName: name, args } as never);
            expect(data.slice(0, 10)).to.equal(iface.getSighash(name));
        }
        const amoy = loadAddresses(require("fs").readFileSync("deploy/amoy/addresses.json", "utf8"));
        expect(amoy.chainId).to.equal(80002);
        expect(amoy.instance).to.equal(getAddress("0x7632d054BfE635A1f0394fbcd74678B6567213Fd"));
    });

    it("approves a funded job and returns the evaluation fee after expiry", async () => {
        const { client: opus, provider: worker, keeper, publicClient, addresses, token } = await world();
        const config = presetAiToAi({ operator: getAddress(operator.address), evaluationFee: FEE });

        const approved = await create(opus, config);
        expect((await opus.job(approved)).description).to.equal(descriptionOf("please deliver the parcel"));
        await mine(publicClient, await opus.approveEvaluation(FEE));
        await mine(publicClient, await opus.configure(approved, config));
        await mine(publicClient, await opus.quote(approved, BUDGET));
        expect(await rejected(opus.fund(approved, 1n))).to.match(/does not match the agreed budget/);
        await mine(publicClient, await opus.approveBudget(BUDGET));
        await mine(publicClient, await opus.fund(approved, BUDGET));
        expect(await rejected(worker.submit(approved, zeroHash, 1n))).to.match(/agreed budget/);
        await mine(publicClient, await worker.submit(approved, zeroHash, BUDGET));
        const submitted = await opus.status(approved, getAddress(client.address));
        expect(submitted.actions).to.include("approve");
        await mine(publicClient, await opus.approve(approved));
        expect((await opus.job(approved)).status).to.equal("Completed");
        expect(await token.balanceOf(operator.address)).to.equal(units(FEE));

        const expired = await create(opus, config);
        await mine(publicClient, await opus.approveEvaluation(FEE));
        await mine(publicClient, await opus.configure(expired, config));
        await quoteAndFund(opus, publicClient, expired);
        const job = await opus.job(expired);
        await time.increaseTo(job.expiredAt);
        await mine(publicClient, await keeper.claimRefund(expired));
        expect((await keeper.status(expired, getAddress(relayer.address))).actions).to.include("sweep");
        const before = await token.balanceOf(client.address);
        await mine(publicClient, await keeper.sweep(expired));
        expect(await token.balanceOf(client.address)).to.equal(before.add(units(FEE)));
        expect(addresses.evaluator).to.not.equal(zeroAddress);
    });

    it("funds and configures with permit", async () => {
        const { client: opus, publicClient } = await world();
        const config = presetAiToAi({ operator: getAddress(operator.address), evaluationFee: FEE });
        const jobId = await create(opus, config);
        await mine(publicClient, await opus.configureWithPermit(jobId, config));
        await mine(publicClient, await opus.quote(jobId, BUDGET));
        await mine(publicClient, await opus.fundWithPermit(jobId, BUDGET));
        expect((await opus.job(jobId)).status).to.equal("Funded");
    });

    it("refuses configure unless the hook is the evaluator", async () => {
        const { client: opus, publicClient } = await world();
        const config = presetSmallNoArbiter({ operator: getAddress(operator.address) });
        const now = BigInt(await time.latest()) + 300n;
        const jobId = await opus.createJob({
            provider: getAddress(provider.address),
            evaluator: getAddress(client.address),
            hook: zeroAddress,
            expiredAt: minimumExpiredAt(now, config),
            description: "ipfs://job/plain",
        });
        expect(await rejected(opus.configure(jobId, config))).to.match(/OptimisticEvaluator/);
        const viewed = await opus.status(jobId, getAddress(client.address));
        expect(viewed.warnings.join(" ")).to.match(/evaluator is the client/);
        expect(publicClient.chain?.id).to.equal(31337);
    });

    it("finalizes silence, times out a missing delivery, and lets the provider withdraw", async () => {
        const { client: opus, provider: worker, keeper, publicClient } = await world();
        const config = presetAiToAi({ operator: getAddress(operator.address) });

        const silent = await create(opus, config);
        await mine(publicClient, await opus.configure(silent, config));
        await quoteAndFund(opus, publicClient, silent);
        await mine(publicClient, await worker.submit(silent, zeroHash, BUDGET));
        const reviewEnd = (await opus.status(silent, getAddress(client.address))).nextDeadline!;
        await time.increaseTo(reviewEnd);
        expect((await keeper.status(silent, getAddress(relayer.address))).actions).to.include("finalize");
        await mine(publicClient, await keeper.finalize(silent));
        expect((await opus.job(silent)).status).to.equal("Completed");

        const missing = await create(opus, config);
        await mine(publicClient, await opus.configure(missing, config));
        await quoteAndFund(opus, publicClient, missing);
        const due = (await opus.status(missing, getAddress(relayer.address))).nextDeadline!;
        await time.increaseTo(due);
        expect((await keeper.status(missing, getAddress(relayer.address))).actions).to.include("timeoutNoSubmission");
        await mine(publicClient, await keeper.timeoutNoSubmission(missing));
        expect((await opus.job(missing)).status).to.equal("Rejected");

        const left = await create(opus, config);
        await mine(publicClient, await opus.configure(left, config));
        await quoteAndFund(opus, publicClient, left);
        await mine(publicClient, await worker.withdrawAsProvider(left));
        expect((await opus.job(left)).status).to.equal("Rejected");
    });

    it("handles confirmation: extend, object, permit deposit, default, silence, and a missing deposit", async () => {
        const { client: opus, provider: worker, keeper, publicClient, token } = await world();
        const config = presetPersonToAny({
            operator: getAddress(operator.address),
            arbiter: getAddress(arbiter.address),
            evaluationFee: FEE,
            disputeDeposit: DEPOSIT,
        });

        const disputed = await create(opus, config);
        await mine(publicClient, await opus.approveEvaluation(FEE + DEPOSIT));
        await mine(publicClient, await opus.configure(disputed, config));
        await quoteAndFund(opus, publicClient, disputed);
        await mine(publicClient, await worker.submit(disputed, zeroHash, BUDGET));
        await mine(publicClient, await opus.extendReview(disputed, 3600));
        await mine(publicClient, await opus.object(disputed, keccak256(stringToBytes("evidence"))));
        await mine(publicClient, await worker.postDepositWithPermit(disputed));
        const disputeDeadline = (await opus.status(disputed, getAddress(relayer.address))).nextDeadline!;
        await time.increaseTo(disputeDeadline);
        expect((await keeper.status(disputed, getAddress(relayer.address))).actions).to.include("resolveByDefault");
        await mine(publicClient, await keeper.resolveByDefault(disputed));
        expect((await opus.job(disputed)).status).to.equal("Completed");

        const quiet = await create(opus, config);
        await mine(publicClient, await opus.approveEvaluation(FEE + DEPOSIT));
        await mine(publicClient, await opus.configure(quiet, config));
        await quoteAndFund(opus, publicClient, quiet);
        await mine(publicClient, await worker.submit(quiet, zeroHash, BUDGET));
        await time.increaseTo((await opus.status(quiet, getAddress(relayer.address))).nextDeadline!);
        expect((await keeper.status(quiet, getAddress(relayer.address))).actions).to.include("escalateOnSilence");
        await mine(publicClient, await keeper.escalateOnSilence(quiet));
        await time.increaseTo((await keeper.status(quiet, getAddress(relayer.address))).nextDeadline!);
        expect((await keeper.status(quiet, getAddress(relayer.address))).actions).to.include("resolveMissingDeposit");
        await mine(publicClient, await keeper.resolveMissingDeposit(quiet));
        expect((await opus.job(quiet)).status).to.equal("Rejected");

        const direct = await create(opus, presetSmallNoArbiter({ operator: getAddress(operator.address) }));
        await mine(
            publicClient,
            await opus.configure(direct, presetSmallNoArbiter({ operator: getAddress(operator.address) }))
        );
        await quoteAndFund(opus, publicClient, direct);
        await mine(publicClient, await worker.submit(direct, zeroHash, BUDGET));
        await mine(publicClient, await opus.object(direct, keccak256(stringToBytes("no arbiter"))));
        expect((await keeper.status(direct, getAddress(relayer.address))).actions).to.include("resolveByDefault");
        await mine(publicClient, await keeper.resolveByDefault(direct));
        expect(await token.balanceOf(provider.address)).to.be.gt(0);
    });

    it("sets the provider after creation and pays a deferred balance", async () => {
        const env = await world("MockBlacklistToken");
        const token = env.token as unknown as MockBlacklistToken;
        const config = presetAiToAi({ operator: getAddress(operator.address), evaluationFee: FEE });
        const now = BigInt(await time.latest()) + 300n;
        const jobId = await env.client.createJob({
            expiredAt: minimumExpiredAt(now, config),
            description: "ipfs://later",
        });
        expect((await env.client.status(jobId, getAddress(client.address))).actions).to.include("setProvider");
        await mine(env.publicClient, await env.client.setProvider(jobId, getAddress(provider.address)));
        await mine(env.publicClient, await env.client.approveEvaluation(FEE));
        await mine(env.publicClient, await env.client.configure(jobId, config));
        await quoteAndFund(env.client, env.publicClient, jobId);
        await mine(env.publicClient, await env.provider.submit(jobId, zeroHash, BUDGET));
        await token.setBlacklisted(provider.address, true);
        await token.setBlacklisted(operator.address, true);
        await mine(env.publicClient, await env.client.approve(jobId));
        expect(await env.provider.claimableOnInstance(getAddress(provider.address))).to.equal(BUDGET);
        expect(await env.client.claimableOnEvaluator(env.addresses.usdc, getAddress(operator.address))).to.equal(FEE);
        await token.setBlacklisted(provider.address, false);
        await token.setBlacklisted(operator.address, false);
        const operatorSdk = new Opus(
            env.publicClient,
            env.addresses,
            createWalletClient({
                account: getAddress(operator.address),
                chain: localHardhat,
                transport: custom(network.provider),
            })
        );
        await mine(env.publicClient, await env.provider.withdrawFromInstance());
        await mine(env.publicClient, await operatorSdk.withdrawFromEvaluator(env.addresses.usdc));
        expect(await token.balanceOf(provider.address)).to.equal(units(tokenUnitsForUsd(150n, 6)));
        expect(await token.balanceOf(operator.address)).to.equal(units(FEE));
    });

    it("signs an OpusForwarder request the relayer can execute", async () => {
        const { client: opus, forwarder, addresses, publicClient } = await world();
        const config = presetAiToAi({ operator: getAddress(operator.address) });
        const now = BigInt(await time.latest()) + 300n;
        const data = encodeFunctionData({
            abi: coreAbi,
            functionName: "createJob",
            args: [
                getAddress(provider.address),
                addresses.evaluator,
                minimumExpiredAt(now, config),
                "ipfs://forwarded",
                addresses.evaluator,
            ],
        });
        const signed: ForwardRequest = await opus.signForwardRequest({
            from: getAddress(client.address),
            to: addresses.instance,
            value: 0n,
            gas: 1_000_000n,
            deadline: Number(now),
            data,
        });
        expect(opus.encodeForwarderExecute(signed).startsWith("0x")).to.equal(true);
        await forwarder.connect(relayer).execute({
            from: signed.from,
            to: signed.to,
            value: signed.value,
            gas: signed.gas,
            deadline: signed.deadline,
            data: signed.data,
            signature: signed.signature,
        });
        const job = await opus.job(1n);
        expect(job.client).to.equal(getAddress(client.address));
        expect(job.description).to.equal("ipfs://forwarded");
        expect(publicClient).to.not.equal(undefined);
    });

    it("posts a deposit with an allowance as well as permit", async () => {
        const { client: opus, provider: worker, publicClient, token } = await world();
        const config = presetPersonToAny({
            operator: getAddress(operator.address),
            arbiter: getAddress(arbiter.address),
            disputeDeposit: DEPOSIT,
        });
        const jobId = await create(opus, config);
        await mine(publicClient, await opus.approveEvaluation(DEPOSIT));
        await mine(publicClient, await opus.configure(jobId, config));
        await quoteAndFund(opus, publicClient, jobId);
        await mine(publicClient, await worker.submit(jobId, zeroHash, BUDGET));
        await mine(publicClient, await opus.object(jobId, zeroHash));
        await token.connect(provider).approve(opus.addresses.evaluator, units(DEPOSIT));
        await mine(publicClient, await worker.postDeposit(jobId));
        const after = await opus.status(jobId, getAddress(client.address));
        expect(after.phase).to.equal("ArbiterPending");
    });
});
