import {
    AMOY_MIN_GAS_PRICE,
    encodeForwarderExecute,
    forwarderAbi,
    type ForwardRequest,
    type ProtocolAddresses,
} from "@opus/sdk";
import { getAddress, type Address, type Hash, type PublicClient, type WalletClient } from "viem";

import { GasBudget, RequestWindow, tokenMatches, type Integrator } from "./limits";
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

export const DEFAULT_MAX_GAS = 1_500_000n;

/**
 * Submits a signed `OpusForwarder` request and pays the gas.
 * The signer needs no POL. The gas wallet only calls the instance, factory, or evaluator.
 */
export class Relayer {
    private readonly windows = new Map<string, RequestWindow>();
    private readonly budgets = new Map<string, GasBudget>();
    private readonly integrators: ReadonlyMap<string, Integrator>;
    private nextNonce: number | undefined;
    private tail: Promise<void> = Promise.resolve();
    private readonly now: () => number;
    private readonly maxGas: bigint;
    private readonly receiptTimeoutMs: number;
    private readonly minBalanceWei: bigint;
    private readonly onBudgets: ((remaining: Record<string, bigint>) => void) | undefined;
    private readonly log: RelayLog;

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
        this.receiptTimeoutMs = options.receiptTimeoutMs ?? 120_000;
        this.minBalanceWei = options.minBalanceWei ?? 0n;
        this.onBudgets = options.onBudgets;
        this.log = options.log ?? (() => undefined);
        for (const integrator of options.integrators) {
            this.windows.set(integrator.id, new RequestWindow(integrator.maxRequests, integrator.windowSeconds, now));
            const restored = options.restoredBudgets?.[integrator.id];
            const left = restored === undefined || restored > integrator.budgetWei ? integrator.budgetWei : restored;
            this.budgets.set(integrator.id, new GasBudget(left < 0n ? 0n : left));
        }
        this.blocked = options.blocked;
    }

    private readonly blocked: ReadonlySet<Address>;

    async submit(request: ForwardRequest, integratorId: string, bearer: string): Promise<Hash> {
        const integrator = this.integrators.get(integratorId);
        if (integrator === undefined || !tokenMatches(integrator.token, bearer)) {
            throw new RelayRejected("The integrator is not allowed to relay");
        }
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

        return this.send(request, integratorId);
    }

    private async send(request: ForwardRequest, integratorId: string): Promise<Hash> {
        const run = this.tail.then(() => this.sendOnce(request, integratorId));
        this.tail = run.then(
            () => undefined,
            () => undefined
        );
        return run;
    }

    private async sendOnce(request: ForwardRequest, integratorId: string): Promise<Hash> {
        const budget = this.budgets.get(integratorId);
        if (budget === undefined) throw new RelayRejected("The integrator is not allowed to relay");
        const account = this.wallet.account;
        if (account === undefined) throw new Error("The relayer wallet has no account");
        const gasPrice = await this.gasPrice();
        const data = encodeForwarderExecute(request);
        const balance = await this.publicClient.getBalance({ address: getAddress(account.address) });
        const gas = await this.publicClient.estimateGas({
            account,
            to: this.addresses.forwarder,
            data,
            value: 0n,
            gasPrice,
        });
        const held = gas * gasPrice;
        if (balance < held + this.minBalanceWei) {
            this.log({ event: "low-balance", integrator: integratorId, balanceWei: balance.toString() });
            throw new RelayUnavailable("The relayer is out of gas funds");
        }
        if (!budget.hold(held)) throw new RelayRejected("The integrator budget is spent");
        this.changed();
        let sent: Hash | undefined;
        try {
            const nonce = await this.nonce();
            const hash = await this.wallet.sendTransaction({
                account,
                chain: this.wallet.chain,
                to: this.addresses.forwarder,
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
            this.changed();
            if (receipt.status !== "success") throw new RelayRejected("The forwarded call reverted");
            return hash;
        } catch (error) {
            this.nextNonce = undefined;
            if (error instanceof RelayRejected) throw error;
            // A sent transaction that is not yet in a block may still land and spend gas: keep the hold.
            if (sent !== undefined) throw new RelayPending(sent);
            budget.settle(held, 0n);
            this.changed();
            throw error;
        }
    }

    /** Gas left to each integrator, by id. */
    budgetsLeft(): Record<string, bigint> {
        return Object.fromEntries([...this.budgets].map(([id, budget]) => [id, budget.remaining]));
    }

    private changed(): void {
        this.onBudgets?.(this.budgetsLeft());
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
        if (this.addresses.chainId === 80002) return AMOY_MIN_GAS_PRICE;
        return this.publicClient.getGasPrice();
    }
}
