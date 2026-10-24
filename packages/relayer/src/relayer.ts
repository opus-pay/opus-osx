import {
    amoyGasPrice,
    encodeForwarderExecute,
    forwarderAbi,
    type ForwardRequest,
    type ProtocolAddresses,
    usesTipFloor,
} from "@opus/sdk";
import {
    encodeFunctionData,
    getAddress,
    parseAbi,
    type Address,
    type Hash,
    type Hex,
    type PublicClient,
    type WalletClient,
} from "viem";

import { GasBudget, RequestWindow, SignerLimits, tokenMatches, type Integrator } from "./limits";
import { isSanctioned } from "./sanctions";
import { allowedTarget } from "./targets";

/** The request is refused: a rule, a limit or a bad signature. The sender can read the reason. */
export class RelayRejected extends Error {}

/** The relayer cannot serve right now (for example its gas wallet is nearly empty). Not the sender's fault. */
export class RelayUnavailable extends Error {}

/** The transaction was sent but not seen in a block in time. It may still land; the gas stays held. */
export class RelayPending extends Error {
    constructor(readonly hash: Hash) {
        super("The transaction was sent but is not confirmed yet");
    }
}

/** One line per finished request, with no secrets in it. */
export type RelayLog = (entry: Record<string, unknown>) => void;

export type RelayerOptions = {
    integrators: readonly Integrator[];
    blocked: ReadonlySet<Address>;
    /** Seconds. */
    now?: () => number;
    /** The most gas one request may ask for. Default 1,500,000. */
    maxGas?: bigint;
    /** The most a permit may open, in token units. Default 1,000 USDC. */
    maxPermitValue?: bigint;
    /** How long from now a permit may stay valid, in seconds. Default one hour. */
    maxPermitSeconds?: number;
    /** How long to wait for a block before answering "pending". Default 120 s. */
    receiptTimeoutMs?: number;
    /** The gas wallet keeps at least this much; below it the relayer says it is unavailable. Default 0. */
    minBalanceWei?: bigint;
    /** Budgets left from an earlier run, by integrator id. Never more than the configured budget. */
    restoredBudgets?: Readonly<Record<string, bigint>>;
    /** Called after every change to the budgets so they can be kept across restarts. */
    onBudgets?: (remaining: Record<string, bigint>) => void;
    log?: RelayLog;
};

/** One transaction the gas wallet sends: the call, and who signed it (their limits are charged). */
type Call = { to: Address; data: Hex; signer: Address };

export const DEFAULT_MAX_GAS = 1_500_000n;
/** A permit may open an allowance of at most 1,000 USDC (6 decimals) and lives at most an hour. */
export const DEFAULT_MAX_PERMIT_VALUE = 1_000_000_000n;
export const DEFAULT_MAX_PERMIT_SECONDS = 3600;

const PERMIT_ABI = parseAbi([
    "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
]);

/**
 * A signed EIP-2612 permit: the owner lets `spender` take up to `value` of the token. Anyone may send it, which is how
 * the owner needs no POL for an approval. `v` is 27 or 28.
 */
export type PermitRequest = {
    owner: Address;
    spender: Address;
    value: bigint;
    deadline: number;
    v: number;
    r: Hex;
    s: Hex;
};

/**
 * Submits a signed `OpusForwarder` request and pays the gas.
 * The signer needs no POL. The gas wallet only calls the instance, factory, or evaluator.
 */
export class Relayer {
    private readonly windows = new Map<string, RequestWindow>();
    private readonly budgets = new Map<string, GasBudget>();
    private readonly signers = new Map<string, SignerLimits>();
    private readonly integrators: ReadonlyMap<string, Integrator>;
    private nextNonce: number | undefined;
    private tail: Promise<void> = Promise.resolve();
    private readonly now: () => number;
    private readonly maxGas: bigint;
    private readonly maxPermitValue: bigint;
    private readonly maxPermitSeconds: number;
    private readonly receiptTimeoutMs: number;
    private readonly minBalanceWei: bigint;
    private readonly onBudgets: ((remaining: Record<string, bigint>) => void) | undefined;
    private readonly log: RelayLog;
    private stateFailing = false;

    constructor(
        private readonly publicClient: PublicClient,
        private readonly wallet: WalletClient,
        private readonly addresses: ProtocolAddresses,
        options: RelayerOptions
    ) {
        this.integrators = new Map(options.integrators.map((integrator) => [integrator.id, integrator]));
        const now = options.now ?? (() => Math.floor(Date.now() / 1000));
        this.now = now;
        this.maxGas = options.maxGas ?? DEFAULT_MAX_GAS;
        this.maxPermitValue = options.maxPermitValue ?? DEFAULT_MAX_PERMIT_VALUE;
        this.maxPermitSeconds = options.maxPermitSeconds ?? DEFAULT_MAX_PERMIT_SECONDS;
        this.receiptTimeoutMs = options.receiptTimeoutMs ?? 120_000;
        this.minBalanceWei = options.minBalanceWei ?? 0n;
        this.onBudgets = options.onBudgets;
        this.log = options.log ?? (() => undefined);
        for (const integrator of options.integrators) {
            this.windows.set(integrator.id, new RequestWindow(integrator.maxRequests, integrator.windowSeconds, now));
            if (integrator.signer !== undefined)
                this.signers.set(integrator.id, new SignerLimits(integrator.signer, now));
            const restored = options.restoredBudgets?.[integrator.id];
            const left = restored === undefined || restored > integrator.budgetWei ? integrator.budgetWei : restored;
            this.budgets.set(integrator.id, new GasBudget(left < 0n ? 0n : left));
        }
        this.blocked = options.blocked;
    }

