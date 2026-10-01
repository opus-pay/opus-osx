import { getAddress, zeroAddress, type Address, type PublicClient } from "viem";

import { IndexStore } from "./store";

export type IndexAddresses = {
    factory: Address;
    instance: Address;
    evaluator: Address;
};

const STEP = 2_000n;

/** Pulls logs into the store. A later read uses the store alone. */
export class Indexer {
    readonly store = new IndexStore();
    private cursor = 0n;

    constructor(
        private readonly client: PublicClient,
        private readonly addresses: IndexAddresses,
        fromBlock = 0n
    ) {
        this.cursor = fromBlock;
    }

    async sync(toBlock?: bigint): Promise<number> {
        const before = this.store.applied;
        const target = toBlock ?? (await this.client.getBlockNumber({ cacheTime: 0 }));
        const watched = [this.addresses.factory, this.addresses.instance, this.addresses.evaluator].filter(
            (address) => getAddress(address) !== zeroAddress
        );
        if (watched.length === 0) throw new Error("The indexer has no contracts to watch");
        let from = this.cursor;
        while (from <= target) {
            const end = from + STEP - 1n > target ? target : from + STEP - 1n;
            const logs = await this.client.getLogs({ address: watched, fromBlock: from, toBlock: end });
            for (const log of logs) this.store.apply(log);
            from = end + 1n;
        }
        this.cursor = target + 1n;
        return this.store.applied - before;
    }
}
