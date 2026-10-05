import { decodeEventLog, getAddress, zeroAddress, type Address, type Hex, type Log } from "viem";

import { indexAbi } from "./abi";

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

export type StoreData = { jobs: JobView[]; instances: InstanceView[]; applied: number };

type Args = Record<string, unknown>;

const ACTIVE = new Set<JobStatusName>(["Funded", "Submitted"]);

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

/** Projected jobs and instances. Callers read these records, not the logs that produced them. */
export class IndexStore {
    private readonly jobs = new Map<string, JobView>();
    private readonly created = new Map<Address, InstanceView>();
    applied = 0;

    apply(log: Log): boolean {
        if (log.topics.length === 0) return false;
        let decoded: { eventName: string; args: Args };
        try {
            const row = decodeEventLog({ abi: indexAbi, data: log.data, topics: log.topics });
            decoded = { eventName: row.eventName, args: row.args as Args };
        } catch {
            return false;
        }
        const changed = this.project(getAddress(log.address), decoded.eventName, decoded.args);
        if (changed) this.applied += 1;
        return changed;
    }

    job(instance: Address, jobId: bigint): JobView | undefined {
        return this.jobs.get(key(getAddress(instance), jobId));
    }

    /** Payment-link pages for one wallet. */
    jobsFor(account: Address): JobView[] {
        const who = getAddress(account);
        return [...this.jobs.values()].filter((job) => job.client === who || job.provider === who);
    }

    /** Funded and submitted jobs the keeper still has to watch. */
    activeJobs(instance: Address, evaluator: Address): JobView[] {
        const core = getAddress(instance);
        const judge = getAddress(evaluator);
        return [...this.jobs.values()].filter(
            (job) => job.instance === core && job.evaluator === judge && ACTIVE.has(job.status)
        );
    }

    instances(): InstanceView[] {
        return [...this.created.values()];
    }

    /** Everything the store holds, as plain data, so it can be saved and loaded again. */
    export(): StoreData {
        return { jobs: [...this.jobs.values()], instances: [...this.created.values()], applied: this.applied };
    }

    /** Replaces the contents with saved data. */
    load(data: StoreData): void {
        this.jobs.clear();
        this.created.clear();
        for (const job of data.jobs) this.jobs.set(key(job.instance, job.jobId), job);
        for (const instance of data.instances) this.created.set(instance.instance, instance);
        this.applied = data.applied;
    }

    /** How many jobs are held, for health and paging. */
    get jobCount(): number {
        return this.jobs.size;
    }

    private project(emitter: Address, name: string, args: Args): boolean {
        if (name === "InstanceCreated") {
            const instance = addr(args.instance);
            this.created.set(instance, {
                instance,
                token: addr(args.token),
                treasury: addr(args.treasury),
                feeBP: word(args.feeBP),
            });
            return true;
        }
        const jobId = word(args.jobId);
        const instance = name === "JobCreated" || !("instance" in args) ? emitter : addr(args.instance);
        const job = this.ensure(instance, jobId);
        switch (name) {
            case "JobCreated":
                job.client = addr(args.client);
                job.provider = addr(args.provider);
                job.evaluator = addr(args.evaluator);
                job.hook = addr(args.hook);
                job.expiredAt = word(args.expiredAt);
                break;
            case "ProviderSet":
                job.provider = addr(args.provider);
                break;
            case "BudgetSet":
            case "JobFunded":
                job.budget = word(args.amount);
                if (name === "JobFunded") {
                    job.status = "Funded";
                    job.client = addr(args.client);
                    if (job.phase === "None") job.phase = "Funded";
                }
                break;
            case "JobSubmitted":
                job.status = "Submitted";
                job.provider = addr(args.provider);
                job.deliverable = args.deliverable as Hex;
                if (job.phase === "None" || job.phase === "Funded") job.phase = "Submitted";
                break;
            case "JobCompleted":
                job.status = "Completed";
                break;
            case "JobRejected":
                job.status = "Rejected";
                break;
            case "JobExpired":
                job.status = "Expired";
                break;
            case "Configured":
                job.configured = true;
                job.client = addr(args.client);
                break;
            case "Escalated":
                job.phase = "Escalated";
                break;
            case "CaseOpened":
                job.phase = "ArbiterPending";
                job.disputeDeadline = word(args.disputeDeadline);
                break;
            case "DepositPosted":
                job.deposit += word(args.amount);
                break;
            case "Ruled":
                job.phase = "Resolved";
                job.status = args.completed === true ? "Completed" : "Rejected";
                break;
            case "TipPaid":
                job.tipPaid += word(args.amount);
                break;
            case "FeePaid":
                job.feePaid += word(args.amount);
                break;
            case "Swept":
                job.swept = true;
                break;
            case "PaymentReleased":
            case "Refunded":
                break;
            default:
                return false;
        }
        return true;
    }

    private ensure(instance: Address, jobId: bigint): JobView {
        const id = key(instance, jobId);
        const found = this.jobs.get(id);
        if (found !== undefined) return found;
        const created = blank(instance, jobId);
        this.jobs.set(id, created);
        return created;
    }
}

function key(instance: Address, jobId: bigint): string {
    return `${instance}:${jobId}`;
}

function addr(value: unknown): Address {
    return getAddress(value as Address);
}

function word(value: unknown): bigint {
    return BigInt(value as bigint | number | string);
}
