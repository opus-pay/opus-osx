import { expect } from "chai";
import { ethers } from "hardhat";

import { defaultExpiry, deployCore, deployUsdc, DESC, EMPTY, testWallets } from "../helpers/acp";
import { deployEvaluator, openConfiguredJob } from "../helpers/evaluator";

describe("OptimisticEvaluator budget lock (#17)", () => {
    const wallets = testWallets();
    const [, , , , client, provider, , , operator] = wallets;

    async function setup() {
        const token = await deployUsdc();
        const core = await deployCore(token.address);
        const evaluator = await deployEvaluator();
        return { token, core, evaluator };
    }

    it("does not change setBudget when the job has no evaluator hook", async () => {
        const { core } = await setup();
        const expiredAt = await defaultExpiry();
        await core
            .connect(client)
            .createJob(provider.address, operator.address, expiredAt, DESC, ethers.constants.AddressZero);
        await core.connect(client).setBudget(1, 10_000000, EMPTY);
        await core.connect(provider).setBudget(1, 20_000000, EMPTY);
        expect((await core.getJob(1)).budget).to.equal(20_000000);
    });

    it("allows repeated quotes when budgetLock is none", async () => {
        const { token, core, evaluator } = await setup();
        const jobId = await openConfiguredJob(core, evaluator, token, client, provider.address, operator.address);
        await core.connect(provider).setBudget(jobId, 80_000000, EMPTY);
        await core.connect(client).setBudget(jobId, 90_000000, EMPTY);
        expect((await core.getJob(jobId)).budget).to.equal(90_000000);
    });

    it("locks after the next setBudget once a provider and budget exist", async () => {
        const { token, core, evaluator } = await setup();
        const jobId = await openConfiguredJob(
            core,
            evaluator,
            token,
            client,
            provider.address,
            operator.address,
            100_000000,
            { budgetLock: 1 }
        );
        await core.connect(provider).setBudget(jobId, 80_000000, EMPTY);
        expect((await core.getJob(jobId)).budget).to.equal(80_000000);
        await expect(core.connect(client).setBudget(jobId, 90_000000, EMPTY)).to.be.revertedWithCustomError(
            core,
            "HookFailed"
        );
    });

    it("rejects every setBudget after configure when locked from creation", async () => {
        const { token, core, evaluator } = await setup();
        const jobId = await openConfiguredJob(
            core,
            evaluator,
            token,
            client,
            provider.address,
            operator.address,
            100_000000,
            { budgetLock: 2 }
        );
        expect((await core.getJob(jobId)).budget).to.equal(100_000000);
        await expect(core.connect(client).setBudget(jobId, 80_000000, EMPTY)).to.be.revertedWithCustomError(
            core,
            "HookFailed"
        );
        await expect(core.connect(provider).setBudget(jobId, 80_000000, EMPTY)).to.be.revertedWithCustomError(
            core,
            "HookFailed"
        );
    });
});
