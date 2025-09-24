import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { Wallet } from "ethers";
import { ethers } from "hardhat";

import { HardhatAccount } from "../src/HardhatAccount";
import { StableAmount } from "../src/utils/Amount";
import { BootstrapProbe } from "../typechain-types";

describe("Toolchain setup", () => {
    const raws = HardhatAccount.keys.map((key) => new Wallet(key, ethers.provider));
    const [deployer] = raws;

    let probe: BootstrapProbe;

    before(async () => {
        const factory = await ethers.getContractFactory("BootstrapProbe");
        probe = (await factory.connect(deployer).deploy()) as BootstrapProbe;
        await probe.deployed();
    });

    it("resolves OpenZeppelin 5.x imports", async () => {
        expect(await probe.erc20Selector()).to.not.equal("0x00000000");
        expect(await probe.openzeppelinModulesResolve()).to.equal(true);
    });

    it("matches custom errors", async () => {
        const unreachable = (await time.latest()) + 365 * 24 * 60 * 60;
        await expect(probe.requireTimestamp(unreachable)).to.be.revertedWithCustomError(probe, "TimestampNotReached");
    });

    it("travels forward in time", async () => {
        const target = (await time.latest()) + 7 * 24 * 60 * 60;
        await time.increaseTo(target);
        expect(await probe.requireTimestamp(target)).to.be.gte(target);
    });

    it("keeps USDT-scale amounts at 6 decimals", () => {
        expect(StableAmount.make("10").toString()).to.equal("10000000");
    });
});
