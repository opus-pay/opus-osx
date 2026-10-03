import { expect } from "chai";

import { jobProgress } from "../src/lib/progress";
import { escrowFor, roleGuide } from "../src/lib/status-text";

const states = (status: Parameters<typeof jobProgress>[0], phase: Parameters<typeof jobProgress>[1], onChain = true) =>
    jobProgress(status, phase, onChain).map((step) => `${step.label}:${step.state}`);

describe("job progress and role tabs (#28)", () => {
    it("starts at the terms while nothing is on chain", () => {
        expect(states("Open", "None", false)).to.deep.equal([
            "Terms:current",
            "Created:todo",
            "Funded:todo",
            "Submitted:todo",
            "Settled:todo",
        ]);
    });

    it("marks the current stage", () => {
        expect(states("Open", "None")).to.deep.equal([
            "Terms:done",
            "Created:current",
            "Funded:todo",
            "Submitted:todo",
            "Settled:todo",
        ]);
        expect(states("Submitted", "Submitted")).to.deep.equal([
            "Terms:done",
            "Created:done",
            "Funded:done",
            "Submitted:current",
            "Settled:todo",
        ]);
    });

    it("shows a dispute on the third stage", () => {
        expect(states("Submitted", "Escalated")[3]).to.equal("Disputed:alert");
    });

    it("names how the job ended", () => {
        expect(states("Completed", "Resolved")).to.deep.equal([
            "Terms:done",
            "Created:done",
            "Funded:done",
            "Submitted:done",
            "Paid:done",
        ]);
        expect(states("Rejected", "Resolved").slice(3)).to.deep.equal(["Submitted:passed", "Refunded:done"]);
    });

    it("shows only what escrow really holds", () => {
        expect(escrowFor("Open", 2_000_000n)).to.deep.equal({ amount: 0n, note: "2.00 USDC agreed" });
        expect(escrowFor("Funded", 2_000_000n)).to.deep.equal({ amount: 2_000_000n, note: "locked for this job" });
        expect(escrowFor("Submitted", 2_000_000n).amount).to.equal(2_000_000n);
        expect(escrowFor("Completed", 2_000_000n)).to.deep.equal({
            amount: 0n,
            note: "2.00 USDC paid to the provider",
        });
        expect(escrowFor("Expired", 2_000_000n).note).to.equal("2.00 USDC returned to the client");
    });

    it("tells each side what to do", () => {
        expect(roleGuide("provider", "Funded", "Funded", true)).to.contain("submit the deliverable");
        expect(roleGuide("client", "Funded", "Funded", true)).to.contain("Waiting for the provider");
        expect(roleGuide("client", "Submitted", "Submitted", true)).to.contain("Silence pays the provider");
        expect(roleGuide("client", "Submitted", "Submitted", false)).to.not.contain("Silence");
        expect(roleGuide("client", "Submitted", "Submitted", true, "en", false)).to.contain("cannot stop the payment");
        expect(roleGuide("provider", "Submitted", "Submitted", true, "en", false)).to.contain(
            "paid when the review ends"
        );
        expect(roleGuide("provider", "Submitted", "Escalated", true)).to.contain("dispute");
        expect(roleGuide("provider", "Completed", "Resolved", true)).to.equal("Done. You were paid.");
    });
});
