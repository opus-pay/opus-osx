import type { JobStatusName, PhaseName } from "@opus/sdk";

import { translate, type Locale, type MessageKey } from "./i18n";

export type StepState = "done" | "current" | "alert" | "todo" | "passed";

const TERMINAL = new Set<JobStatusName>(["Completed", "Rejected", "Expired"]);

/**
 * The five stages of a job, and where this one stands. "Terms" comes first: the link is
 * being read and signed, and nothing is on chain until the first signature opens the job.
 * A dispute shows on the "Submitted" stage; a refund marks that stage as passed, not done.
 */
export function jobProgress(
    status: JobStatusName,
    phase: PhaseName,
    onChain = true,
    locale: Locale = "en"
): { label: string; state: StepState }[] {
    const t = (key: MessageKey) => translate(locale, key);
    const disputed = phase === "Escalated" || phase === "ArbiterPending";
    const last =
        status === "Completed"
            ? t("stage.paid")
            : status === "Rejected"
            ? t("stage.refunded")
            : status === "Expired"
            ? t("stage.expired")
            : t("stage.settled");
    const labels = [
        t("stage.terms"),
        t("stage.created"),
        t("stage.funded"),
        disputed ? t("stage.disputed") : t("stage.submitted"),
        last,
    ];
    if (onChain && TERMINAL.has(status)) {
        return labels.map((label, i) => ({ label, state: i === 3 && status !== "Completed" ? "passed" : "done" }));
    }
    const current = !onChain ? 0 : status === "Open" ? 1 : status === "Funded" ? 2 : 3;
    return labels.map((label, i) => ({
        label,
        state: i < current ? "done" : i > current ? "todo" : disputed ? "alert" : "current",
    }));
}
