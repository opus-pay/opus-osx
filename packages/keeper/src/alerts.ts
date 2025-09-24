import type { JobStatusName } from "@opus/sdk";

export type Alert =
    | { kind: "near-expiry"; jobId: bigint; expiredAt: bigint; now: bigint }
    | { kind: "low-balance"; balance: bigint; minimum: bigint };

/** Alert when a funded or submitted job is inside the margin of its chain expiry, or already past it. */
export function isNearExpiry(status: JobStatusName, expiredAt: bigint, now: bigint, marginSeconds: bigint): boolean {
    if (status !== "Funded" && status !== "Submitted") return false;
    return expiredAt - now <= marginSeconds;
}

export function isLowBalance(balance: bigint, minimum: bigint): boolean {
    return balance < minimum;
}
