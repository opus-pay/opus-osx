import { decodeEventLog, getAddress, zeroAddress, type Address, type Log, type PublicClient } from "viem";

import { indexAbi } from "./abi";
import type { SavedState } from "./state";
import { IndexStore } from "./store";

export type IndexAddresses = {
    factory: Address;
    instance: Address;
    evaluator: Address;
};

export type IndexerOptions = {
    /** Stay this many blocks behind the head, so a block that is replaced never enters the ledger. Default 0. */
    confirmations?: bigint;
    /** Blocks per log request. Default 2000. */
    step?: bigint;
    /** Called after each block range is in the ledger and the cursor has moved, e.g. to save state. */
    onProgress?: () => void;
};

/**
 * Pulls logs into the store. A later read uses the store alone.
 *
 * It watches the factory, the evaluator and every instance: the one in the address file and each one the
 * factory announces with `InstanceCreated`. A range of blocks goes in whole or not at all (the logs are
 * fetched first, applied after), so a failed request is retried without counting any event twice.
 */
export class Indexer {
    readonly store = new IndexStore();
    private cursor = 0n;
    private readonly confirmations: bigint;
    private readonly step: bigint;
    private readonly onProgress: (() => void) | undefined;
    private headBlock = 0n;
    private lastOk: number | undefined;

    constructor(
        private readonly client: PublicClient,
        private readonly addresses: IndexAddresses,
        fromBlock = 0n,
        options: IndexerOptions = {}
    ) {
        this.cursor = fromBlock;
        this.confirmations = options.confirmations ?? 0n;
        this.step = options.step ?? 2_000n;
        this.onProgress = options.onProgress;
    }

    /** Where the scan stands. `indexedTo` is the last block in the ledger (one before the cursor). */
    progress(): { head: bigint; indexedTo: bigint; lag: bigint; lastOkAt: number | undefined } {
        const indexedTo = this.cursor - 1n;
        return {
            head: this.headBlock,
            indexedTo,
            lag: this.headBlock > indexedTo ? this.headBlock - indexedTo : 0n,
            lastOkAt: this.lastOk,
        };
    }

    /** The ledger and the cursor, to save together. */
    snapshot(key: string): SavedState {
        return { version: 1, key, cursor: this.cursor, store: this.store.export() };
    }

    /** Continues from a saved state. */
    restore(state: SavedState): void {
        this.store.load(state.store);
        this.cursor = state.cursor;
    }

    async sync(toBlock?: bigint): Promise<number> {
        const before = this.store.applied;
        const head = await this.client.getBlockNumber({ cacheTime: 0 });
        this.headBlock = head;
        const target = toBlock ?? head - this.confirmations;
        let from = this.cursor;
        while (from <= target) {
            const end = from + this.step - 1n > target ? target : from + this.step - 1n;
            await this.readRange(from, end);
            from = end + 1n;
        }
        this.lastOk = Date.now();
        return this.store.applied - before;
    }

    private watched(): Address[] {
        const all = new Set<Address>([this.addresses.factory, this.addresses.evaluator, this.addresses.instance]);
        for (const created of this.store.instances()) all.add(created.instance);
        return [...all].map((address) => getAddress(address)).filter((address) => address !== zeroAddress);
    }

    private async readRange(from: bigint, to: bigint): Promise<void> {
        const watched = this.watched();
        if (watched.length === 0) throw new Error("The indexer has no contracts to watch");
        let logs = await this.client.getLogs({ address: watched, fromBlock: from, toBlock: to });

        // An instance announced inside this range has events in the same range that the request above did not
        // ask for. Fetch them now, before anything is applied.
        const known = new Set(watched);
        const newcomers = new Set<Address>();
        for (const log of logs) {
            const created = announced(log);
            if (created !== undefined && !known.has(created)) newcomers.add(created);
        }
        if (newcomers.size > 0) {
            const extra = await this.client.getLogs({ address: [...newcomers], fromBlock: from, toBlock: to });
            logs = logs.concat(extra);
        }

        logs.sort((a, b) => {
            const block = Number((a.blockNumber ?? 0n) - (b.blockNumber ?? 0n));
            return block !== 0 ? block : (a.logIndex ?? 0) - (b.logIndex ?? 0);
        });
        for (const log of logs) this.store.apply(log);
        this.cursor = to + 1n;
        this.onProgress?.();
    }
}

function announced(log: Log): Address | undefined {
    if (log.topics.length === 0) return undefined;
    try {
        const row = decodeEventLog({ abi: indexAbi, data: log.data, topics: log.topics });
        if (row.eventName !== "InstanceCreated") return undefined;
        return getAddress((row.args as { instance: Address }).instance);
    } catch {
        return undefined;
    }
}
