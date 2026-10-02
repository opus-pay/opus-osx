import type { JobStatusName, PhaseName } from "@opus/sdk";

export type StepState = "done" | "current" | "alert" | "todo" | "passed";

const TERMINAL = new Set<JobStatusName>(["Completed", "Rejected", "Expired"]);

/**
 * The four stages every job walks through, and where this one stands.
 * A dispute shows on the third stage; a refund marks that stage as passed, not done.
 */
export function jobProgress(status: JobStatusName, phase: PhaseName): { label: string; state: StepState }[] {
    const disputed = phase === "Escalated" || phase === "ArbiterPending";
    const last =
        status === "Completed"
            ? "Paid"
            : status === "Rejected"
            ? "Refunded"
            : status === "Expired"
            ? "Expired"
            : "Settled";
    const labels = ["Created", "Funded", disputed ? "Disputed" : "Submitted", last];
    if (TERMINAL.has(status)) {
        return labels.map((label, i) => ({ label, state: i === 2 && status !== "Completed" ? "passed" : "done" }));
    }
    const current = status === "Open" ? 0 : status === "Funded" ? 1 : 2;
    return labels.map((label, i) => ({
        label,
        state: i < current ? "done" : i > current ? "todo" : disputed ? "alert" : "current",
    }));
}
