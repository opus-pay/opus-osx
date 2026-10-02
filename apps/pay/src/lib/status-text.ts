import type { JobAction } from "@opus/sdk";

import { countdown } from "./proof";

type CoreStatus = "Open" | "Funded" | "Submitted" | "Completed" | "Rejected" | "Expired";
type Phase = "None" | "Funded" | "Submitted" | "Escalated" | "ArbiterPending" | "Resolved";

const PHASE_TEXT: Record<Phase, string> = {
    None: "not set up",
    Funded: "waiting for the deliverable",
    Submitted: "client reviewing",
    Escalated: "disputed, waiting for deposits",
    ArbiterPending: "waiting for the arbiter",
    Resolved: "settled",
};

const DEADLINE_TEXT: Partial<Record<Phase, string>> = {
    Funded: "Submit within",
    Submitted: "Review ends in",
    Escalated: "Deposits due in",
    ArbiterPending: "Ruling due in",
};

/**
 * One status line a person can read: the escrow state, the review stage, and what the next deadline is for.
 * The core status and the evaluator phase share names, so each gets its own label.
 */
export function statusLine(input: {
    status: CoreStatus;
    phase: Phase;
    nextDeadline: bigint | null;
    now: bigint;
}): string {
    const parts = [`Escrow: ${input.status}`, `Review: ${PHASE_TEXT[input.phase]}`];
    const label = DEADLINE_TEXT[input.phase];
    if (input.nextDeadline !== null && label !== undefined) {
        parts.push(`${label} ${countdown(input.nextDeadline, input.now)}`);
    }
    return parts.join(" · ");
}

const ACTION_TEXT: Partial<Record<JobAction, string>> = {
    submit: "Submit the deliverable",
    approve: "Approve and pay",
    object: "Object",
    extendReview: "Extend the review",
    postDeposit: "Post the deposit",
    withdraw: "Withdraw",
};

/** Button text for a job action. */
export function actionLabel(action: JobAction): string {
    return ACTION_TEXT[action] ?? action;
}
