import { PLACEHOLDER_SAFETY_MARGIN, type Opus } from "@opus/sdk";
import { parseAbi, type Address, type Hash } from "viem";

import { isLowBalance, isNearExpiry, type Alert } from "./alerts";
import { PermanentError, withBackoff } from "./retry";
import { dueTriggers, type KeeperTrigger } from "./triggers";

const jobCountAbi = parseAbi(["function jobCount() view returns (uint256)"]);

/** 0.05 POL. Enough for a few Amoy calls at the 25 gwei floor. An operating alert, not a protocol constant. */
export const DEFAULT_LOW_BALANCE_WEI = 50_000_000_000_000_000n;

export type KeeperCall = { jobId: bigint; action: KeeperTrigger; hash: Hash };

/** Jobs that never change again: nothing is left for the keeper to do, so they are not read twice. */
const FINISHED: ReadonlySet<string> = new Set(["Completed", "Rejected", "Expired"]);

/** A call was sent but no block has shown it yet. Not retried: that would send it twice. */
export class CallPending extends PermanentError {
    constructor(readonly hash: Hash) {
        super("The call was sent but is not in a block yet");
    }
}

/** The first line of an error plus the node's "Details", which is where the useful part usually is. */
export function describe(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    const first = message.split("\n").find((line) => line.trim() !== "") ?? "unknown";
    const details = message.match(/Details: ([^\n]+)/)?.[1];
    return details === undefined ? first : `${first} ${details}`;
}

export type KeeperOptions = {
    marginSeconds?: bigint;
    lowBalanceWei?: bigint;
    attempts?: number;
    baseDelayMs?: number;
    sleep?: (ms: number) => Promise<void>;
    onAlert?: (alert: Alert) => void;
    /** How long to wait for a block after sending. Default 90 s. */
    receiptTimeoutMs?: number;
    /** After a send that was not seen in a block, do not send the same call again for this long. Default 10 min. */
    pendingTtlMs?: number;
    now?: () => number;
    /**
     * Which jobs to look at, instead of every job. Return the ids of jobs that are funded or submitted, or
     * `undefined` to scan them all (for example when the index is behind or down). The keeper still reads each
     * job and asks `Opus.status` on the chain before it sends anything; the list only narrows the reading.
     */
    activeJobs?: () => Promise<bigint[] | undefined>;
    /** Scan every job on the chain at least once per this many passes, as a check on the list. Default 20. */
    fullScanEvery?: number;
};

export type TickResult = {
    calls: KeeperCall[];
    alerts: Alert[];
    /** Jobs whose read or call failed this pass. The rest of the pass still ran. */
    errors: { jobId: bigint; message: string }[];
    /** Jobs looked at in this pass, and how many were skipped as finished or not this keeper's. */
    checked: number;
    skipped: number;
    /** Where the list of jobs came from: the index, or a scan of the chain. */
    source: "index" | "scan";
};

/**
 * One pass over the instance. Which call is due comes only from `Opus.status`.
 * Gas on Amoy is floored inside the SDK write path.
 */
export class Keeper {
    private readonly marginSeconds: bigint;
    private readonly lowBalanceWei: bigint;
    private readonly attempts: number;
    private readonly baseDelayMs: number;
    private readonly receiptTimeoutMs: number;
    private readonly pendingTtlMs: number;
    private readonly now: () => number;
    private readonly fullScanEvery: number;
    private passes = 0;
    /** Finished jobs and jobs of another evaluator: neither changes, so they are read once. */
    private readonly settled = new Set<bigint>();
    /** Calls sent but not yet seen in a block, by `job:action`. */
    private readonly pending = new Map<string, { hash: Hash; at: number }>();

    constructor(
        private readonly opus: Opus,
        private readonly keeper: Address,
        private readonly options: KeeperOptions = {}
    ) {
        this.marginSeconds = options.marginSeconds ?? BigInt(PLACEHOLDER_SAFETY_MARGIN);
        this.lowBalanceWei = options.lowBalanceWei ?? DEFAULT_LOW_BALANCE_WEI;
        this.attempts = options.attempts ?? 4;
        this.baseDelayMs = options.baseDelayMs ?? 1_000;
        this.receiptTimeoutMs = options.receiptTimeoutMs ?? 90_000;
        this.pendingTtlMs = options.pendingTtlMs ?? 600_000;
        this.now = options.now ?? Date.now;
        this.fullScanEvery = options.fullScanEvery ?? 20;
    }

