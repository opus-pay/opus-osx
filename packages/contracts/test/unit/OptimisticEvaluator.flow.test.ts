import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

import { deployCore, deployUsdc, EMPTY, testWallets } from "../helpers/acp";
import { deployEvaluator, fundConfiguredJob, submitConfiguredJob } from "../helpers/evaluator";

describe("OptimisticEvaluator flow and concession (#15)", () => {
    const wallets = testWallets();
    const [, , , , client, provider, , stranger, operator, arbiter] = wallets;

    async function setup() {
        const token = await deployUsdc();
        const core = await deployCore(token.address);
        const evaluator = await deployEvaluator();
        return { token, core, evaluator };
    }

    it("timeoutNoSubmission rejects at the submit deadline and not one second before", async () => {
        const { token, core, evaluator } = await setup();
        const jobId = await fundConfiguredJob(core, evaluator, token, client, provider.address, operator.address);
        const deadline = (await evaluator.fundedAt(core.address, jobId)).toNumber() + 3600;
        await time.setNextBlockTimestamp(deadline - 1);
        await expect(
            evaluator.connect(stranger).timeoutNoSubmission(core.address, jobId)
        ).to.be.revertedWithCustomError(evaluator, "TooEarly");
        await time.setNextBlockTimestamp(deadline);
        await expect(evaluator.connect(stranger).timeoutNoSubmission(core.address, jobId)).to.emit(core, "JobRejected");
        expect((await core.getJob(jobId)).status).to.equal(4);
    });

    it("lets the client approve after submit and the provider withdraw after fund (I-9)", async () => {
        const first = await setup();
        const approved = await submitConfiguredJob(
            first.core,
            first.evaluator,
            first.token,
            client,
            provider,
            operator.address
        );
        await expect(first.evaluator.connect(client).approve(first.core.address, approved)).to.emit(
            first.core,
            "JobCompleted"
        );

        const second = await setup();
        const funded = await fundConfiguredJob(
            second.core,
            second.evaluator,
            second.token,
            client,
            provider.address,
            operator.address
        );
        await expect(second.evaluator.connect(provider).withdrawAsProvider(second.core.address, funded)).to.emit(
            second.core,
            "JobRejected"
        );
        expect((await second.core.getJob(funded)).status).to.equal(4);
    });

    it("lets either party concede from submitted, escalated, and arbiter-pending states (I-9)", async () => {
        const submitted = await setup();
        const sId = await submitConfiguredJob(
            submitted.core,
            submitted.evaluator,
            submitted.token,
            client,
            provider,
            operator.address
        );
        await expect(submitted.evaluator.connect(provider).withdrawAsProvider(submitted.core.address, sId)).to.emit(
            submitted.core,
            "JobRejected"
        );

        const escalated = await setup();
        const eId = await submitConfiguredJob(
            escalated.core,
            escalated.evaluator,
            escalated.token,
            client,
            provider,
            operator.address
        );
        await escalated.evaluator.connect(client).object(escalated.core.address, eId, ethers.utils.id("obj"));
        await expect(escalated.evaluator.connect(client).approve(escalated.core.address, eId)).to.emit(
            escalated.evaluator,
            "Conceded"
        );
        expect((await escalated.core.getJob(eId)).status).to.equal(3);

        const pending = await setup();
        const pId = await submitConfiguredJob(
            pending.core,
            pending.evaluator,
            pending.token,
            client,
            provider,
            operator.address,
            100_000000,
            { arbiter: arbiter.address }
        );
        await pending.evaluator.connect(client).object(pending.core.address, pId, ethers.utils.id("obj"));
        expect(await pending.evaluator.phase(pending.core.address, pId)).to.equal(4);
        await expect(pending.evaluator.connect(provider).withdrawAsProvider(pending.core.address, pId))
            .to.emit(pending.evaluator, "Conceded")
            .withArgs(pending.core.address, pId, provider.address);
        expect((await pending.core.getJob(pId)).status).to.equal(4);
    });

    it("extendReview is once, within maxExtension, and only before reviewEnd", async () => {
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
                maxExtension: 3600,
            }
        );
        const end = (await evaluator.reviewEnd(core.address, jobId)).toNumber();
        await expect(evaluator.connect(client).extendReview(core.address, jobId, 3601)).to.be.revertedWithCustomError(
            evaluator,
            "ExtensionTooLarge"
        );
        await time.setNextBlockTimestamp(end - 1);
        await evaluator.connect(client).extendReview(core.address, jobId, 3600);
        await expect(evaluator.connect(client).extendReview(core.address, jobId, 1)).to.be.revertedWithCustomError(
            evaluator,
            "AlreadyExtended"
        );
        expect((await evaluator.reviewEnd(core.address, jobId)).toNumber()).to.equal(end + 3600);

        const late = await setup();
        const lateId = await submitConfiguredJob(
            late.core,
            late.evaluator,
            late.token,
            client,
            provider,
            operator.address,
            100_000000,
            { maxExtension: 3600 }
        );
        const lateEnd = (await late.evaluator.reviewEnd(late.core.address, lateId)).toNumber();
        await time.setNextBlockTimestamp(lateEnd);
        await expect(
            late.evaluator.connect(client).extendReview(late.core.address, lateId, 3600)
        ).to.be.revertedWithCustomError(late.evaluator, "ReviewEnded");
    });

    it("object is allowed before reviewEnd and blocked at reviewEnd", async () => {
        const early = await setup();
        const eId = await submitConfiguredJob(
            early.core,
            early.evaluator,
            early.token,
            client,
            provider,
            operator.address
        );
        const end = (await early.evaluator.reviewEnd(early.core.address, eId)).toNumber();
        await time.setNextBlockTimestamp(end - 1);
        await expect(early.evaluator.connect(client).object(early.core.address, eId, ethers.utils.id("e"))).to.emit(
            early.evaluator,
            "Escalated"
        );

        const late = await setup();
        const lId = await submitConfiguredJob(
            late.core,
            late.evaluator,
            late.token,
            client,
            provider,
            operator.address
        );
        const lateEnd = (await late.evaluator.reviewEnd(late.core.address, lId)).toNumber();
        await time.setNextBlockTimestamp(lateEnd);
        await expect(
            late.evaluator.connect(client).object(late.core.address, lId, ethers.utils.id("e"))
        ).to.be.revertedWithCustomError(late.evaluator, "ReviewEnded");
    });

    it("finalize completes at reviewEnd in auto-complete mode and not one second before", async () => {
        const { token, core, evaluator } = await setup();
        const jobId = await submitConfiguredJob(core, evaluator, token, client, provider, operator.address);
        const end = (await evaluator.reviewEnd(core.address, jobId)).toNumber();
        await time.setNextBlockTimestamp(end - 1);
        await expect(evaluator.connect(stranger).finalize(core.address, jobId)).to.be.revertedWithCustomError(
            evaluator,
            "ReviewStillOpen"
        );
        await time.setNextBlockTimestamp(end);
        await expect(evaluator.connect(stranger).finalize(core.address, jobId)).to.emit(core, "JobCompleted");
    });

    it("escalateOnSilence opens a case at reviewEnd in confirmation mode", async () => {
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
                autoCompleteOnSilence: false,
                arbiter: arbiter.address,
            }
        );
        const end = (await evaluator.reviewEnd(core.address, jobId)).toNumber();
        await time.setNextBlockTimestamp(end - 1);
        await expect(evaluator.connect(stranger).escalateOnSilence(core.address, jobId)).to.be.revertedWithCustomError(
            evaluator,
            "ReviewStillOpen"
        );
        await time.setNextBlockTimestamp(end);
        await expect(evaluator.connect(stranger).escalateOnSilence(core.address, jobId)).to.emit(
            evaluator,
            "CaseOpened"
        );
        expect(await evaluator.phase(core.address, jobId)).to.equal(4);
    });

    it("lets the arbiter rule within the dispute window and defaults at the deadline", async () => {
        const ruled = await setup();
        const rId = await submitConfiguredJob(
            ruled.core,
            ruled.evaluator,
            ruled.token,
            client,
            provider,
            operator.address,
            100_000000,
            { arbiter: arbiter.address }
        );
        await ruled.evaluator.connect(client).object(ruled.core.address, rId, ethers.utils.id("e"));
        const deadline = (await ruled.evaluator.disputeDeadlineOf(ruled.core.address, rId)).toNumber();
        await time.setNextBlockTimestamp(deadline);
        await expect(
            ruled.evaluator.connect(arbiter).rule(ruled.core.address, rId, true, ethers.utils.id("win"))
        ).to.emit(ruled.core, "JobCompleted");

        const def = await setup();
        const dId = await submitConfiguredJob(
            def.core,
            def.evaluator,
            def.token,
            client,
            provider,
            operator.address,
            100_000000,
            { arbiter: arbiter.address, defaultComplete: false }
        );
        await def.evaluator.connect(client).object(def.core.address, dId, ethers.utils.id("e"));
        const defDeadline = (await def.evaluator.disputeDeadlineOf(def.core.address, dId)).toNumber();
        await time.setNextBlockTimestamp(defDeadline - 1);
        await expect(
            def.evaluator.connect(stranger).resolveByDefault(def.core.address, dId)
        ).to.be.revertedWithCustomError(def.evaluator, "TooEarly");
        await time.setNextBlockTimestamp(defDeadline);
        await expect(def.evaluator.connect(stranger).resolveByDefault(def.core.address, dId)).to.emit(
            def.core,
            "JobRejected"
        );
    });

    it("resolveByDefault runs immediately when there is no arbiter", async () => {
        const { token, core, evaluator } = await setup();
        const jobId = await submitConfiguredJob(core, evaluator, token, client, provider, operator.address);
        await evaluator.connect(client).object(core.address, jobId, ethers.utils.id("e"));
        await expect(evaluator.connect(stranger).resolveByDefault(core.address, jobId)).to.emit(core, "JobCompleted");
    });

    it("rejects the wrong caller on role-gated functions (I-3)", async () => {
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
                arbiter: arbiter.address,
                maxExtension: 3600,
            }
        );
        await expect(evaluator.connect(stranger).approve(core.address, jobId)).to.be.revertedWithCustomError(
            evaluator,
            "Unauthorized"
        );
        await expect(evaluator.connect(stranger).withdrawAsProvider(core.address, jobId)).to.be.revertedWithCustomError(
            evaluator,
            "Unauthorized"
        );
        await expect(
            evaluator.connect(stranger).object(core.address, jobId, ethers.utils.id("e"))
        ).to.be.revertedWithCustomError(evaluator, "Unauthorized");
        await expect(evaluator.connect(stranger).extendReview(core.address, jobId, 3600)).to.be.revertedWithCustomError(
            evaluator,
            "Unauthorized"
        );
        await evaluator.connect(client).object(core.address, jobId, ethers.utils.id("e"));
        await expect(
            evaluator.connect(stranger).rule(core.address, jobId, true, ethers.utils.id("x"))
        ).to.be.revertedWithCustomError(evaluator, "Unauthorized");
    });
});
