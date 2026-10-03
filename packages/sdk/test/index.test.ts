import { expect } from "chai";

import { MAX_BUDGET_USD, SDK_PACKAGE, splitBudgetUsd } from "../src/index";

describe("@opus/sdk", () => {
    it("exports the package name", () => {
        expect(SDK_PACKAGE).to.equal("@opus/sdk");
    });

    it("splits work above the per-job cap into several jobs (#10)", () => {
        expect(splitBudgetUsd(100)).to.deep.equal([100]);
        expect(splitBudgetUsd(100.5)).to.deep.equal([100, 0.5]);
        expect(splitBudgetUsd(250)).to.deep.equal([MAX_BUDGET_USD, MAX_BUDGET_USD, 50]);
        expect(splitBudgetUsd(0)).to.deep.equal([]);
    });
});
