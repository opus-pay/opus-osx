import { PLACEHOLDER_MIN_JOB_DURATION, PLACEHOLDER_SAFETY_MARGIN } from "./constants";
import type { EvaluatorConfig } from "./types";

/**
 * Earliest `expiredAt` that passes the evaluator's fund-time check.
 * The contract reverts when `now + windows + safety > expiredAt`, so this is one second past that sum.
 * Compute it at `createJob` time; a later `fund` needs the same slack still to remain.
 */
export function minimumExpiredAt(now: bigint, config: EvaluatorConfig): bigint {
    const needed =
        BigInt(config.submitWindow) +
        BigInt(config.reviewWindow) +
        BigInt(config.maxExtension) +
        BigInt(config.depositWindow) +
        BigInt(config.disputeWindow) +
        BigInt(PLACEHOLDER_SAFETY_MARGIN);
    const fromWindows = now + needed + 1n;
    const fromJob = now + BigInt(PLACEHOLDER_MIN_JOB_DURATION);
    return fromWindows > fromJob ? fromWindows : fromJob;
}
