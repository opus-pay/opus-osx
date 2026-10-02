import type { JobAction, JobStatusName, PhaseName } from "@opus/sdk";

import { formatUnits } from "viem";

import { countdown } from "./proof";

type CoreStatus = JobStatusName;
type Phase = PhaseName;

export type Role = "client" | "provider";

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

/** The same facts as `statusLine`, as label and value pairs for a two-column list. */
export function statusFacts(input: {
    status: CoreStatus;
    phase: Phase;
    nextDeadline: bigint | null;
    now: bigint;
}): { label: string; value: string }[] {
    const facts = [
        { label: "Job", value: input.status },
        { label: "Review", value: capitalize(PHASE_TEXT[input.phase]) },
    ];
    const label = DEADLINE_TEXT[input.phase];
    if (input.nextDeadline !== null && label !== undefined) {
        facts.push({ label, value: countdown(input.nextDeadline, input.now) });
    }
    return facts;
}

const ACTION_TEXT: Partial<Record<JobAction, string>> = {
    submit: "Submit the deliverable",
    approve: "Approve and pay",
    object: "Object",
    extendReview: "Extend the review",
    postDeposit: "Post the deposit",
    withdraw: "Withdraw",
    claimRefund: "Take the refund",
};

/** Button text for a job action. */
export function actionLabel(action: JobAction): string {
    return ACTION_TEXT[action] ?? action;
}

/**
 * What this job actually holds in escrow right now, and a note on the agreed amount.
 * Only a funded or submitted job holds USDC; before funding and after settlement it holds none.
 */
export function escrowFor(status: CoreStatus, budget: bigint): { amount: bigint; note: string } {
    const agreed = `${formatUnits(budget, 6)} USDC`;
    if (status === "Funded" || status === "Submitted") return { amount: budget, note: "locked for this job" };
    if (status === "Open") return { amount: 0n, note: `nothing locked yet, ${agreed} agreed` };
    if (status === "Completed") return { amount: 0n, note: `released, ${agreed} paid to the provider` };
    return { amount: 0n, note: `released, ${agreed} returned to the client` };
}

const DISPUTE =
    "The job is in dispute. If the preset asks for a deposit, post it before the deadline. A side that does not post loses.";

/** One sentence telling this role what is happening and what it can do. */
export function roleGuide(role: Role, status: CoreStatus, phase: Phase, autoComplete: boolean): string {
    if (phase === "Escalated") return DISPUTE;
    if (phase === "ArbiterPending") return "Both sides are in. Waiting for the arbiter's ruling.";
    if (role === "client") {
        if (status === "Open") return "Finish the steps on the payment link to lock the USDC.";
        if (status === "Funded") {
            return "Waiting for the provider to submit. If nothing arrives in time, the USDC comes back to you.";
        }
        if (status === "Submitted") {
            return autoComplete
                ? "Check the deliverable. Approve to pay now, or object before the review ends. Silence pays the provider."
                : "Check the deliverable. Approve to pay now, or object before the review ends.";
        }
        if (status === "Completed") return "Done. The provider was paid.";
        if (status === "Rejected") return "Done. The USDC came back to you.";
        return "The job expired. The USDC comes back to you.";
    }
    if (status === "Open") return "Waiting for the client to lock the USDC.";
    if (status === "Funded") return "The USDC is locked. Do the work and submit the deliverable before the deadline.";
    if (status === "Submitted") {
        return autoComplete
            ? "Submitted. Waiting for the client. If the client says nothing, you are paid when the review ends."
            : "Submitted. Waiting for the client's review.";
    }
    if (status === "Completed") return "Done. You were paid.";
    if (status === "Rejected") return "Done. The USDC went back to the client.";
    return "The job expired. The USDC went back to the client.";
}

function capitalize(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1);
}
