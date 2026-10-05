import { decodeEventLog, getAddress, zeroAddress, type Address, type Log, type PublicClient } from "viem";

import { indexAbi } from "./abi";
import { MemoryLedger, type Ledger } from "./ledger";
import { IndexStore, REORG_WINDOW } from "./store";

export type IndexAddresses = {
    factory: Address;
    instance: Address;
    evaluator: Address;
};

export type IndexerOptions = {
    /** Stay this many blocks behind the head, so a block that is replaced rarely enters the ledger. Default 0. */
    confirmations?: bigint;
    /** Blocks per log request. Default 2000. */
    step?: bigint;
    /** Where the ledger lives. Default: memory. */
    ledger?: Ledger;
    /** Called when a replaced block is found: the last block still on the chain, and how many were taken back. */
    onReorg?: (fork: bigint, from: bigint) => void;
};

/**
 * Pulls logs into the store. A later read uses the store alone.
 *
 * It watches the factory, the evaluator and every instance: the one in the address file and each one the factory
 * announces. A range of blocks goes in whole or not at all, so a failed request is retried without counting any
 * event twice. It remembers the hash of the last block of each range; if the chain later shows another block there
 * (a reorganisation), it takes the changes of the replaced blocks back out and reads the new ones.
 */
export class Indexer {
    readonly store: IndexStore;
    private readonly confirmations: bigint;
    private readonly step: bigint;
    private readonly onReorg: ((fork: bigint, from: bigint) => void) | undefined;
    private startAt: bigint;
    private headBlock = 0n;
    private lastOk: number | undefined;
    private cursorNow = 0n;

    constructor(
        private readonly client: PublicClient,
        private readonly addresses: IndexAddresses,
        fromBlock = 0n,
        options: IndexerOptions = {}
    ) {
        this.store = new IndexStore(options.ledger ?? new MemoryLedger());
        this.startAt = fromBlock;
        this.cursorNow = fromBlock;
        this.confirmations = options.confirmations ?? 0n;
        this.step = options.step ?? 2_000n;
        this.onReorg = options.onReorg;
    }

    /** Reads where an earlier run stopped, so `progress()` is right before the first sync. */
    async load(): Promise<void> {
        this.cursorNow = (await this.store.cursor()) ?? this.startAt;
    }

    /** Where the scan stands. `indexedTo` is the last block in the ledger (one before the cursor). */
    progress(): { head: bigint; indexedTo: bigint; lag: bigint; lastOkAt: number | undefined } {
        const indexedTo = this.cursorNow - 1n;
        return {
            head: this.headBlock,
            indexedTo,
            lag: this.headBlock > indexedTo ? this.headBlock - indexedTo : 0n,
            lastOkAt: this.lastOk,
        };
    }

    async sync(toBlock?: bigint): Promise<number> {
        const before = await this.store.applied();
        let cursor = (await this.store.cursor()) ?? this.startAt;
        const head = await this.client.getBlockNumber({ cacheTime: 0 });
        this.headBlock = head;

        // Is the last block we took in still on the chain? If not, take back what the replaced blocks added.
        cursor = await this.checkReorg(cursor);

        const target = toBlock ?? head - this.confirmations;
        let from = cursor;
        while (from <= target) {
            const end = from + this.step - 1n > target ? target : from + this.step - 1n;
            await this.readRange(from, end);
            from = end + 1n;
            this.cursorNow = from;
        }
        this.cursorNow = from > cursor ? from : cursor;
        this.lastOk = Date.now();
        return (await this.store.applied()) - before;
    }

    private async checkReorg(cursor: bigint): Promise<bigint> {
        const known = (await this.store.ledger.hashes()).reverse();
        if (known.length === 0) return cursor;
        // Newest first: the first one the chain still agrees with is where the two histories part.
        let fork: bigint | undefined;
        let replaced = false;
        for (const seen of known) {
            const block = await this.client.getBlock({ blockNumber: seen.block });
            if (block.hash === seen.hash) {
                fork = seen.block;
                break;
            }
            replaced = true;
        }
        if (!replaced) return cursor;
        if (fork === undefined) {
            throw new Error(
                `The chain changed deeper than the last ${REORG_WINDOW} blocks the indexer remembers; start it from scratch`
            );
        }
        await this.store.rewind(fork);
        this.onReorg?.(fork, cursor);
        return fork + 1n;
    }

    private async watched(): Promise<Address[]> {
        const all = new Set<Address>([this.addresses.factory, this.addresses.evaluator, this.addresses.instance]);
        for (const created of (await this.store.instances()).items) all.add(created.instance);
        return [...all].map((address) => getAddress(address)).filter((address) => address !== zeroAddress);
    }

    private async readRange(from: bigint, to: bigint): Promise<void> {
        const watched = await this.watched();
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
        // The hash is read before the range goes in, so it describes the block the logs came from.
        const last = await this.client.getBlock({ blockNumber: to });
        await this.store.applyRange(logs, to, last.hash ?? undefined);
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
