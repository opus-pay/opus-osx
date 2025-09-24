import type { JobAction } from "@opus/sdk";

/** Due triggers only. Party actions such as approve and claimRefund stay out of the keeper. */
export const KEEPER_TRIGGERS = [
    "timeoutNoSubmission",
    "finalize",
    "escalateOnSilence",
    "resolveMissingDeposit",
    "resolveByDefault",
] as const satisfies readonly JobAction[];

export type KeeperTrigger = (typeof KEEPER_TRIGGERS)[number];

export function dueTriggers(actions: readonly JobAction[]): KeeperTrigger[] {
    return KEEPER_TRIGGERS.filter((action) => actions.includes(action));
}