    /** How many calls are waiting for a block, for the health check. */
    get pendingCalls(): number {
        return this.pending.size;
    }

    private alert(alerts: Alert[], alert: Alert): void {
        alerts.push(alert);
        this.options.onAlert?.(alert);
    }

    async tick(): Promise<TickResult> {
        const alerts: Alert[] = [];
        const calls: KeeperCall[] = [];
        const errors: TickResult["errors"] = [];
        for (const [key, waiting] of this.pending) {
            if (this.now() - waiting.at >= this.pendingTtlMs) this.pending.delete(key);
        }
        let checked = 0;
        let skipped = 0;
        const balance = await this.opus.publicClient.getBalance({ address: this.keeper });
        if (isLowBalance(balance, this.lowBalanceWei)) {
            this.alert(alerts, { kind: "low-balance", balance, minimum: this.lowBalanceWei });
        }

        const count = await this.opus.publicClient.readContract({
            address: this.opus.addresses.instance,
            abi: jobCountAbi,
            functionName: "jobCount",
        });
        const now = (await this.opus.publicClient.getBlock()).timestamp;

        // Ask the index which jobs are live; every so often (and whenever it cannot answer) look at all of them.
        this.passes += 1;
        const full = this.options.activeJobs === undefined || this.passes % this.fullScanEvery === 1;
        let listed: bigint[] | undefined;
        if (!full) {
            try {
                listed = await this.options.activeJobs!();
            } catch {
                listed = undefined;
            }
        }
        const ids: bigint[] = listed ?? Array.from({ length: Number(count) }, (_, index) => BigInt(index + 1));
        const source: TickResult["source"] = listed === undefined ? "scan" : "index";

        for (const jobId of ids) {
            if (jobId < 1n || jobId > count) continue;
            if (this.settled.has(jobId)) {
                skipped += 1;
                continue;
            }
            checked += 1;
            // One job that cannot be read must not stop the others from being handled.
            try {
                const job = await this.opus.job(jobId);
                if (job.evaluator !== this.opus.addresses.evaluator || FINISHED.has(job.status)) {
                    this.settled.add(jobId);
                    continue;
                }
                if (isNearExpiry(job.status, job.expiredAt, now, this.marginSeconds)) {
                    this.alert(alerts, { kind: "near-expiry", jobId, expiredAt: job.expiredAt, now });
                }
                const status = await this.opus.status(jobId, this.keeper);
                for (const action of dueTriggers(status.actions)) {
                    const waiting = this.pending.get(`${jobId}:${action}`);
                    if (waiting !== undefined) {
                        if (this.now() - waiting.at < this.pendingTtlMs) continue;
                        this.pending.delete(`${jobId}:${action}`);
                    }
                    try {
                        const hash = await this.send(action, jobId);
                        calls.push({ jobId, action, hash });
                    } catch (error) {
                        if (error instanceof CallPending) {
                            this.alert(alerts, { kind: "call-pending", jobId, action, hash: error.hash });
                            continue;
                        }
                        throw error;
                    }
                }
            } catch (error) {
                const message = describe(error);
                errors.push({ jobId, message });
                this.alert(alerts, { kind: "job-error", jobId, message });
            }
        }
        return { calls, alerts, errors, checked, skipped, source };
    }

    private async send(action: KeeperTrigger, jobId: bigint): Promise<Hash> {
        return withBackoff(
            async () => {
                const hash = await this.opus[action](jobId);
                // The call is out. Remember it so a slow block does not make the next pass send it again.
                this.pending.set(`${jobId}:${action}`, { hash, at: this.now() });
                let receipt;
                try {
                    receipt = await this.opus.publicClient.waitForTransactionReceipt({
                        hash,
                        timeout: this.receiptTimeoutMs,
                    });
                } catch {
                    throw new CallPending(hash);
                }
                this.pending.delete(`${jobId}:${action}`);
                if (receipt.status !== "success") throw new PermanentError("transaction reverted");
                return hash;
            },
            { attempts: this.attempts, baseDelayMs: this.baseDelayMs, sleep: this.options.sleep }
        );
    }
}
