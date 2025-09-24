import { expect } from "chai";
import { existsSync, readFileSync, unlinkSync } from "fs";
import { join } from "path";
import { ethers } from "hardhat";

import { addProtocolDeployers, addressesPath } from "../../src/deploy/protocol";
import { Deployments } from "../../src/Deployments";

describe("Protocol deploy (#22)", () => {
    const file = join(__dirname, "../../", addressesPath("localhost"));

    after(() => {
        if (existsSync(file)) unlinkSync(file);
        const legacy = join(__dirname, "../../deploy/localhost/deployed_contracts.json");
        if (existsSync(legacy)) unlinkSync(legacy);
    });

    it("deploys forwarder → factory → fee-0 USDC instance → evaluator and passes the post-deploy check", async () => {
        const deployments = new Deployments("localhost");
        await deployments.initAccounts();
        await addProtocolDeployers(deployments, "localhost");
        await deployments.doDeploy();

        const addresses = JSON.parse(readFileSync(file, "utf8"));
        expect(addresses.forwarder).to.match(/^0x/);
        const instance = await ethers.getContractAt("OpusAgenticCommerce", addresses.instance);
        expect(await instance.platformTreasury()).to.equal(ethers.constants.AddressZero);
        expect(await instance.platformFeeBP()).to.equal(0);
        expect(await instance.isTrustedForwarder(addresses.forwarder)).to.equal(true);
        const evaluator = await ethers.getContractAt("OptimisticEvaluator", addresses.evaluator);
        expect(await evaluator.isTrustedForwarder(addresses.forwarder)).to.equal(true);
        expect(instance.interface.functions["setPlatformFee(uint256)"]).to.equal(undefined);
        expect(evaluator.interface.functions["setTrustedForwarder(address)"]).to.equal(undefined);
    });
});
