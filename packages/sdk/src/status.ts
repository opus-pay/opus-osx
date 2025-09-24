import { getAddress, zeroAddress, type Address } from "viem";

import type { JobAction, JobSnapshot, WalletStatus } from "./types";

const TERMINAL = new Set(["Completed", "Rejected", "Expired"]);

/** What `wallet` can call on this job right now. Anyone-callable keepers are included for every wallet. */
export function statusFor(wallet: Address, snap: JobSnapshot): WalletStatus {
    const who = getAddress(wallet);
    const client = who === getAddress(snap.job.client);
    const provider = snap.job.provider !== zeroAddress && who === getAddress(snap.job.provider);
    const actions: JobAction[] = [];
    const { job } = snap;

    if (job.status === "Open") {
        if (client && job.provider === zeroAddress) actions.push("setProvider");
        if (client || provider) actions.push("setBudget");
        if (
            client &&
            !snap.configured &&
            job.hook === snap.evaluatorAddress &&
            job.evaluator === snap.evaluatorAddress
        ) {
            actions.push("configure");
        }
        if (client && job.provider !== zeroAddress && job.budget > 0n) actions.push("fund");
    }

    if (job.status === "Funded" && provider) actions.push("submit");
    if (job.status === "Funded" && snap.phase === "Funded" && snap.now >= snap.fundedAt + BigInt(snap.submitWindow)) {
        actions.push("timeoutNoSubmission");
    }

    const afterSubmit = job.status === "Submitted" || snap.phase === "Escalated" || snap.phase === "ArbiterPending";
    if (client && afterSubmit && snap.phase !== "Resolved") actions.push("approve");
    if (provider && snap.fundedAt > 0n && snap.phase !== "Resolved" && !TERMINAL.has(job.status)) {
        actions.push("withdrawAsProvider");
    }
    if (client && snap.phase === "Submitted" && snap.now < snap.reviewEnd) {
        actions.push("object");
        if (snap.maxExtension > 0) actions.push("extendReview");
    }
    if (snap.phase === "Submitted" && snap.now >= snap.reviewEnd) {
        if (snap.autoCompleteOnSilence) actions.push("finalize");
        else actions.push("escalateOnSilence");
    }
    if (
        snap.phase === "Escalated" &&
        snap.disputeDeposit > 0n &&
        snap.now <= snap.depositDeadline &&
        (client || provider)
    ) {
        actions.push("postDeposit");
    }
    if (snap.phase === "Escalated" && snap.disputeDeposit > 0n && snap.now >= snap.depositDeadline) {
        actions.push("resolveMissingDeposit");
    }
    if (snap.phase === "Escalated" && snap.arbiter === zeroAddress) actions.push("resolveByDefault");
    if (snap.phase === "ArbiterPending" && snap.now >= snap.disputeDeadline) actions.push("resolveByDefault");

    if ((job.status === "Funded" || job.status === "Submitted") && snap.now >= job.expiredAt) {
        actions.push("claimRefund");
    }
    const returnable = snap.feeHeld + snap.clientDeposit + snap.providerDeposit;
    if (snap.configured && snap.phase !== "Resolved" && TERMINAL.has(job.status) && returnable > 0n) {
        actions.push("sweep");
    }
    if (snap.instanceClaimable > 0n || snap.evaluatorClaimable > 0n) actions.push("withdraw");

    return {
        phase: snap.phase,
        status: job.status,
        nextDeadline: nextDeadline(snap),
        actions,
        warnings: warnings(snap),
    };
}

export function warnings(snap: JobSnapshot): string[] {
    const notes: string[] = [];
    if (snap.job.evaluator === snap.job.client) notes.push("The evaluator is the client");
    if (snap.arbiter !== zeroAddress && (snap.arbiter === snap.job.client || snap.arbiter === snap.job.provider)) {
        notes.push("The arbiter is a party to the job");
    }
    return notes;
}

function nextDeadline(snap: JobSnapshot): bigint | null {
    if (snap.job.status === "Open" || snap.job.status === "Funded" || snap.job.status === "Submitted") {
        if (snap.phase === "Funded") return earlier(snap.job.expiredAt, snap.fundedAt + BigInt(snap.submitWindow));
        if (snap.phase === "Submitted") return earlier(snap.job.expiredAt, snap.reviewEnd);
        if (snap.phase === "Escalated" && snap.depositDeadline > 0n)
            return earlier(snap.job.expiredAt, snap.depositDeadline);
        if (snap.phase === "ArbiterPending" && snap.disputeDeadline > 0n)
            return earlier(snap.job.expiredAt, snap.disputeDeadline);
        return snap.job.expiredAt;
    }
    return null;
}

function earlier(a: bigint, b: bigint): bigint {
    return a < b ? a : b;
}
