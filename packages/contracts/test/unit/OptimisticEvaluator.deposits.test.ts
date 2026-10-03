import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

import { deployCore, deployUsdc, EMPTY, testWallets } from "../helpers/acp";
import { defaultConfig, deployEvaluator, openConfiguredJob, submitConfiguredJob } from "../helpers/evaluator";

describe("OptimisticEvaluator dispute deposits (#53)", () => {
    const wallets = testWallets();
    const [, , , , client, provider, , stranger, operator, arbiter] = wallets;
    const deposit = 1_000000;
    const budget = 100_000000;

    async function setup() {
        const token = await deployUsdc();
        const core = await deployCore(token.address);
        const evaluator = await deployEvaluator();
        return { token, core, evaluator };
    }

    async function submittedWithDeposit(confirmation = false) {
        const ctx = await setup();
        const jobId = await submitConfiguredJob(
            ctx.core,
            ctx.evaluator,
            ctx.token,
            client,
            provider,
            operator.address,
            100_000000,
            {
                arbiter: arbiter.address,
                disputeDeposit: deposit,
                autoCompleteOnSilence: !confirmation,
            }
        );
        if (!confirmation) {
            await ctx.token.mint(client.address, deposit);
            await ctx.token.connect(client).approve(ctx.evaluator.address, deposit);
        }
        await ctx.token.mint(provider.address, deposit);
        await ctx.token.connect(provider).approve(ctx.evaluator.address, deposit);
        return { ...ctx, jobId };
    }

    it("sends the loser's deposit to the arbiter for either ruling (I-1)", async () => {
        const complete = await submittedWithDeposit();
        await complete.evaluator.connect(client).object(complete.core.address, complete.jobId, ethers.utils.id("e"));
        await complete.evaluator.connect(provider).postDeposit(complete.core.address, complete.jobId);
        const arbiterBefore = await complete.token.balanceOf(arbiter.address);
        await complete.evaluator
            .connect(arbiter)
            .rule(complete.core.address, complete.jobId, true, ethers.utils.id("ok"));
        expect(await complete.token.balanceOf(arbiter.address)).to.equal(arbiterBefore.add(deposit));
        expect(await complete.token.balanceOf(provider.address)).to.equal(budget + deposit);
        expect(await complete.token.balanceOf(complete.evaluator.address)).to.equal(0);

        const reject = await submittedWithDeposit();
        await reject.evaluator.connect(client).object(reject.core.address, reject.jobId, ethers.utils.id("e"));
        await reject.evaluator.connect(provider).postDeposit(reject.core.address, reject.jobId);
        await reject.evaluator.connect(arbiter).rule(reject.core.address, reject.jobId, false, ethers.utils.id("no"));
        expect(await reject.token.balanceOf(arbiter.address)).to.equal(deposit);
        expect(await reject.token.balanceOf(client.address)).to.equal(budget + deposit);
        expect(await reject.token.balanceOf(reject.evaluator.address)).to.equal(0);
    });

    it("returns both deposits when the arbiter misses the deadline", async () => {
        const { token, core, evaluator, jobId } = await submittedWithDeposit();
        await evaluator.connect(client).object(core.address, jobId, ethers.utils.id("e"));
        await evaluator.connect(provider).postDeposit(core.address, jobId);
        const deadline = (await evaluator.disputeDeadlineOf(core.address, jobId)).toNumber();
        await time.setNextBlockTimestamp(deadline);
        const clientBefore = await token.balanceOf(client.address);
        const providerBefore = await token.balanceOf(provider.address);
        await evaluator.connect(stranger).resolveByDefault(core.address, jobId);
        expect(await token.balanceOf(client.address)).to.equal(clientBefore.add(deposit));
        expect(await token.balanceOf(provider.address)).to.equal(providerBefore.add(deposit).add(budget));
        expect(await token.balanceOf(arbiter.address)).to.equal(0);
    });

    it("pays the arbiter from the conceding party once both deposits are in (I-9)", async () => {
        const { token, core, evaluator, jobId } = await submittedWithDeposit();
        await evaluator.connect(client).object(core.address, jobId, ethers.utils.id("e"));
        await evaluator.connect(provider).postDeposit(core.address, jobId);
        await evaluator.connect(client).approveJob(core.address, jobId);
        expect(await token.balanceOf(arbiter.address)).to.equal(deposit);
        expect(await token.balanceOf(provider.address)).to.equal(budget + deposit);
    });

    it("returns posted deposits when a party concedes before both are in", async () => {
        const { token, core, evaluator, jobId } = await submittedWithDeposit();
        await evaluator.connect(client).object(core.address, jobId, ethers.utils.id("e"));
        await evaluator.connect(provider).withdrawAsProvider(core.address, jobId);
        expect(await token.balanceOf(client.address)).to.equal(budget + deposit);
        expect(await token.balanceOf(arbiter.address)).to.equal(0);
    });

    it("applies the missing-deposit ruling at the deposit deadline", async () => {
        const { token, core, evaluator, jobId } = await submittedWithDeposit();
        await evaluator.connect(client).object(core.address, jobId, ethers.utils.id("e"));
        const deadline = (await evaluator.depositDeadlineOf(core.address, jobId)).toNumber();
        await time.setNextBlockTimestamp(deadline - 1);
        await expect(
            evaluator.connect(stranger).resolveMissingDeposit(core.address, jobId)
        ).to.be.revertedWithCustomError(evaluator, "TooEarly");
        await time.setNextBlockTimestamp(deadline);
        await expect(evaluator.connect(stranger).resolveMissingDeposit(core.address, jobId)).to.emit(
            core,
            "JobRejected"
        );
        expect(await token.balanceOf(client.address)).to.equal(budget + deposit);
        expect(await token.balanceOf(arbiter.address)).to.equal(0);
    });

    it("starts the dispute clocks at a late escalation, so the windows are never already closed", async () => {
        const { core, evaluator, jobId } = await submittedWithDeposit(true);
        const review = (await evaluator.reviewEnd(core.address, jobId)).toNumber();
        const escalatedAt = review + 3601;
        await time.setNextBlockTimestamp(escalatedAt);
        await evaluator.connect(stranger).escalateOnSilence(core.address, jobId);
        expect((await evaluator.depositDeadlineOf(core.address, jobId)).toNumber()).to.equal(escalatedAt + 3600);
        expect((await evaluator.disputeDeadlineOf(core.address, jobId)).toNumber()).to.equal(escalatedAt + 7200);
        // The provider can still post, so silence alone does not cost it the job.
        await expect(evaluator.connect(provider).postDeposit(core.address, jobId)).to.emit(evaluator, "CaseOpened");
    });

    it("refuses a deposit at the deposit deadline itself, where resolveMissingDeposit takes over", async () => {
        const { core, evaluator, jobId } = await submittedWithDeposit(true);
        const review = (await evaluator.reviewEnd(core.address, jobId)).toNumber();
        await time.setNextBlockTimestamp(review);
        await evaluator.connect(stranger).escalateOnSilence(core.address, jobId);
        const deadline = (await evaluator.depositDeadlineOf(core.address, jobId)).toNumber();
        await time.setNextBlockTimestamp(deadline);
        await expect(evaluator.connect(provider).postDeposit(core.address, jobId)).to.be.revertedWithCustomError(
            evaluator,
            "ReviewEnded"
        );
    });

    it("lets the provider post a deposit with permit", async () => {
        const { token, core, evaluator, jobId } = await submittedWithDeposit();
        await evaluator.connect(client).object(core.address, jobId, ethers.utils.id("e"));
        const deadline = (await time.latest()) + 3600;
        const sig = await provider._signTypedData(
            { name: "USD Coin", version: "1", chainId: 31337, verifyingContract: token.address },
            {
                Permit: [
                    { name: "owner", type: "address" },
                    { name: "spender", type: "address" },
                    { name: "value", type: "uint256" },
                    { name: "nonce", type: "uint256" },
                    { name: "deadline", type: "uint256" },
                ],
            },
            {
                owner: provider.address,
                spender: evaluator.address,
                value: deposit,
                nonce: await token.nonces(provider.address),
                deadline,
            }
        );
        const { v, r, s } = ethers.utils.splitSignature(sig);
        await token.connect(provider).approve(evaluator.address, 0);
        await expect(evaluator.connect(provider).postDepositWithPermit(core.address, jobId, deadline, v, r, s)).to.emit(
            evaluator,
            "DepositPosted"
        );
        expect(await evaluator.phase(core.address, jobId)).to.equal(4);
    });

    it("rejects a second client postDeposit after a prepaid confirmation deposit", async () => {
        const { core, evaluator, jobId } = await submittedWithDeposit(true);
        const review = (await evaluator.reviewEnd(core.address, jobId)).toNumber();
        await time.setNextBlockTimestamp(review);
        await evaluator.connect(stranger).escalateOnSilence(core.address, jobId);
        await expect(evaluator.connect(client).postDeposit(core.address, jobId)).to.be.revertedWithCustomError(
            evaluator,
            "WrongStatus"
        );
    });

    it("rejects a deposit when there is no arbiter", async () => {
        const { token, core, evaluator } = await setup();
        const jobId = await openConfiguredJob(core, evaluator, token, client, provider.address, operator.address);
        await expect(
            evaluator
                .connect(client)
                .configure(core.address, jobId, defaultConfig(operator.address, { disputeDeposit: deposit }))
        ).to.be.revertedWithCustomError(evaluator, "InvalidDepositConfig");
    });

    it("returns a confirmation-mode prepaid deposit when there is no dispute (D22)", async () => {
        const { token, core, evaluator, jobId } = await submittedWithDeposit(true);
        expect(await evaluator.clientDepositOf(core.address, jobId)).to.equal(deposit);
        await evaluator.connect(client).approveJob(core.address, jobId);
        expect(await token.balanceOf(client.address)).to.equal(deposit);
        expect(await token.balanceOf(evaluator.address)).to.equal(0);
    });
});
