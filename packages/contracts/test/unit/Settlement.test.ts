import { expect } from "chai";
import { ethers } from "hardhat";

import { deployCore, deployUsdc, EMPTY, fundJob, testWallets } from "../helpers/acp";

describe("Settlement (#7)", () => {
    const wallets = testWallets();
    const [, treasury, , , client, provider, evaluator] = wallets;

    it("pays the instance treasury only on complete and never on reject or refund (I-1, D13)", async () => {
        const token = await deployUsdc();
        const core = await deployCore(token.address, 6, treasury.address, 250);
        expect(await core.EVALUATOR_FEE_BP()).to.equal(0);

        const jobId = await fundJob(core, token, client, provider, evaluator, 100_000000);
        await core.connect(provider).submit(jobId, ethers.constants.HashZero, EMPTY);
        await core.connect(evaluator).complete(jobId, ethers.constants.HashZero, EMPTY);

        expect(await token.balanceOf(treasury.address)).to.equal(2_500000);
        expect(await token.balanceOf(provider.address)).to.equal(97_500000);
        expect(await token.balanceOf(core.address)).to.equal(0);

        const token2 = await deployUsdc();
        const core2 = await deployCore(token2.address, 6, treasury.address, 250);
        const rejected = await fundJob(core2, token2, client, provider, evaluator, 50_000000);
        await core2.connect(evaluator).reject(rejected, ethers.constants.HashZero, EMPTY);
        expect(await token2.balanceOf(treasury.address)).to.equal(0);
        expect(await token2.balanceOf(client.address)).to.equal(50_000000);
    });

    it("keeps toProvider + fee == budget for many fee and amount pairs", async () => {
        const fees = [0, 1, 250, 999, 1000];
        const budgets = [1, 7, 999_999, 100_000000, 1_000_000000];
        for (const feeBP of fees) {
            for (const budget of budgets) {
                const fee = Math.floor((budget * feeBP) / 10_000);
                expect(budget - fee + fee).to.equal(budget);
            }
        }

        const token = await deployUsdc();
        const core = await deployCore(token.address, 6, treasury.address, 333);
        const budget = 1000;
        const jobId = await fundJob(core, token, client, provider, evaluator, budget);
        await core.connect(provider).submit(jobId, ethers.constants.HashZero, EMPTY);
        await core.connect(evaluator).complete(jobId, ethers.constants.HashZero, EMPTY);
        const fee = Math.floor((budget * 333) / 10_000);
        expect((await token.balanceOf(treasury.address)).add(await token.balanceOf(provider.address))).to.equal(budget);
        expect(await token.balanceOf(treasury.address)).to.equal(fee);
    });

    it("rejects a fee without a treasury, a treasury without a fee, and a fee above the cap", async () => {
        const token = await deployUsdc();
        const factory = await ethers.getContractFactory("OpusAgenticCommerce");
        await expect(
            factory.deploy(
                token.address,
                6,
                ethers.constants.AddressZero,
                100,
                ethers.constants.AddressZero,
                ethers.constants.AddressZero
            )
        ).to.be.revertedWithCustomError(factory, "InvalidFeeConfig");
        await expect(
            factory.deploy(
                token.address,
                6,
                treasury.address,
                0,
                ethers.constants.AddressZero,
                ethers.constants.AddressZero
            )
        ).to.be.revertedWithCustomError(factory, "InvalidFeeConfig");
        await expect(
            factory.deploy(
                token.address,
                6,
                treasury.address,
                1001,
                ethers.constants.AddressZero,
                ethers.constants.AddressZero
            )
        ).to.be.revertedWithCustomError(factory, "FeesTooHigh");
    });
});
