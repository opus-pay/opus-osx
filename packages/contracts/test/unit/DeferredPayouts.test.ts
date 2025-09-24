import { expect } from "chai";
import { ethers } from "hardhat";

import { MockBlacklistToken, OpusAgenticCommerce } from "../../typechain-types";
import { defaultExpiry, deployCore, EMPTY, testWallets } from "../helpers/acp";

describe("Deferred payouts (#8)", () => {
    const wallets = testWallets();
    const [deployer, treasury, , , client, provider, evaluator] = wallets;

    async function deployFrozen(feeBP = 0) {
        const factory = await ethers.getContractFactory("MockBlacklistToken");
        const token = (await factory.connect(deployer).deploy("USDT", "USDT", 6)) as MockBlacklistToken;
        await token.deployed();
        const treasuryAddr = feeBP === 0 ? ethers.constants.AddressZero : treasury.address;
        const core = await deployCore(token.address, 6, treasuryAddr, feeBP);
        const expiredAt = await defaultExpiry();
        const budget = 100_000000;
        await core
            .connect(client)
            .createJob(provider.address, evaluator.address, expiredAt, "ipfs://j", ethers.constants.AddressZero);
        await core.connect(client).setBudget(1, budget, EMPTY);
        await token.mint(client.address, budget);
        await token.connect(client).approve(core.address, budget);
        await core.connect(client).fund(1, budget, EMPTY);
        return { token, core, budget };
    }

    it("completes when the provider is frozen and lets them withdraw later (I-2)", async () => {
        const { token, core, budget } = await deployFrozen();
        await token.setBlacklisted(provider.address, true);
        await core.connect(provider).submit(1, ethers.constants.HashZero, EMPTY);
        await expect(core.connect(evaluator).complete(1, ethers.constants.HashZero, EMPTY))
            .to.emit(core, "PayoutDeferred")
            .withArgs(provider.address, budget);
        expect(await core.claimable(provider.address)).to.equal(budget);
        expect(await token.balanceOf(core.address)).to.equal(budget);

        await token.setBlacklisted(provider.address, false);
        await expect(core.connect(provider).withdraw(provider.address))
            .to.emit(core, "Withdrawn")
            .withArgs(provider.address, provider.address, budget);
        expect(await token.balanceOf(provider.address)).to.equal(budget);
        expect(await core.claimable(provider.address)).to.equal(0);
        expect(await token.balanceOf(core.address)).to.equal(0);
    });

    it("refunds a frozen client into claimable", async () => {
        const { token, core, budget } = await deployFrozen();
        await token.setBlacklisted(client.address, true);
        await expect(core.connect(evaluator).reject(1, ethers.constants.HashZero, EMPTY))
            .to.emit(core, "PayoutDeferred")
            .withArgs(client.address, budget);
        expect(await core.claimable(client.address)).to.equal(budget);
        await token.setBlacklisted(client.address, false);
        await core.connect(client).withdraw(evaluator.address);
        expect(await token.balanceOf(evaluator.address)).to.equal(budget);
    });

    it("defers a frozen treasury fee and still pays the provider", async () => {
        const { token, core } = await deployFrozen(250);
        await token.setBlacklisted(treasury.address, true);
        await core.connect(provider).submit(1, ethers.constants.HashZero, EMPTY);
        await core.connect(evaluator).complete(1, ethers.constants.HashZero, EMPTY);
        expect(await core.claimable(treasury.address)).to.equal(2_500000);
        expect(await token.balanceOf(provider.address)).to.equal(97_500000);
        expect(await token.balanceOf(core.address)).to.equal(await core.claimable(treasury.address));
    });
});
