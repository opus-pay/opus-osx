import { expect } from "chai";

import { PAY_PACKAGE } from "../src/index";

describe("@opus/pay", () => {
    it("exports the package name", () => {
        expect(PAY_PACKAGE).to.equal("@opus/pay");
    });
});
