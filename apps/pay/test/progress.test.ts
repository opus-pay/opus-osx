import { expect } from "chai";

import { jobProgress } from "../src/lib/progress";
import { escrowFor, roleGuide } from "../src/lib/status-text";

const states = (status: Parameters<typeof jobProgress>[0], phase: Parameters<typeof jobProgress>[1]) =>
    jobProgress(status, phase).map((step) => `${step.label}:${step.state}`);

describe("job progress and role tabs (#28)", () => {
    it("marks the current stage", () => {
        expect(states("Open", "None")).to.deep.equal([
            "Created:current",
            "Funded:todo",
            "Submitted:todo",
            "Settled:todo",
        ]);
        expect(states("Submitted", "Submitted")).to.deep.equal([
            "Created:done",
            "Funded:done",
            "Submitted:current",
            "Settled:todo",
        ]);
    });

    it("shows a dispute on the third stage", () => {
        expect(states("Submitted", "Escalated")[2]).to.equal("Disputed:alert");
    });

    it("names how the job ended", () => {
        expect(states("Completed", "Resolved")).to.deep.equal([
            "Created:done",
            "Funded:done",
            "Submitted:done",
            "Paid:done",
        ]);
        expect(states("Rejected", "Resolved").slice(2)).to.deep.equal(["Submitted:passed", "Refunded:done"]);
    });

    it("says where the budget is", () => {
        expect(escrowFor("Open", 5n).note).to.equal("agreed, not locked yet");
        expect(escrowFor("Funded", 5n)).to.deep.equal({ amount: 5n, note: "locked in escrow" });
        expect(escrowFor("Completed", 5n).note).to.equal("paid to the provider");
        expect(escrowFor("Expired", 5n).note).to.equal("returned to the client");
    });

    it("tells each side what to do", () => {
        expect(roleGuide("provider", "Funded", "Funded", true)).to.contain("submit the deliverable");
        expect(roleGuide("client", "Funded", "Funded", true)).to.contain("Waiting for the provider");
        expect(roleGuide("client", "Submitted", "Submitted", true)).to.contain("Silence pays the provider");
        expect(roleGuide("client", "Submitted", "Submitted", false)).to.not.contain("Silence");
        expect(roleGuide("provider", "Submitted", "Escalated", true)).to.contain("dispute");
        expect(roleGuide("provider", "Completed", "Resolved", true)).to.equal("Done. You were paid.");
    });
});
