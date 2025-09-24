import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

import { defaultExpiry, deployCore, deployUsdc, DESC, EMPTY, testWallets } from "../helpers/acp";
import { defaultConfig, deployEvaluator, openConfiguredJob } from "../helpers/evaluator";

describe("OptimisticEvaluator configure and hook (#14)", () => {
    const wallets = testWallets();
    const [, , , , client, provider, , stranger, operator, arbiter] = wallets;

    async function setup() {
        const token = await deployUsdc();
        const core = await deployCore(token.address);
        const evaluator = await deployEvaluator();
        return { token, core, evaluator };
    }

    it("lets the client configure an Open job that names this evaluator and hook", async () => {
        const { token, core, evaluator } = await setup();
        const jobId = await openConfiguredJob(core, evaluator, token, client, provider.address, operator.address);
        const cfg = await evaluator.getConfig(core.address, jobId);
        expect(cfg.submitWindow).to.equal(3600);
        expect(cfg.operator).to.equal(operator.address);
        await expect(core.connect(client).fund(jobId, 100_000000, EMPTY)).to.emit(core, "JobFunded");
        expect(await evaluator.fundedAt(core.address, jobId)).to.be.gt(0);
    });

    it("reverts configure for a stranger, a wrong evaluator, or a funded job (I-5)", async () => {
        const { token, core, evaluator } = await setup();
        const expiredAt = await defaultExpiry();
        await core.connect(client).createJob(provider.address, evaluator.address, expiredAt, DESC, evaluator.address);
        await core.connect(client).setBudget(1, 100_000000, EMPTY);
        const cfg = defaultConfig(operator.address);

        await expect(evaluator.connect(stranger).configure(core.address, 1, cfg)).to.be.revertedWithCustomError(
            evaluator,
            "Unauthorized"
        );

        const other = await deployCore(token.address);
        await other.connect(client).createJob(provider.address, stranger.address, expiredAt, DESC, evaluator.address);
        await expect(evaluator.connect(client).configure(other.address, 1, cfg)).to.be.revertedWithCustomError(
            evaluator,
            "NotEvaluator"
        );

        await evaluator.connect(client).configure(core.address, 1, cfg);
        await token.mint(client.address, 100_000000);
        await token.connect(client).approve(core.address, 100_000000);
        await core.connect(client).fund(1, 100_000000, EMPTY);
        await expect(evaluator.connect(client).configure(core.address, 1, cfg)).to.be.revertedWithCustomError(
            evaluator,
            "WrongStatus"
        );
    });

    it("rejects confirmation mode without an arbiter", async () => {
        const { token, core, evaluator } = await setup();
        await openConfiguredJob(core, evaluator, token, client, provider.address, operator.address);
        await expect(
            evaluator
                .connect(client)
                .configure(core.address, 1, defaultConfig(operator.address, { autoCompleteOnSilence: false }))
        ).to.be.revertedWithCustomError(evaluator, "ConfirmationNeedsArbiter");
    });

    it("rejects an arbiter who is the client or the provider", async () => {
        const { token, core, evaluator } = await setup();
        await openConfiguredJob(core, evaluator, token, client, provider.address, operator.address);
        await expect(
            evaluator
                .connect(client)
                .configure(core.address, 1, defaultConfig(operator.address, { arbiter: client.address }))
        ).to.be.revertedWithCustomError(evaluator, "ArbiterIsParty");
        await expect(
            evaluator
                .connect(client)
                .configure(core.address, 1, defaultConfig(operator.address, { arbiter: provider.address }))
        ).to.be.revertedWithCustomError(evaluator, "ArbiterIsParty");
    });

    it("rejects windows outside the D3 placeholders", async () => {
        const { token, core, evaluator } = await setup();
        await openConfiguredJob(core, evaluator, token, client, provider.address, operator.address);
        await expect(
            evaluator
                .connect(client)
                .configure(core.address, 1, defaultConfig(operator.address, { submitWindow: 3599 }))
        ).to.be.revertedWithCustomError(evaluator, "WindowOutOfBounds");
        await expect(
            evaluator
                .connect(client)
                .configure(core.address, 1, defaultConfig(operator.address, { reviewWindow: 180 * 24 * 60 * 60 + 1 }))
        ).to.be.revertedWithCustomError(evaluator, "WindowOutOfBounds");
    });

    it("does not fund a job without config or whose windows miss expiredAt", async () => {
        const { token, core, evaluator } = await setup();
        const expiredAt = await defaultExpiry();
        await core.connect(client).createJob(provider.address, evaluator.address, expiredAt, DESC, evaluator.address);
        await core.connect(client).setBudget(1, 100_000000, EMPTY);
        await token.mint(client.address, 100_000000);
        await token.connect(client).approve(core.address, 100_000000);
        await expect(core.connect(client).fund(1, 100_000000, EMPTY)).to.be.revertedWithCustomError(core, "HookFailed");

        await evaluator.connect(client).configure(
            core.address,
            1,
            defaultConfig(operator.address, {
                submitWindow: 24 * 3600,
                reviewWindow: 24 * 3600,
                maxExtension: 24 * 3600,
                depositWindow: 24 * 3600,
                disputeWindow: 24 * 3600,
            })
        );
        await expect(core.connect(client).fund(1, 100_000000, EMPTY)).to.be.revertedWithCustomError(core, "HookFailed");
    });

    it("rejects an evaluation fee above the budget cap (D18)", async () => {
        const { token, core, evaluator } = await setup();
        const expiredAt = await defaultExpiry();
        await core.connect(client).createJob(provider.address, evaluator.address, expiredAt, DESC, evaluator.address);
        await core.connect(client).setBudget(1, 1_000000, EMPTY);
        await expect(
            evaluator
                .connect(client)
                .configure(core.address, 1, defaultConfig(operator.address, { evaluationFee: 1_000001 }))
        ).to.be.revertedWithCustomError(evaluator, "EvaluationFeeTooHigh");
    });

    it("blocks submit after the submit window and records submittedAt inside it", async () => {
        const { token, core, evaluator } = await setup();
        const jobId = await openConfiguredJob(core, evaluator, token, client, provider.address, operator.address);
        await core.connect(client).fund(jobId, 100_000000, EMPTY);
        const funded = (await evaluator.fundedAt(core.address, jobId)).toNumber();
        await time.setNextBlockTimestamp(funded + 3599);
        await core.connect(provider).submit(jobId, ethers.utils.id("ok"), EMPTY);
        expect(await evaluator.submittedAt(core.address, jobId)).to.equal(funded + 3599);

        const { token: token2, core: core2, evaluator: evaluator2 } = await setup();
        const job2 = await openConfiguredJob(core2, evaluator2, token2, client, provider.address, operator.address);
        await core2.connect(client).fund(job2, 100_000000, EMPTY);
        const funded2 = (await evaluator2.fundedAt(core2.address, job2)).toNumber();
        await time.setNextBlockTimestamp(funded2 + 3600);
        await expect(
            core2.connect(provider).submit(job2, ethers.utils.id("late"), EMPTY)
        ).to.be.revertedWithCustomError(core2, "HookFailed");
    });

    it("does not revert when the evaluator itself completes or rejects", async () => {
        const { token, core, evaluator } = await setup();
        const jobId = await openConfiguredJob(core, evaluator, token, client, provider.address, operator.address);
        await core.connect(client).fund(jobId, 100_000000, EMPTY);
        await core.connect(provider).submit(jobId, ethers.utils.id("work"), EMPTY);

        await ethers.provider.send("hardhat_impersonateAccount", [evaluator.address]);
        await ethers.provider.send("hardhat_setBalance", [evaluator.address, "0x1000000000000000000"]);
        const asEvaluator = await ethers.getSigner(evaluator.address);
        await expect(core.connect(asEvaluator).complete(jobId, ethers.utils.id("done"), EMPTY)).to.emit(
            core,
            "JobCompleted"
        );
    });

    it("lets fundWithPermit take the same fund hook path", async () => {
        const { token, core, evaluator } = await setup();
        const expiredAt = await defaultExpiry();
        await core.connect(client).createJob(provider.address, evaluator.address, expiredAt, DESC, evaluator.address);
        await core.connect(client).setBudget(1, 100_000000, EMPTY);
        await evaluator.connect(client).configure(core.address, 1, defaultConfig(operator.address));
        await token.mint(client.address, 100_000000);
        const deadline = (await time.latest()) + 3600;
        const nonce = await token.nonces(client.address);
        const signature = await client._signTypedData(
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
            { owner: client.address, spender: core.address, value: 100_000000, nonce, deadline }
        );
        const { v, r, s } = ethers.utils.splitSignature(signature);
        await core.connect(client).fundWithPermit(1, 100_000000, EMPTY, deadline, v, r, s);
        expect(await evaluator.fundedAt(core.address, 1)).to.be.gt(0);
    });

    it("blocks setProvider when the new provider is the arbiter", async () => {
        const { token, core, evaluator } = await setup();
        const expiredAt = await defaultExpiry();
        await core
            .connect(client)
            .createJob(ethers.constants.AddressZero, evaluator.address, expiredAt, DESC, evaluator.address);
        await core.connect(client).setBudget(1, 100_000000, EMPTY);
        await evaluator
            .connect(client)
            .configure(core.address, 1, defaultConfig(operator.address, { arbiter: arbiter.address }));
        await expect(core.connect(client).setProvider(1, arbiter.address, EMPTY)).to.be.revertedWithCustomError(
            core,
            "HookFailed"
        );
        await core.connect(client).setProvider(1, provider.address, EMPTY);
        expect((await core.getJob(1)).provider).to.equal(provider.address);
    });

    it("replaces config while Open", async () => {
        const { token, core, evaluator } = await setup();
        const jobId = await openConfiguredJob(core, evaluator, token, client, provider.address, operator.address);
        await evaluator
            .connect(client)
            .configure(core.address, jobId, defaultConfig(operator.address, { reviewWindow: 7200 }));
        expect((await evaluator.getConfig(core.address, jobId)).reviewWindow).to.equal(7200);
    });

    it("configureWithPermit pulls the evaluation fee after a permit", async () => {
        const { token, core, evaluator } = await setup();
        const expiredAt = await defaultExpiry();
        await core.connect(client).createJob(provider.address, evaluator.address, expiredAt, DESC, evaluator.address);
        await core.connect(client).setBudget(1, 100_000000, EMPTY);
        await token.mint(client.address, 1_000000);
        const deadline = (await time.latest()) + 3600;
        const sig = await client._signTypedData(
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
                owner: client.address,
                spender: evaluator.address,
                value: 1_000000,
                nonce: await token.nonces(client.address),
                deadline,
            }
        );
        const { v, r, s } = ethers.utils.splitSignature(sig);
        await evaluator
            .connect(client)
            .configureWithPermit(
                core.address,
                1,
                defaultConfig(operator.address, { evaluationFee: 1_000000 }),
                deadline,
                v,
                r,
                s
            );
        expect(await evaluator.feeHeld(core.address, 1)).to.equal(1_000000);
    });
});
