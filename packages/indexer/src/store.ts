import { decodeEventLog, getAddress, zeroAddress, type Address, type Hex, type Log } from "viem";

import { indexAbi } from "./abi";
import type { Ledger, PageRequest, Paged } from "./ledger";

export type JobStatusName = "Open" | "Funded" | "Submitted" | "Completed" | "Rejected" | "Expired";
export type PhaseName = "None" | "Funded" | "Submitted" | "Escalated" | "ArbiterPending" | "Resolved";

export type JobView = {
    instance: Address;
    jobId: bigint;
    client: Address;
    provider: Address;
    evaluator: Address;
    hook: Address;
    expiredAt: bigint;
    budget: bigint;
    status: JobStatusName;
    phase: PhaseName;
    configured: boolean;
    deliverable: Hex | undefined;
    disputeDeadline: bigint | undefined;
    deposit: bigint;
    tipPaid: bigint;
    feePaid: bigint;
    swept: boolean;
};

export type InstanceView = {
    instance: Address;
    token: Address;
    treasury: Address;
    feeBP: bigint;
};

type Args = Record<string, unknown>;

function blank(instance: Address, jobId: bigint): JobView {
    return {
        instance,
        jobId,
        client: zeroAddress,
        provider: zeroAddress,
        evaluator: zeroAddress,
        hook: zeroAddress,
        expiredAt: 0n,
        budget: 0n,
        status: "Open",
        phase: "None",
        configured: false,
        deliverable: undefined,
        disputeDeadline: undefined,
        deposit: 0n,
        tipPaid: 0n,
        feePaid: 0n,
        swept: false,
    };
}

/** How many blocks of undo information and block hashes are kept. A reorg deeper than this needs a rebuild. */
export const REORG_WINDOW = 256n;

/**
 * Projected jobs and instances. Callers read these records, not the logs that produced them. The rules live
 * here; where the records are kept is the `Ledger`'s business. Each change remembers what it replaced, so a block
 * that is dropped from the chain can be taken back out with `rewind`.
 */
export class IndexStore {
    constructor(readonly ledger: Ledger) {}

    /** The next block to read, or `undefined` for a ledger that has never been written. */
    async cursor(): Promise<bigint | undefined> {
        const value = await this.ledger.getMeta("cursor");
        return value === undefined ? undefined : BigInt(value);
    }

    async setCursor(block: bigint): Promise<void> {
        await this.ledger.setMeta("cursor", String(block));
    }

    /** How many events changed the ledger so far. */
    async applied(): Promise<number> {
        return Number((await this.ledger.getMeta("applied")) ?? 0);
    }

    /**
     * Puts a block range into the ledger whole: every log, the new cursor, and the hash of the last block, in one
     * transaction. Either all of it lands or none, so a failure leaves the range to be read again from scratch.
     */
    async applyRange(logs: Log[], to: bigint, hash: string | undefined): Promise<number> {
        const changed = await this.ledger.transaction(async (ledger) => {
            let count = 0;
            for (const log of logs) if (await this.projectLog(ledger, log)) count += 1;
            await ledger.setMeta("cursor", String(to + 1n));
            if (hash !== undefined) await ledger.putHash(to, hash);
            if (count > 0) {
                // Read through the transaction's own ledger: asking the outer one would wait for this very transaction.
                const before = Number((await ledger.getMeta("applied")) ?? 0);
                await ledger.setMeta("applied", String(before + count));
            }
            return count;
        });
        const floor = to - REORG_WINDOW;
        if (floor > 0n) {
            await this.ledger.pruneUndo(floor);
            await this.ledger.pruneHashes(floor);
        }
        return changed;
    }

    /** Applies one log, outside a range (used by tests and tools). Returns whether it changed anything. */
    async apply(log: Log): Promise<boolean> {
        return this.ledger.transaction((ledger) => this.projectLog(ledger, log));
    }

    /** Takes back every change made by blocks after `block`, and moves the cursor to the block after it. */
    async rewind(block: bigint): Promise<void> {
        await this.ledger.transaction(async (ledger) => {
            for (const undo of await ledger.undoAfter(block)) {
                if (undo.kind === "job") {
                    if (undo.before === null) await ledger.deleteJob(undo.instance, undo.jobId);
                    else await ledger.putJob(undo.before);
                } else if (undo.before === null) await ledger.deleteInstance(undo.instance);
                else await ledger.putInstance(undo.before);
            }
            await ledger.dropUndoAfter(block);
            await ledger.dropHashesAfter(block);
            await ledger.setMeta("cursor", String(block + 1n));
        });
    }

