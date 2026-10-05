import type { Address } from "viem";

import type { InstanceView, JobView } from "./store";

export type PageRequest = { limit: number; offset: number };
export type Paged<T> = { items: T[]; total: number };

/** What one change replaced, so it can be put back if the block that caused it is dropped from the chain. */
export type Undo =
    | { kind: "job"; instance: Address; jobId: bigint; before: JobView | null }
    | { kind: "instance"; instance: Address; before: InstanceView | null };

/**
 * Where the ledger lives. The projection (`IndexStore`) only talks to this, so the same rules run on memory,
 * SQLite or PostgreSQL. Every method is async because PostgreSQL is; the memory and SQLite versions finish at once.
 */
export interface Ledger {
    getJob(instance: Address, jobId: bigint): Promise<JobView | undefined>;
    putJob(job: JobView): Promise<void>;
    deleteJob(instance: Address, jobId: bigint): Promise<void>;
    getInstance(instance: Address): Promise<InstanceView | undefined>;
    putInstance(view: InstanceView): Promise<void>;
    deleteInstance(instance: Address): Promise<void>;

    instances(page?: PageRequest): Promise<Paged<InstanceView>>;
    /** Jobs where the wallet is the client or the provider. */
    jobsFor(account: Address, page?: PageRequest): Promise<Paged<JobView>>;
    /** Funded and submitted jobs of one instance and evaluator. */
    activeJobs(instance: Address, evaluator: Address): Promise<JobView[]>;
    jobCount(): Promise<number>;

    getMeta(key: string): Promise<string | undefined>;
    setMeta(key: string, value: string): Promise<void>;

    /** Remembers what a change replaced, tagged with the block that caused it. */
    addUndo(block: bigint, entry: Undo): Promise<void>;
    /** Entries for blocks after `block`, newest first. */
    undoAfter(block: bigint): Promise<Undo[]>;
    dropUndoAfter(block: bigint): Promise<void>;
    /** Forgets undo entries for blocks at or before `block`. */
    pruneUndo(block: bigint): Promise<void>;

    /** The hash of the last block of each range, so a replaced block can be noticed. Oldest first. */
    putHash(block: bigint, hash: string): Promise<void>;
    hashes(): Promise<{ block: bigint; hash: string }[]>;
    dropHashesAfter(block: bigint): Promise<void>;
    pruneHashes(block: bigint): Promise<void>;

    /** Runs `fn` so that all its writes land together or not at all. `fn` must use the ledger it is handed. */
    transaction<T>(fn: (ledger: Ledger) => Promise<T>): Promise<T>;
    close(): Promise<void>;
}

const DEFAULT_PAGE: PageRequest = { limit: Number.MAX_SAFE_INTEGER, offset: 0 };

const byJob = (a: JobView, b: JobView) =>
    a.instance === b.instance ? (a.jobId < b.jobId ? -1 : a.jobId > b.jobId ? 1 : 0) : a.instance < b.instance ? -1 : 1;

function cut<T>(all: T[], page: PageRequest = DEFAULT_PAGE): Paged<T> {
    return { items: all.slice(page.offset, page.offset + page.limit), total: all.length };
}

/** The ledger in memory. Fast and simple; gone when the process stops. */
export class MemoryLedger implements Ledger {
    private readonly jobs = new Map<string, JobView>();
    private readonly created = new Map<Address, InstanceView>();
    private readonly meta = new Map<string, string>();
    private undo: { block: bigint; entry: Undo }[] = [];
    private readonly seen = new Map<bigint, string>();

    private static key(instance: Address, jobId: bigint) {
        return `${instance}:${jobId}`;
    }

    async getJob(instance: Address, jobId: bigint) {
        return this.jobs.get(MemoryLedger.key(instance, jobId));
    }
    async putJob(job: JobView) {
        this.jobs.set(MemoryLedger.key(job.instance, job.jobId), job);
    }
    async deleteJob(instance: Address, jobId: bigint) {
        this.jobs.delete(MemoryLedger.key(instance, jobId));
    }
    async getInstance(instance: Address) {
        return this.created.get(instance);
    }
    async putInstance(view: InstanceView) {
        this.created.set(view.instance, view);
    }
    async deleteInstance(instance: Address) {
        this.created.delete(instance);
    }

    async instances(page?: PageRequest) {
        return cut([...this.created.values()], page);
    }
    async jobsFor(account: Address, page?: PageRequest) {
        const all = [...this.jobs.values()].filter((job) => job.client === account || job.provider === account);
        return cut(all.sort(byJob), page);
    }
    async activeJobs(instance: Address, evaluator: Address) {
        return [...this.jobs.values()]
            .filter(
                (job) =>
                    job.instance === instance &&
                    job.evaluator === evaluator &&
                    (job.status === "Funded" || job.status === "Submitted")
            )
            .sort(byJob);
    }
    async jobCount() {
        return this.jobs.size;
    }

    async getMeta(key: string) {
        return this.meta.get(key);
    }
    async setMeta(key: string, value: string) {
        this.meta.set(key, value);
    }

    async addUndo(block: bigint, entry: Undo) {
        this.undo.push({ block, entry });
    }
    async undoAfter(block: bigint) {
        return this.undo
            .filter((row) => row.block > block)
            .reverse()
            .map((row) => row.entry);
    }
    async dropUndoAfter(block: bigint) {
        this.undo = this.undo.filter((row) => row.block <= block);
    }
    async pruneUndo(block: bigint) {
        this.undo = this.undo.filter((row) => row.block > block);
    }

    async putHash(block: bigint, hash: string) {
        this.seen.set(block, hash);
    }
    async hashes() {
        return [...this.seen].map(([block, hash]) => ({ block, hash })).sort((a, b) => (a.block < b.block ? -1 : 1));
    }
    async dropHashesAfter(block: bigint) {
        for (const known of [...this.seen.keys()]) if (known > block) this.seen.delete(known);
    }
    async pruneHashes(block: bigint) {
        for (const known of [...this.seen.keys()]) if (known <= block) this.seen.delete(known);
    }

    async transaction<T>(fn: (ledger: Ledger) => Promise<T>): Promise<T> {
        // Nothing here can fail halfway except the caller's own code; the projection checks first, then writes.
        return fn(this);
    }
    async close() {
        // Nothing to release.
    }
}
