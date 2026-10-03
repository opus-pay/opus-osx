import type { JobAction, JobStatusName, PhaseName } from "@opus/sdk";

import { translate, type Locale, type MessageKey } from "./i18n";
import { countdown } from "./proof";
import { usdcText } from "./terms";

type CoreStatus = JobStatusName;
type Phase = PhaseName;

export type Role = "client" | "provider";

const DEADLINE: Partial<Record<Phase, MessageKey>> = {
    Funded: "deadline.Funded",
    Submitted: "deadline.Submitted",
    Escalated: "deadline.Escalated",
    ArbiterPending: "deadline.ArbiterPending",
};

/**
 * One status line a person can read: the escrow state, the review stage, and what the next deadline is for.
 * The core status and the evaluator phase share names, so each gets its own label.
 */
export function statusLine(
    input: { status: CoreStatus; phase: Phase; nextDeadline: bigint | null; now: bigint },
    locale: Locale = "en"
): string {
    const t = (key: MessageKey) => translate(locale, key);
    const parts = [`${t("fact.escrow")}: ${input.status}`, `${t("fact.review")}: ${t(`phase.${input.phase}`)}`];
    const label = DEADLINE[input.phase];
    if (input.nextDeadline !== null && label !== undefined) {
        parts.push(`${t(label)} ${countdown(input.nextDeadline, input.now, locale)}`);
    }
    return parts.join(" · ");
}

/** The job's state, review stage and next deadline, as label and value pairs for a two-column list. */
export function statusFacts(
    input: { status: CoreStatus; phase: Phase; nextDeadline: bigint | null; now: bigint },
    locale: Locale = "en"
): { label: string; value: string }[] {
    const t = (key: MessageKey) => translate(locale, key);
    const facts = [
        { label: t("fact.job"), value: t(`status.${input.status}`) },
        { label: t("fact.review"), value: capitalize(t(`phase.${input.phase}`)) },
    ];
    const label = DEADLINE[input.phase];
    if (input.nextDeadline !== null && label !== undefined) {
        facts.push({ label: t(label), value: countdown(input.nextDeadline, input.now, locale) });
    }
    return facts;
}

const ACTION: Partial<Record<JobAction, MessageKey>> = {
    submit: "action.submit",
    approve: "action.approve",
    object: "action.object",
    extendReview: "action.extendReview",
    postDeposit: "action.postDeposit",
    withdraw: "action.withdraw",
    claimRefund: "action.claimRefund",
};

/** Button text for a job action. */
export function actionLabel(action: JobAction, locale: Locale = "en"): string {
    const key = ACTION[action];
    return key === undefined ? action : translate(locale, key);
}

/**
 * What this job actually holds in escrow right now, and a note on the agreed amount.
 * Only a funded or submitted job holds USDC; before funding and after settlement it holds none.
 */
export function escrowFor(status: CoreStatus, budget: bigint, locale: Locale = "en"): { amount: bigint; note: string } {
    const amount = `${usdcText(budget)} USDC`;
    if (status === "Funded" || status === "Submitted") {
        return { amount: budget, note: translate(locale, "escrow.locked") };
    }
    if (status === "Open") return { amount: 0n, note: translate(locale, "escrow.agreed", { amount }) };
    if (status === "Completed") return { amount: 0n, note: translate(locale, "escrow.paid", { amount }) };
    return { amount: 0n, note: translate(locale, "escrow.returned", { amount }) };
}

/** One sentence telling this role what is happening and what it can do. */
export function roleGuide(
    role: Role,
    status: CoreStatus,
    phase: Phase,
    autoComplete: boolean,
    locale: Locale = "en",
    hasArbiter = true
): string {
    const t = (key: MessageKey) => translate(locale, key);
    if (phase === "Escalated") return t("guide.dispute");
    if (phase === "ArbiterPending") return t("guide.arbiter");
    const side = role === "client" ? "client" : "provider";
    if (status === "Open") return t(`guide.${side}.open`);
    if (status === "Funded") return t(`guide.${side}.funded`);
    if (status === "Submitted" && side === "client" && !hasArbiter) return t("guide.client.submittedNoArbiter");
    if (status === "Submitted") return t(autoComplete ? `guide.${side}.submittedAuto` : `guide.${side}.submitted`);
    if (status === "Completed") return t(`guide.${side}.completed`);
    if (status === "Rejected") return t(`guide.${side}.rejected`);
    return t(`guide.${side}.expired`);
}

function capitalize(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1);
}
