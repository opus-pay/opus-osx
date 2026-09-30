import { expect } from "chai";

import { dueNotices, notify, type NoticeInput } from "../src/lib/notices";

function view(over: Partial<NoticeInput> = {}): NoticeInput {
    return {
        status: "Submitted",
        phase: "Submitted",
        now: 1_000n,
        nextDeadline: 1_100n,
        marginSeconds: 200n,
        autoCompleteOnSilence: true,
        disputeDeposit: 0n,
        clientPosted: false,
        providerPosted: false,
        ...over,
    };
}

describe("payment link notices (#29)", () => {
    it("names the deadline the silent party would miss", () => {
        expect(dueNotices(view())).to.deep.equal(["submitted", "review-deadline", "auto-complete"]);
        expect(
            dueNotices(
                view({
                    status: "Funded",
                    phase: "Escalated",
                    disputeDeposit: 5n,
                    clientPosted: true,
                    providerPosted: false,
                })
            )
        ).to.deep.equal(["funded", "escalation", "deposit-deadline"]);
        expect(dueNotices(view({ status: "Completed", phase: "Resolved", autoCompleteOnSilence: false }))).to.include(
            "ruling"
        );
    });

    it("posts the notice to the webhook", async () => {
        let sent = "";
        await notify(
            "https://hooks.example/opus",
            { kind: "deposit-deadline", jobId: "4", instance: "0xabc" },
            async (url, init) => {
                sent = `${url} ${init?.body}`;
                return new Response(null, { status: 204 });
            }
        );
        expect(sent).to.equal('https://hooks.example/opus {"kind":"deposit-deadline","jobId":"4","instance":"0xabc"}');
    });
});
