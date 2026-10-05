import type { JobStatusName } from "@opus/sdk";

export type Alert =
    | { kind: "near-expiry"; jobId: bigint; expiredAt: bigint; now: bigint }
    | { kind: "low-balance"; balance: bigint; minimum: bigint }
    /** A job could not be read or a call for it failed. The other jobs were still handled. */
    | { kind: "job-error"; jobId: bigint; message: string }
    /** Whole passes keep failing (for example the node is unreachable). */
    | { kind: "tick-failing"; failures: number; message: string }
    /** A sent call has not shown up in a block; it is not sent again for a while. */
    | { kind: "call-pending"; jobId: bigint; action: string; hash: string };

/** The key an alert is de-duplicated by: the same kind for the same job repeats only after a cooldown. */
export function alertKey(alert: Alert): string {
    return "jobId" in alert ? `${alert.kind}:${alert.jobId}` : alert.kind;
}

/** Lets an alert through once per cooldown per key, so a 30 s loop does not send the same alert all day. */
export class AlertGate {
    private readonly last = new Map<string, number>();

    constructor(private readonly cooldownMs: number, private readonly now: () => number = Date.now) {}

    allow(alert: Alert): boolean {
        const key = alertKey(alert);
        const time = this.now();
        const before = this.last.get(key);
        if (before !== undefined && time - before < this.cooldownMs) return false;
        this.last.set(key, time);
        return true;
    }
}

/** Alert when a funded or submitted job is inside the margin of its chain expiry, or already past it. */
export function isNearExpiry(status: JobStatusName, expiredAt: bigint, now: bigint, marginSeconds: bigint): boolean {
    if (status !== "Funded" && status !== "Submitted") return false;
    return expiredAt - now <= marginSeconds;
}

export function isLowBalance(balance: bigint, minimum: bigint): boolean {
    return balance < minimum;
}
