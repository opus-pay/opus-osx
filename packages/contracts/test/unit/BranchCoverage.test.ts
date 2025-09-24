import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

import { defaultExpiry, deployCore, deployUsdc, DESC, EMPTY, testWallets } from "../helpers/acp";
import { defaultConfig, deployEvaluator, openConfiguredJob, submitConfiguredJob } from "../helpers/evaluator";
import { KlerosArbiterAdapter, MockKlerosArbitrator } from "../../typechain-types";

describe("Branch coverage fillers (#18)", () => {
    const wallets = testWallets();
    const [, , , , client, provider, , stranger, operator, arbiter] = wallets;

    it("reconfigures a prepaid fee, caps the fee at fund, and allows setProvider before configure", async () => {
        const token = await deployUsdc();
        const core = await deployCore(token.address);
        const ev = await deployEvaluator();
        const expiredAt = await defaultExpiry();
        await core.connect(client).createJob(ethers.constants.AddressZero, ev.address, expiredAt, DESC, ev.address);
        await ev.connect(client).configure(core.address, 1, defaultConfig(operator.address));
        await core.connect(client).setProvider(1, provider.address, EMPTY);

        await token.mint(client.address, 3_000000);
        await token.connect(client).approve(ev.address, 3_000000);
        await ev
            .connect(client)
            .configure(core.address, 1, defaultConfig(operator.address, { evaluationFee: 1_000000 }));
        await ev
            .connect(client)
            .configure(core.address, 1, defaultConfig(operator.address, { evaluationFee: 2_000000 }));
        expect(await ev.feeHeld(core.address, 1)).to.equal(2_000000);

        const core2 = await deployCore(token.address);
        const ev2 = await deployEvaluator();
        await core2.connect(client).createJob(provider.address, ev2.address, expiredAt, DESC, ev2.address);
        await token.mint(client.address, 2_000000);
        await token.connect(client).approve(ev2.address, 2_000000);
        await ev2
            .connect(client)
            .configure(core2.address, 1, defaultConfig(operator.address, { evaluationFee: 2_000000 }));
        await core2.connect(client).setBudget(1, 1_000000, EMPTY);
        await token.mint(client.address, 1_000000);
        await token.connect(client).approve(core2.address, 1_000000);
        await expect(core2.connect(client).fund(1, 1_000000, EMPTY)).to.be.revertedWithCustomError(core2, "HookFailed");
    });

    it("covers remaining evaluator status and Kleros ruling branches", async () => {
        const token = await deployUsdc();
        const core = await deployCore(token.address);
        const ev = await deployEvaluator();
        const jobId = await submitConfiguredJob(core, ev, token, client, provider, operator.address, 100_000000, {
            maxExtension: 3600,
            arbiter: arbiter.address,
            disputeDeposit: 1_000000,
        });
        await expect(ev.connect(client).extendReview(core.address, jobId, 0)).to.be.revertedWithCustomError(
            ev,
            "ExtensionTooLarge"
        );
        await token.mint(client.address, 1_000000);
        await token.connect(client).approve(ev.address, 1_000000);
        await ev.connect(client).object(core.address, jobId, ethers.utils.id("e"));
        await expect(
            ev.connect(client).object(core.address, jobId, ethers.utils.id("e2"))
        ).to.be.revertedWithCustomError(ev, "WrongStatus");
        await expect(ev.connect(stranger).timeoutNoSubmission(core.address, jobId)).to.be.revertedWithCustomError(
            ev,
            "WrongStatus"
        );
        await token.mint(provider.address, 1_000000);
        await token.connect(provider).approve(ev.address, 1_000000);
        await ev.connect(provider).postDeposit(core.address, jobId);
        await expect(ev.connect(provider).postDeposit(core.address, jobId)).to.be.revertedWithCustomError(
            ev,
            "WrongStatus"
        );
        const dispute = (await ev.disputeDeadlineOf(core.address, jobId)).toNumber();
        await time.setNextBlockTimestamp(dispute + 1);
        await expect(
            ev.connect(arbiter).rule(core.address, jobId, true, ethers.utils.id("late"))
        ).to.be.revertedWithCustomError(ev, "ReviewEnded");

        const kleros = (await (
            await ethers.getContractFactory("MockKlerosArbitrator")
        ).deploy()) as MockKlerosArbitrator;
        await kleros.deployed();
        const adapter = (await (
            await ethers.getContractFactory("KlerosArbiterAdapter")
        ).deploy(kleros.address)) as KlerosArbiterAdapter;
        await adapter.deployed();
        await adapter.notifyCase(ev.address, core.address, jobId, [], 0);
        await expect(adapter.bind(ethers.constants.AddressZero, core.address, 1, 1)).to.be.revertedWithCustomError(
            adapter,
            "ZeroAddress"
        );

        const core3 = await deployCore(token.address);
        const ev3 = await deployEvaluator();
        const id3 = await submitConfiguredJob(core3, ev3, token, client, provider, operator.address, 100_000000, {
            arbiter: adapter.address,
            defaultComplete: true,
        });
        await ev3.connect(client).object(core3.address, id3, ethers.utils.id("e"));
        await adapter.bind(ev3.address, core3.address, id3, 3);
        await expect(kleros.deliver(adapter.address, 3, 0)).to.emit(core3, "JobCompleted");
        await expect(kleros.deliver(adapter.address, 3, 1)).to.be.reverted;

        const core4 = await deployCore(token.address);
        const ev4 = await deployEvaluator();
        const id4 = await submitConfiguredJob(core4, ev4, token, client, provider, operator.address, 100_000000, {
            arbiter: adapter.address,
        });
        await ev4.connect(client).object(core4.address, id4, ethers.utils.id("e"));
        await adapter.bind(ev4.address, core4.address, id4, 4);
        await expect(kleros.deliver(adapter.address, 4, 2)).to.emit(core4, "JobRejected");
    });

    it("sweeps a prepaid confirmation deposit after claimRefund and rejects a late postDeposit", async () => {
        const token = await deployUsdc();
        const core = await deployCore(token.address);
        const ev = await deployEvaluator();
        const jobId = await submitConfiguredJob(core, ev, token, client, provider, operator.address, 100_000000, {
            autoCompleteOnSilence: false,
            arbiter: arbiter.address,
            disputeDeposit: 1_000000,
            evaluationFee: 1_000000,
        });
        const review = (await ev.reviewEnd(core.address, jobId)).toNumber();
        await time.setNextBlockTimestamp(review);
        await ev.connect(stranger).escalateOnSilence(core.address, jobId);
        const dep = (await ev.depositDeadlineOf(core.address, jobId)).toNumber();
        await time.setNextBlockTimestamp(dep + 1);
        await expect(ev.connect(provider).postDeposit(core.address, jobId)).to.be.revertedWithCustomError(
            ev,
            "ReviewEnded"
        );
        await expect(ev.connect(stranger).resolveMissingDeposit(core.address, jobId)).to.emit(core, "JobRejected");

        const job2 = await openConfiguredJob(core, ev, token, client, provider.address, operator.address, 100_000000, {
            autoCompleteOnSilence: false,
            arbiter: arbiter.address,
            disputeDeposit: 1_000000,
            evaluationFee: 500000,
        });
        await core.connect(client).fund(job2, 100_000000, EMPTY);
        const expiredAt = (await core.getJob(job2)).expiredAt.toNumber();
        await time.setNextBlockTimestamp(expiredAt);
        await core.connect(stranger).claimRefund(job2);
        await ev.connect(stranger).sweep(core.address, job2);
        expect(await ev.feeHeld(core.address, job2)).to.equal(0);
        expect(await ev.clientDepositOf(core.address, job2)).to.equal(0);
    });

    it("lets a stranger reject an Open job only as the client", async () => {
        const token = await deployUsdc();
        const core = await deployCore(token.address);
        const expiredAt = await defaultExpiry();
        await core
            .connect(client)
            .createJob(provider.address, operator.address, expiredAt, DESC, ethers.constants.AddressZero);
        await expect(core.connect(stranger).reject(1, ethers.utils.id("x"), EMPTY)).to.be.revertedWithCustomError(
            core,
            "Unauthorized"
        );
    });
});
