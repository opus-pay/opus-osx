import { expect } from "chai";

import { dateTime } from "../src/lib/terms";

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
