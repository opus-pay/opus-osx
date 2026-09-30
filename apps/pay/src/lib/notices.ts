export const NOTICE_KINDS = [
    "funded",
    "submitted",
    "review-deadline",
    "auto-complete",
    "escalation",
    "deposit-deadline",
    "ruling",
] as const;

export type NoticeKind = (typeof NOTICE_KINDS)[number];

export type NoticeInput = {
    status: "Open" | "Funded" | "Submitted" | "Completed" | "Rejected" | "Expired";
    phase: "None" | "Funded" | "Submitted" | "Escalated" | "ArbiterPending" | "Resolved";
    now: bigint;
    nextDeadline: bigint | null;
    marginSeconds: bigint;
    autoCompleteOnSilence: boolean;
    disputeDeposit: bigint;
    clientPosted: boolean;
    providerPosted: boolean;
};

/** Notices that should go out for this job view. The pilot channel is an HTTPS webhook (D31). */
export function dueNotices(input: NoticeInput): NoticeKind[] {
    const notes: NoticeKind[] = [];
    if (input.status === "Funded") notes.push("funded");
    if (input.status === "Submitted") notes.push("submitted");
    const near = input.nextDeadline !== null && input.nextDeadline - input.now <= input.marginSeconds;
    if (input.phase === "Submitted" && near) notes.push("review-deadline");
    if (input.phase === "Submitted" && near && input.autoCompleteOnSilence) notes.push("auto-complete");
    if (input.phase === "Escalated" || input.phase === "ArbiterPending") notes.push("escalation");
    const missingDeposit =
        input.disputeDeposit > 0n && input.phase === "Escalated" && (!input.clientPosted || !input.providerPosted);
    if (missingDeposit && near) notes.push("deposit-deadline");
    if (input.phase === "Resolved" || input.status === "Completed" || input.status === "Rejected") notes.push("ruling");
    return notes;
}

export async function notify(
    url: string,
    body: { kind: NoticeKind; jobId: string; instance: string },
    fetchImpl: typeof fetch = fetch
): Promise<void> {
    const response = await fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Webhook responded ${response.status}`);
}