    private readonly blocked: ReadonlySet<Address>;

    private authorize(integratorId: string, bearer: string): void {
        const integrator = this.integrators.get(integratorId);
        if (integrator === undefined || (!integrator.public && !tokenMatches(integrator.token, bearer))) {
            throw new RelayRejected("The integrator is not allowed to relay");
        }
    }

    /**
     * Sends a signed permit to the token, so its owner approves a contract without POL. Only the OPUS contracts of the
     * deployment may be the spender, the amount and the time are bounded, and the token must accept the signature
     * (checked before any gas is held). The same rate, signer and budget limits as `submit` apply.
     */
    async submitPermit(permit: PermitRequest, integratorId: string, bearer: string): Promise<Hash> {
        this.authorize(integratorId, bearer);
        if (!allowedTarget(this.addresses, permit.spender)) {
            throw new RelayRejected("The permit spender is not a known OPUS contract");
        }
        if (permit.value <= 0n) throw new RelayRejected("The permit opens nothing");
        if (permit.value > this.maxPermitValue)
            throw new RelayRejected("The permit opens more than the relayer allows");
        const now = this.now();
        if (permit.deadline <= now) throw new RelayRejected("The permit has expired");
        if (permit.deadline > now + this.maxPermitSeconds) {
            throw new RelayRejected("The permit stays valid longer than the relayer allows");
        }
        if (isSanctioned(this.blocked, permit.owner)) throw new RelayRejected("The signer is on the sanctions list");
        const window = this.windows.get(integratorId);
        if (window === undefined || !window.allow()) throw new RelayRejected("The integrator rate limit is spent");

        const data = encodeFunctionData({
            abi: PERMIT_ABI,
            functionName: "permit",
            args: [
                getAddress(permit.owner),
                getAddress(permit.spender),
                permit.value,
                BigInt(permit.deadline),
                permit.v,
                permit.r,
                permit.s,
            ],
        });
        const account = this.wallet.account;
        if (account === undefined) throw new Error("The relayer wallet has no account");
        // A bad signature, a used nonce or a token without permit reverts here, before anything is held or sent.
        try {
            await this.publicClient.estimateGas({ account, to: this.addresses.usdc, data, value: 0n });
        } catch {
            throw new RelayRejected("The token rejected the permit");
        }
        const signerLimits = this.signers.get(integratorId);
        if (signerLimits !== undefined && !signerLimits.admit(getAddress(permit.owner))) {
            throw new RelayRejected("The signer rate limit is spent");
        }
        return this.send({ to: this.addresses.usdc, data, signer: getAddress(permit.owner) }, integratorId);
    }

    async submit(request: ForwardRequest, integratorId: string, bearer: string): Promise<Hash> {
        this.authorize(integratorId, bearer);
        if (request.value !== 0n) throw new RelayRejected("The relayer does not forward native value");
        if (!allowedTarget(this.addresses, request.to)) {
            throw new RelayRejected("The call target is not a known OPUS contract");
        }
        if (isSanctioned(this.blocked, request.from)) throw new RelayRejected("The signer is on the sanctions list");
        if (request.gas > this.maxGas) throw new RelayRejected("The request asks for more gas than the relayer allows");
        if (request.deadline <= this.now()) throw new RelayRejected("The forward request has expired");
        const window = this.windows.get(integratorId);
        if (window === undefined || !window.allow()) throw new RelayRejected("The integrator rate limit is spent");

        const valid = await this.publicClient.readContract({
            address: this.addresses.forwarder,
            abi: forwarderAbi,
            functionName: "verify",
            args: [request],
        });
        if (!valid) throw new RelayRejected("The forwarder rejected the signature");
        // The signature is good, so `from` is really the signer: now count them against their own limit.
        const signerLimits = this.signers.get(integratorId);
        if (signerLimits !== undefined && !signerLimits.admit(getAddress(request.from))) {
            throw new RelayRejected("The signer rate limit is spent");
        }

        return this.send(
            { to: this.addresses.forwarder, data: encodeForwarderExecute(request), signer: getAddress(request.from) },
            integratorId
        );
    }

    private async send(call: Call, integratorId: string): Promise<Hash> {
        const run = this.tail.then(() => this.sendOnce(call, integratorId));
        this.tail = run.then(
            () => undefined,
            () => undefined
        );
        return run;
    }

