import { expect } from "chai";

import { fundingPlan, stepLabel, stepPosition } from "../src/lib/funding";
import { actionLabel, statusLine } from "../src/lib/status-text";
import { explorerTx } from "../src/lib/tx";

describe("readable job screens (#28)", () => {
    it("labels the escrow state and the review stage apart", () => {
        expect(statusLine({ status: "Funded", phase: "Funded", nextDeadline: 3540n, now: 0n })).to.equal(
            "Escrow: Funded · Review: waiting for the deliverable · Submit within 0h 59m"
        );
        expect(statusLine({ status: "Submitted", phase: "Submitted", nextDeadline: 3600n, now: 0n })).to.equal(
            "Escrow: Submitted · Review: client reviewing · Review ends in 1h 0m"
        );
        expect(statusLine({ status: "Completed", phase: "Resolved", nextDeadline: null, now: 0n })).to.equal(
            "Escrow: Completed · Review: settled"
        );
    });

    it("gives the buttons words instead of function names", () => {
        expect(actionLabel("approve")).to.equal("Approve and pay");
        expect(actionLabel("submit")).to.equal("Submit the deliverable");
    });

    it("counts the funding steps for each lock", () => {
        expect(fundingPlan(2).map((step) => step.action)).to.deep.equal(["create", "quote", "configure", "fund"]);
        expect(fundingPlan(1).find((step) => step.action === "quote")?.signer).to.equal("provider");
        expect(stepPosition(2, "configure")).to.deep.equal({ index: 3, total: 4 });
        expect(stepLabel("fund")).to.equal("Lock the USDC");
    });

    it("links a transaction to the explorer of its chain", () => {
        const hash = `0x${"ab".repeat(32)}` as const;
        expect(explorerTx(80002, hash)).to.equal(`https://amoy.polygonscan.com/tx/${hash}`);
        expect(explorerTx(137, hash)).to.equal(`https://polygonscan.com/tx/${hash}`);
        expect(explorerTx(1, hash)).to.equal(undefined);
    });
});