    job(instance: Address, jobId: bigint): Promise<JobView | undefined> {
        return this.ledger.getJob(getAddress(instance), jobId);
    }

    /** Payment-link pages for one wallet. */
    jobsFor(account: Address, page?: PageRequest): Promise<Paged<JobView>> {
        return this.ledger.jobsFor(getAddress(account), page);
    }

    /** Funded and submitted jobs the keeper still has to watch. */
    activeJobs(instance: Address, evaluator: Address): Promise<JobView[]> {
        return this.ledger.activeJobs(getAddress(instance), getAddress(evaluator));
    }

    instances(page?: PageRequest): Promise<Paged<InstanceView>> {
        return this.ledger.instances(page);
    }

    jobCount(): Promise<number> {
        return this.ledger.jobCount();
    }

    private async projectLog(ledger: Ledger, log: Log): Promise<boolean> {
        if (log.topics.length === 0) return false;
        let decoded: { eventName: string; args: Args };
        try {
            const row = decodeEventLog({ abi: indexAbi, data: log.data, topics: log.topics });
            decoded = { eventName: row.eventName, args: row.args as Args };
        } catch {
            return false;
        }
        const block = log.blockNumber ?? 0n;
        const emitter = getAddress(log.address);
        const { eventName, args } = decoded;
        if (eventName === "InstanceCreated") {
            const instance = addr(args.instance);
            const before = await ledger.getInstance(instance);
            await ledger.addUndo(block, { kind: "instance", instance, before: before ?? null });
            await ledger.putInstance({
                instance,
                token: addr(args.token),
                treasury: addr(args.treasury),
                feeBP: word(args.feeBP),
            });
            return true;
        }
        const jobId = word(args.jobId);
        const instance = eventName === "JobCreated" || !("instance" in args) ? emitter : addr(args.instance);
        const before = await ledger.getJob(instance, jobId);
        const job: JobView = before === undefined ? blank(instance, jobId) : { ...before };
        if (!fold(job, eventName, args)) return false;
        await ledger.addUndo(block, { kind: "job", instance, jobId, before: before ?? null });
        await ledger.putJob(job);
        return true;
    }
}

/** Changes `job` for one event. Returns false for an event the ledger does not use. */
function fold(job: JobView, name: string, args: Args): boolean {
    switch (name) {
        case "JobCreated":
            job.client = addr(args.client);
            job.provider = addr(args.provider);
            job.evaluator = addr(args.evaluator);
            job.hook = addr(args.hook);
            job.expiredAt = word(args.expiredAt);
            return true;
        case "ProviderSet":
            job.provider = addr(args.provider);
            return true;
        case "BudgetSet":
        case "JobFunded":
            job.budget = word(args.amount);
            if (name === "JobFunded") {
                job.status = "Funded";
                job.client = addr(args.client);
                if (job.phase === "None") job.phase = "Funded";
            }
            return true;
        case "JobSubmitted":
            job.status = "Submitted";
            job.provider = addr(args.provider);
            job.deliverable = args.deliverable as Hex;
            if (job.phase === "None" || job.phase === "Funded") job.phase = "Submitted";
            return true;
        case "JobCompleted":
            job.status = "Completed";
            return true;
        case "JobRejected":
            job.status = "Rejected";
            return true;
        case "JobExpired":
            job.status = "Expired";
            return true;
        case "Configured":
            job.configured = true;
            job.client = addr(args.client);
            return true;
        case "Escalated":
            job.phase = "Escalated";
            return true;
        case "CaseOpened":
            job.phase = "ArbiterPending";
            job.disputeDeadline = word(args.disputeDeadline);
            return true;
        case "DepositPosted":
            job.deposit += word(args.amount);
            return true;
        case "Ruled":
            job.phase = "Resolved";
            job.status = args.completed === true ? "Completed" : "Rejected";
            return true;
        case "TipPaid":
            job.tipPaid += word(args.amount);
            return true;
        case "FeePaid":
            job.feePaid += word(args.amount);
            return true;
        case "Swept":
            job.swept = true;
            return true;
        case "PaymentReleased":
        case "Refunded":
            return true;
        default:
            return false;
    }
}

function addr(value: unknown): Address {
    return getAddress(value as Address);
}

function word(value: unknown): bigint {
    return BigInt(value as bigint | number | string);
}
