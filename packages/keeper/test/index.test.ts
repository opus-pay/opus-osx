import { expect } from "chai";

import { KEEPER_PACKAGE } from "../src/index";

describe("@opus/keeper", () => {
    it("exports the package name", () => {
        expect(KEEPER_PACKAGE).to.equal("@opus/keeper");
    });
});