    private async sendOnce(call: Call, integratorId: string): Promise<Hash> {
        const budget = this.budgets.get(integratorId);
        if (budget === undefined) throw new RelayRejected("The integrator is not allowed to relay");
        const account = this.wallet.account;
        if (account === undefined) throw new Error("The relayer wallet has no account");
        const gasPrice = await this.gasPrice();
        const { data } = call;
        const balance = await this.publicClient.getBalance({ address: getAddress(account.address) });
        const gas = await this.publicClient.estimateGas({
            account,
            to: call.to,
            data,
            value: 0n,
            gasPrice,
        });
        const held = gas * gasPrice;
        if (balance < held + this.minBalanceWei) {
            this.log({ event: "low-balance", integrator: integratorId, balanceWei: balance.toString() });
            throw new RelayUnavailable("The relayer is out of gas funds");
        }
        const signerLimits = this.signers.get(integratorId);
        const signer = call.signer;
        if (signerLimits !== undefined && !signerLimits.holdGas(signer, held)) {
            throw new RelayRejected("The signer gas limit is spent");
        }
        if (!budget.hold(held)) {
            signerLimits?.settleGas(signer, held, 0n);
            throw new RelayRejected("The integrator budget is spent");
        }
        this.changed();
        let sent: Hash | undefined;
        try {
            const nonce = await this.nonce();
            const hash = await this.wallet.sendTransaction({
                account,
                chain: this.wallet.chain,
                to: call.to,
                data,
                value: 0n,
                gas,
                gasPrice,
                nonce,
            });
            sent = hash;
            this.nextNonce = nonce + 1;
            const receipt = await this.publicClient.waitForTransactionReceipt({
                hash,
                timeout: this.receiptTimeoutMs,
            });
            budget.settle(held, receipt.gasUsed * receipt.effectiveGasPrice);
            signerLimits?.settleGas(signer, held, receipt.gasUsed * receipt.effectiveGasPrice);
            this.changed();
            if (receipt.status !== "success") throw new RelayRejected("The forwarded call reverted");
            return hash;
        } catch (error) {
            this.nextNonce = undefined;
            if (error instanceof RelayRejected) throw error;
            // A sent transaction that is not yet in a block may still land and spend gas: keep the hold.
            if (sent !== undefined) throw new RelayPending(sent);
            budget.settle(held, 0n);
            signerLimits?.settleGas(signer, held, 0n);
            this.changed();
            throw error;
        }
    }

    /** Gas left to each integrator, by id. */
    budgetsLeft(): Record<string, bigint> {
        return Object.fromEntries([...this.budgets].map(([id, budget]) => [id, budget.remaining]));
    }

    /** The gas budget each integrator was given, by id (what `budgetsLeft` counts down from). */
    budgetsConfigured(): Record<string, bigint> {
        return Object.fromEntries([...this.integrators].map(([id, integrator]) => [id, integrator.budgetWei]));
    }

    /**
     * Keeps the budgets across restarts. Failing to write them (a folder the process may not write to) must not fail a
     * request that is fine: the budgets go on in memory, the first failure is logged and `stateWriteFailing()` says it
     * for the metrics, so someone fixes the folder before a restart hands out full budgets again.
     */
    private changed(): void {
        if (this.onBudgets === undefined) return;
        try {
            this.onBudgets(this.budgetsLeft());
            this.stateFailing = false;
        } catch (error) {
            if (!this.stateFailing)
                this.log({
                    event: "state-write-failed",
                    reason: error instanceof Error ? error.message.split("\n")[0] : String(error),
                });
            this.stateFailing = true;
        }
    }

    /** Whether the budgets could not be written the last time: they only live in memory until this is false again. */
    stateWriteFailing(): boolean {
        return this.stateFailing;
    }

    /** Resolves when every request already accepted has finished. Used to stop without cutting one off. */
    async idle(): Promise<void> {
        await this.tail;
    }

    /** The gas wallet's balance, or an error if the node cannot be reached. */
    async walletBalance(): Promise<{ address: Address; balanceWei: bigint; minBalanceWei: bigint }> {
        const account = this.wallet.account;
        if (account === undefined) throw new Error("The relayer wallet has no account");
        const address = getAddress(account.address);
        return {
            address,
            balanceWei: await this.publicClient.getBalance({ address }),
            minBalanceWei: this.minBalanceWei,
        };
    }

    private async nonce(): Promise<number> {
        if (this.nextNonce !== undefined) return this.nextNonce;
        const account = this.wallet.account;
        if (account === undefined) throw new Error("The relayer wallet has no account");
        return this.publicClient.getTransactionCount({ address: getAddress(account.address), blockTag: "pending" });
    }

    private async gasPrice(): Promise<bigint> {
        if (usesTipFloor(this.addresses.chainId)) return amoyGasPrice(this.publicClient);
        return this.publicClient.getGasPrice();
    }
}
