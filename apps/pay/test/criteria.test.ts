import { expect } from "chai";
import { keccak256, stringToBytes } from "viem";

import { criteriaHash, criteriaText, suggestCriteria } from "../src/lib/criteria";

describe("completion criteria (#30)", () => {
    it("writes a template and hashes it for the job", () => {
        const text = criteriaText("errand", "Photo of the station clock.");
        expect(text).to.contain("Photo of the station clock.");
        expect(criteriaHash(text)).to.equal(keccak256(stringToBytes(text)));
        expect(criteriaText("code", "")).to.contain("named tests pass");
    });

    it("uses the template when no assistant is configured", async () => {
        const text = await suggestCriteria("ship the report", "report", undefined);
        expect(text).to.contain("ship the report");
        expect(text).to.contain("cites its sources");
    });

    it("uses the assistant text when an endpoint is set", async () => {
        const text = await suggestCriteria("vague", "design", "https://assistant.example", async () => {
            return new Response(JSON.stringify({ criteria: "Three frames, the agreed headline, and the logo." }), {
                status: 200,
                headers: { "content-type": "application/json" },
            });
        });
        expect(text).to.equal("Three frames, the agreed headline, and the logo.");
    });
});
