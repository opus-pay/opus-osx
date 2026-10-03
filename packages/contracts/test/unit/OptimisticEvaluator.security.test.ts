import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

import { MockFakeInstance, MockPermitToken, OptimisticEvaluator } from "../../typechain-types";
import { deployCore, testWallets } from "../helpers/acp";
import { defaultConfig, deployEvaluator, openConfiguredJob } from "../helpers/evaluator";

/**
 * Regression tests for the AI-assisted security review (docs/audit/SECURITY_REVIEW.md).
 * Each test replays an attack that worked before the fix and checks that it now fails.
 */
describe("OptimisticEvaluator security regressions", () => {
    const wallets = testWallets();
    const [, , , , client, provider, , stranger, operator, arbiter] = wallets;
    const Open = 0;
    const Completed = 3;
    const D = 50_000000;

    async function token(symbol: string): Promise<MockPermitToken> {
        const t = (await (
            await ethers.getContractFactory("MockPermitToken")
        ).deploy(symbol, symbol, 6)) as MockPermitToken;
        await t.deployed();
        return t;
    }

    async function setup() {
        const evaluator = await deployEvaluator();
        const usdc = await token("USDC");
        const junk = await token("JUNK");
        // Money the evaluator holds for honest jobs.
        await usdc.mint(evaluator.address, 1_000_000000);
        const fake = (await (await ethers.getContractFactory("MockFakeInstance")).deploy()) as MockFakeInstance;
        const expiredAt = (await time.latest()) + 30 * 24 * 3600;
        await fake.setJob(client.address, provider.address, evaluator.address, 100_000000, expiredAt, Open);
        await fake.setToken(junk.address);
        for (const w of [client, provider]) {
            await junk.mint(w.address, D);
            await junk.connect(w).approve(evaluator.address, D);
        }
        const confirmation = defaultConfig(operator.address, {
            autoCompleteOnSilence: false,
            arbiter: arbiter.address,
            disputeDeposit: D,
        });
        return { evaluator, usdc, junk, fake, confirmation };
    }

    it("refuses afterAction(submit) on a case that was never funded", async () => {
        const { evaluator, fake, confirmation } = await setup();
        await evaluator.connect(client).configure(fake.address, 1, confirmation);
        await expect(fake.callAfterSubmit(evaluator.address, 1)).to.be.reverted;
    });

    it("refuses to change the token a case already holds", async () => {
        const { evaluator, usdc, fake, confirmation } = await setup();
        await evaluator.connect(client).configure(fake.address, 1, confirmation);
        await fake.setToken(usdc.address);
        await expect(
            evaluator.connect(client).configure(fake.address, 1, defaultConfig(operator.address))
        ).to.be.revertedWithCustomError(evaluator, "TokenChanged");
    });

    it("refuses to reconfigure once a case has left its first phase", async () => {
        const { evaluator, fake, confirmation } = await setup();
        await evaluator.connect(client).configure(fake.address, 1, confirmation);
        await fake.callBeforeFund(evaluator.address, 1);
        await expect(evaluator.connect(client).configure(fake.address, 1, confirmation)).to.be.revertedWithCustomError(
            evaluator,
            "ConfigFrozen"
        );
    });

    it("keeps the pooled USDC when a fake instance replays the old drain", async () => {
        const { evaluator, usdc, fake, confirmation } = await setup();
        // The exact path that drained the evaluator before the fix. Each step is attempted;
        // after the fix the second step already fails, and nothing later can move USDC.
        const attempt = (p: Promise<unknown>) => p.then(() => true).catch(() => false);
        await evaluator.connect(client).configure(fake.address, 1, confirmation);
        await attempt(fake.callAfterSubmit(evaluator.address, 1)); // skip funding
        await attempt(evaluator.connect(client).object(fake.address, 1, ethers.utils.id("e")));
        await attempt(evaluator.connect(provider).postDeposit(fake.address, 1)); // deposit paid in junk
        await fake.setToken(usdc.address);
        await attempt(evaluator.connect(client).configure(fake.address, 1, defaultConfig(operator.address)));
        await fake.setStatus(Completed);
        await attempt(evaluator.connect(stranger).sweep(fake.address, 1)); // would pay the junk deposit in USDC
        expect(await usdc.balanceOf(evaluator.address)).to.equal(1_000_000000);
        expect(await usdc.balanceOf(provider.address)).to.equal(0);
    });

    it("rejects configs that leave a party no time or no remedy", async () => {
        const { evaluator, fake } = await setup();
        await expect(
            evaluator
                .connect(client)
                .configure(fake.address, 1, defaultConfig(operator.address, { defaultComplete: false }))
        ).to.be.revertedWithCustomError(evaluator, "NoArbiterNeedsDefaultComplete");
        await expect(
            evaluator
                .connect(client)
                .configure(
                    fake.address,
                    1,
                    defaultConfig(operator.address, { arbiter: arbiter.address, disputeWindow: 0 })
                )
        ).to.be.revertedWithCustomError(evaluator, "WindowOutOfBounds");
        await expect(
            evaluator
                .connect(client)
                .configure(
                    fake.address,
                    1,
                    defaultConfig(operator.address, { arbiter: arbiter.address, disputeDeposit: D, depositWindow: 0 })
                )
        ).to.be.revertedWithCustomError(evaluator, "WindowOutOfBounds");
    });

    it("caps the evaluation fee at 20% of the budget", async () => {
        const { evaluator } = await setup();
        expect(await evaluator.MAX_EVALUATION_FEE_BP()).to.equal(2_000);
    });

    it("lets an honest job finish after the changes", async () => {
        const evaluator: OptimisticEvaluator = await deployEvaluator();
        const usdc = await token("USDC");
        const core = await deployCore(usdc.address);
        const jobId = await openConfiguredJob(core, evaluator, usdc, client, provider.address, operator.address);
        await core.connect(client).fund(jobId, 100_000000, "0x");
        await core.connect(provider).submit(jobId, ethers.utils.id("work"), "0x");
        await evaluator.connect(client).approveJob(core.address, jobId);
        expect(await usdc.balanceOf(provider.address)).to.equal(100_000000);
    });
});
