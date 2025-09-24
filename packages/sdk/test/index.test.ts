import { expect } from "chai";

import { MAX_BUDGET_USD, SDK_PACKAGE, splitBudgetUsd } from "../src/index";

describe("@opus/sdk", () => {
    it("exports the package name", () => {
        expect(SDK_PACKAGE).to.equal("@opus/sdk");
    });

    it("splits work above 1,000 USD into several jobs (#10)", () => {
        expect(splitBudgetUsd(1000)).to.deep.equal([1000]);
        expect(splitBudgetUsd(1000.5)).to.deep.equal([1000, 0.5]);
        expect(splitBudgetUsd(2500)).to.deep.equal([MAX_BUDGET_USD, MAX_BUDGET_USD, 500]);
        expect(splitBudgetUsd(0)).to.deep.equal([]);
    });
});
