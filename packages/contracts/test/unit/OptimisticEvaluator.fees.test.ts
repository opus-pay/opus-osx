import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

import { deployCore, deployUsdc, EMPTY, testWallets } from "../helpers/acp";
import { deployEvaluator, fundConfiguredJob, submitConfiguredJob } from "../helpers/evaluator";

describe("OptimisticEvaluator fees and tips (#16)", () => {
    const wallets = testWallets();
    const [, , , , client, provider, , stranger, operator, arbiter] = wallets;
    const fee = 2_000000;
    const tip = 500000;

    async function setup() {
        const token = await deployUsdc();
        const core = await deployCore(token.address);
        const evaluator = await deployEvaluator();
        return { token, core, evaluator };
    }

    it("pays the same operator fee on complete and reject (I-2)", async () => {
        const completed = await setup();
        const cId = await submitConfiguredJob(
            completed.core,
            completed.evaluator,
            completed.token,
            client,
            provider,
            operator.address,
            100_000000,
            { evaluationFee: fee }
        );
        expect(await completed.evaluator.feeHeld(completed.core.address, cId)).to.equal(fee);
        await completed.evaluator.connect(client).approve(completed.core.address, cId);
        expect(await completed.token.balanceOf(operator.address)).to.equal(fee);
        expect(await completed.evaluator.feeHeld(completed.core.address, cId)).to.equal(0);
        expect(await completed.token.balanceOf(completed.evaluator.address)).to.equal(0);

        const rejected = await setup();
        const rId = await submitConfiguredJob(
            rejected.core,
            rejected.evaluator,
            rejected.token,
            client,
            provider,
            operator.address,
            100_000000,
            { evaluationFee: fee }
        );
        await rejected.evaluator.connect(provider).withdrawAsProvider(rejected.core.address, rId);
        expect(await rejected.token.balanceOf(operator.address)).to.equal(fee);
        expect(await rejected.token.balanceOf(rejected.evaluator.address)).to.equal(0);
    });

    it("pays a due-trigger tip to a keeper and the rest to the operator", async () => {
        const { token, core, evaluator } = await setup();
        const jobId = await fundConfiguredJob(
            core,
            evaluator,
            token,
            client,
            provider.address,
            operator.address,
            100_000000,
            {
                evaluationFee: fee,
                keeperTip: tip,
            }
        );
        const deadline = (await evaluator.fundedAt(core.address, jobId)).toNumber() + 3600;
        await time.setNextBlockTimestamp(deadline);
        await expect(evaluator.connect(stranger).timeoutNoSubmission(core.address, jobId))
            .to.emit(evaluator, "TipPaid")
            .withArgs(core.address, jobId, stranger.address, tip);
        expect(await token.balanceOf(stranger.address)).to.equal(tip);
        expect(await token.balanceOf(operator.address)).to.equal(fee - tip);
        expect(await token.balanceOf(evaluator.address)).to.equal(0);
    });

    it("pays at most two tips across escalateOnSilence and resolveByDefault", async () => {
        const { token, core, evaluator } = await setup();
        const jobId = await submitConfiguredJob(
            core,
            evaluator,
            token,
            client,
            provider,
            operator.address,
            100_000000,
            {
                evaluationFee: fee,
                keeperTip: tip,
                autoCompleteOnSilence: false,
                arbiter: arbiter.address,
            }
        );
        const review = (await evaluator.reviewEnd(core.address, jobId)).toNumber();
        await time.setNextBlockTimestamp(review);
        await evaluator.connect(stranger).escalateOnSilence(core.address, jobId);
        expect(await token.balanceOf(stranger.address)).to.equal(tip);
        expect(await evaluator.feeHeld(core.address, jobId)).to.equal(fee - tip);

        const dispute = (await evaluator.disputeDeadlineOf(core.address, jobId)).toNumber();
        await time.setNextBlockTimestamp(dispute);
        await evaluator.connect(stranger).resolveByDefault(core.address, jobId);
        expect(await token.balanceOf(stranger.address)).to.equal(tip * 2);
        expect(await token.balanceOf(operator.address)).to.equal(fee - tip * 2);
        expect(await token.balanceOf(evaluator.address)).to.equal(0);
    });

    it("returns the unused fee to the client after claimRefund (I-2)", async () => {
        const { token, core, evaluator } = await setup();
        const jobId = await fundConfiguredJob(
            core,
            evaluator,
            token,
            client,
            provider.address,
            operator.address,
            100_000000,
            {
                evaluationFee: fee,
            }
        );
        const expiredAt = (await core.getJob(jobId)).expiredAt.toNumber();
        await time.setNextBlockTimestamp(expiredAt);
        await core.connect(stranger).claimRefund(jobId);
        const clientBefore = await token.balanceOf(client.address);
        await expect(evaluator.connect(stranger).sweep(core.address, jobId))
            .to.emit(evaluator, "Swept")
            .withArgs(core.address, jobId, client.address, fee);
        expect(await token.balanceOf(client.address)).to.equal(clientBefore.add(fee));
        expect(await token.balanceOf(evaluator.address)).to.equal(0);
        expect(await token.balanceOf(operator.address)).to.equal(0);
    });
});
