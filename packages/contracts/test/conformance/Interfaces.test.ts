import { expect } from "chai";
import { ethers } from "hardhat";

describe("ERC-8183 interfaces (#3)", () => {
    const specFund = ethers.utils.id("fund(uint256,uint256,bytes)").slice(0, 10);
    const referenceOmitFund = ethers.utils.id("fund(uint256,bytes)").slice(0, 10);

    it("exposes the specification function selectors", () => {
        const iface = new ethers.utils.Interface([
            "function createJob(address,address,uint256,string,address) returns (uint256)",
            "function setProvider(uint256,address,bytes)",
            "function setBudget(uint256,uint256,bytes)",
            "function fund(uint256,uint256,bytes)",
            "function submit(uint256,bytes32,bytes)",
            "function complete(uint256,bytes32,bytes)",
            "function reject(uint256,bytes32,bytes)",
            "function claimRefund(uint256)",
            "function beforeAction(uint256,bytes4,bytes)",
            "function afterAction(uint256,bytes4,bytes)",
        ]);

        expect(iface.getSighash("fund")).to.equal(specFund);
        expect(iface.getSighash("beforeAction")).to.equal(
            ethers.utils.id("beforeAction(uint256,bytes4,bytes)").slice(0, 10)
        );
        expect(iface.getSighash("afterAction")).to.equal(
            ethers.utils.id("afterAction(uint256,bytes4,bytes)").slice(0, 10)
        );
    });

    it("uses D11 fund(uint256,uint256,bytes) and not fund(uint256,bytes)", () => {
        expect(specFund).to.not.equal(referenceOmitFund);
    });
});
