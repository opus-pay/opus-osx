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

export class RelayRejected extends Error {}

export type RelayerOptions = {
    integrators: readonly Integrator[];
    blocked: ReadonlySet<Address>;
    now?: () => number;
};

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

    constructor(
        private readonly publicClient: PublicClient,
        private readonly wallet: WalletClient,
        private readonly addresses: ProtocolAddresses,
        options: RelayerOptions
    ) {
        this.integrators = new Map(options.integrators.map((integrator) => [integrator.id, integrator]));
        const now = options.now ?? (() => Math.floor(Date.now() / 1000));
        for (const integrator of options.integrators) {
            this.windows.set(integrator.id, new RequestWindow(integrator.maxRequests, integrator.windowSeconds, now));
            this.budgets.set(integrator.id, new GasBudget(integrator.budgetWei));
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
        const gas = await this.publicClient.estimateGas({
            account,
            to: this.addresses.forwarder,
            data,
            value: 0n,
            gasPrice,
        });
        const held = gas * gasPrice;
        if (!budget.hold(held)) throw new RelayRejected("The integrator budget is spent");
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
            this.nextNonce = nonce + 1;
            const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
            budget.settle(held, receipt.gasUsed * receipt.effectiveGasPrice);
            if (receipt.status !== "success") throw new RelayRejected("The forwarded call reverted");
            return hash;
        } catch (error) {
            this.nextNonce = undefined;
            if (error instanceof RelayRejected) throw error;
            budget.settle(held, 0n);
            throw error;
        }
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
