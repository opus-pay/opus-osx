import { expect } from "chai";
import { keccak256, stringToBytes } from "viem";

import { countdown, proofHash, textHash } from "../src/lib/proof";

describe("job status helpers (#28)", () => {
    it("hashes the off-chain proof", () => {
        const bytes = new Uint8Array([1, 2, 3]);
        expect(proofHash(bytes)).to.equal(keccak256(bytes));
        expect(textHash("objection")).to.equal(keccak256(stringToBytes("objection")));
    });

    it("counts down to the next deadline", () => {
        expect(countdown(null, 10n)).to.equal("No deadline");
        expect(countdown(10n, 10n)).to.equal("Due now");
        expect(countdown(3700n, 0n)).to.equal("1h 1m");
        expect(countdown(90000n, 0n)).to.equal("1d 1h");
    });
});
