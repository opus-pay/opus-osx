import { expect } from "chai";

import { SDK_PACKAGE } from "../src/index";

describe("@opus/sdk", () => {
    it("exports the package name", () => {
        expect(SDK_PACKAGE).to.equal("@opus/sdk");
    });
});
