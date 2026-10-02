import { expect } from "chai";

import { dateTime, plainTerms, presetLabel, usdcText } from "../src/lib/terms";

describe("link expiry text", () => {
    // 2026-10-03 10:49:07 UTC
    const at = Date.UTC(2026, 9, 3, 10, 49, 7) / 1000;

    it("prints a 24-hour time with no locale words", () => {
        expect(dateTime(at, 540)).to.equal("2026-10-03 19:49:07 UTC+9");
    });

    it("prints other offsets, including half hours and the west", () => {
        expect(dateTime(at, 0)).to.equal("2026-10-03 10:49:07 UTC+0");
        expect(dateTime(at, 330)).to.equal("2026-10-03 16:19:07 UTC+5:30");
        expect(dateTime(at, -240)).to.equal("2026-10-03 06:49:07 UTC-4");
    });
});

describe("plain words on the link screen", () => {
    it("tells only the client that it can object", () => {
        expect(plainTerms(3600, "client")).to.equal("Paid automatically 1 hour after submission unless you object.");
        expect(plainTerms(3600, "provider")).to.equal(
            "Paid automatically 1 hour after submission unless the client objects."
        );
        expect(plainTerms(3600, "anyone")).to.contain("unless the client objects");
    });

    it("names presets in plain words", () => {
        expect(presetLabel("smallNoArbiter")).to.equal("Small job, no arbiter");
        expect(presetLabel("somethingNew")).to.equal("somethingNew");
    });

    it("prints USDC with two decimals at least", () => {
        expect(usdcText(6_000_000n)).to.equal("6.00");
        expect(usdcText(12_500_000n)).to.equal("12.50");
        expect(usdcText(505_000n)).to.equal("0.505");
        expect(usdcText(0n)).to.equal("0.00");
    });
});
