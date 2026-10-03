import { expect } from "chai";
import { getAddress } from "viem";

import { decodeDraft, encodeDraft, linkFor, parties, type Draft } from "../src/lib/draft";
import { nextFundingAction } from "../src/lib/funding";
import { plainTerms } from "../src/lib/terms";

const counterparty = getAddress("0x00000000000000000000000000000000000000c0");
const drafter = getAddress("0x00000000000000000000000000000000000000d0");

function sample(over: Partial<Draft> = {}): Draft {
    return {
        v: 1,
        expiresAt: 2_000,
        from: drafter,
        counterparty,
        amountUsd: 25,
        preset: "smallNoArbiter",
        agreement: "Film the station and send the file.",
        lock: 2,
        drafter: "client",
        ...over,
    };
}

describe("payment link draft (#27)", () => {
    it("round-trips the draft in the link fragment", () => {
        const draft = sample();
        const link = linkFor("https://pay.example", draft);
        const token = link.split("#")[1];
        expect(decodeDraft(token, 1_000)).to.deep.equal(draft);
        expect(link.startsWith("https://pay.example/open#")).to.equal(true);
    });

    it("rejects an expired link and a bad amount", () => {
        const token = encodeDraft(sample());
        expect(() => decodeDraft(token, 2_000)).to.throw("The link has expired");
        expect(() => encodeDraft(sample({ amountUsd: 1001 }))).to.throw("1,000 USD");
        expect(() => decodeDraft("%%%", 1)).to.throw("payment draft");
    });

    it("assigns client and provider from the drafter role", () => {
        expect(parties(sample({ drafter: "client" })).provider).to.equal(counterparty);
        expect(parties(sample({ drafter: "provider" })).client).to.equal(counterparty);
        expect(() => encodeDraft(sample({ counterparty: drafter }))).to.throw("different wallet");
    });

    it("speaks the review window in plain language", () => {
        expect(plainTerms(3 * 24 * 60 * 60)).to.equal("Paid automatically 3 days after submission unless you object.");
        expect(plainTerms(3600)).to.equal("Paid automatically 1 hour after submission unless you object.");
        expect(plainTerms(3600, "client", "en", false)).to.equal(
            "Paid to the provider automatically 1 hour after submission. This job has no arbiter, so an objection cannot stop the payment."
        );
    });

    it("keeps the client amount lock ahead of configure, and the provider quote after it", () => {
        expect(
            nextFundingAction({ lock: 2, exists: false, budget: 0n, configured: false, funded: false })
        ).to.deep.equal({ action: "create", signer: "client" });
        const quote = nextFundingAction({ lock: 2, exists: true, budget: 0n, configured: false, funded: false });
        const configure = nextFundingAction({ lock: 2, exists: true, budget: 1n, configured: false, funded: false });
        if (quote === "funded" || configure === "funded") throw new Error("still funding");
        expect(quote.action).to.equal("quote");
        expect(configure.action).to.equal("configure");
        expect(nextFundingAction({ lock: 1, exists: true, budget: 0n, configured: true, funded: false })).to.deep.equal(
            {
                action: "quote",
                signer: "provider",
            }
        );
        expect(nextFundingAction({ lock: 1, exists: true, budget: 1n, configured: true, funded: true })).to.equal(
            "funded"
        );
    });
});
