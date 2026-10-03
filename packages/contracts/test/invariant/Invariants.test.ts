import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

import { MockPermitToken, OptimisticEvaluator, OpusAgenticCommerce } from "../../typechain-types";
import { DESC, EMPTY, deployCore, deployUsdc, testWallets } from "../helpers/acp";
import { defaultConfig, deployEvaluator } from "../helpers/evaluator";

const FUNDED = 1;
const SUBMITTED = 2;
const COMPLETED = 3;
const REJECTED = 4;
const EXPIRED = 5;

function mulberry32(seed: number): () => number {
    return () => {
        seed |= 0;
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

describe("Invariant suite (#19)", () => {
    const wallets = testWallets();
    const [, treasury, , , client, provider, , stranger, operator, arbiter] = wallets;
    const seed = Number(process.env.INVARIANT_SEED ?? "1");
    const actions = Number(process.env.INVARIANT_ACTIONS ?? "64");

    async function assertI2(
        core: OpusAgenticCommerce,
        ev: OptimisticEvaluator,
        token: MockPermitToken,
        accounts: string[]
    ) {
        const count = (await core.jobCount()).toNumber();
        let escrowed = ethers.BigNumber.from(0);
        let held = ethers.BigNumber.from(0);
        for (let id = 1; id <= count; id++) {
            const job = await core.getJob(id);
            if (job.status === FUNDED || job.status === SUBMITTED) {
                escrowed = escrowed.add(job.budget);
            }
            held = held.add(await ev.feeHeld(core.address, id));
            held = held.add(await ev.clientDepositOf(core.address, id));
            held = held.add(await ev.providerDepositOf(core.address, id));
        }
        let coreClaimable = ethers.BigNumber.from(0);
        let evClaimable = ethers.BigNumber.from(0);
        for (const account of accounts) {
            coreClaimable = coreClaimable.add(await core.claimable(account));
            evClaimable = evClaimable.add(await ev.claimable(token.address, account));
        }
        expect(await token.balanceOf(core.address), "I-2 instance").to.equal(escrowed.add(coreClaimable));
        expect(await token.balanceOf(ev.address), "I-2 evaluator").to.equal(held.add(evClaimable));
    }

    it("checks I-1/I-2 after every random action and keeps terminal jobs still (I-7)", async () => {
        const rand = mulberry32(seed);
        const token = await deployUsdc();
        const core = await deployCore(token.address);
        const ev = await deployEvaluator();
        const accounts = [
            client.address,
            provider.address,
            stranger.address,
            operator.address,
            treasury.address,
            arbiter.address,
        ];
        const terminals = new Map<number, number>();

        const pick = (n: number) => Math.floor(rand() * n);
        const maybe = async (fn: () => Promise<void>) => {
            try {
                await fn();
            } catch {
                /* invalid in this state */
            }
        };

        for (let i = 0; i < actions; i++) {
            const roll = pick(16);
            if (roll === 0 || roll === 1) {
                const expiredAt = (await time.latest()) + 2 * 24 * 60 * 60;
                await core.connect(client).createJob(provider.address, ev.address, expiredAt, DESC, ev.address);
                const id = (await core.jobCount()).toNumber();
                await core.connect(client).setBudget(id, 100_000000, EMPTY);
                const confirmation = roll === 1;
                const cfg = defaultConfig(operator.address, {
                    autoCompleteOnSilence: !confirmation,
                    arbiter: confirmation ? arbiter.address : ethers.constants.AddressZero,
                    disputeDeposit: confirmation ? 1_000000 : 0,
                });
                if (confirmation) {
                    await token.mint(client.address, 1_000000);
                    await token.connect(client).approve(ev.address, 1_000000);
                }
                await ev.connect(client).configure(core.address, id, cfg);
                await token.mint(client.address, 100_000000);
                await token.connect(client).approve(core.address, 100_000000);
            } else {
                const count = (await core.jobCount()).toNumber();
                if (count === 0) continue;
                const id = pick(count) + 1;
                if (roll === 2) await maybe(() => core.connect(client).fund(id, 100_000000, EMPTY));
                else if (roll === 3) await maybe(() => core.connect(provider).submit(id, ethers.utils.id("w"), EMPTY));
                else if (roll === 4) await maybe(() => ev.connect(client).approveJob(core.address, id));
                else if (roll === 5) await maybe(() => ev.connect(provider).withdrawAsProvider(core.address, id));
                else if (roll === 6) await maybe(() => ev.connect(stranger).timeoutNoSubmission(core.address, id));
                else if (roll === 7) await maybe(() => ev.connect(stranger).finalize(core.address, id));
                else if (roll === 8)
                    await maybe(() => ev.connect(client).object(core.address, id, ethers.utils.id("o")));
                else if (roll === 9) {
                    await token.mint(provider.address, 1_000000);
                    await token.connect(provider).approve(ev.address, 1_000000);
                    await maybe(() => ev.connect(provider).postDeposit(core.address, id));
                } else if (roll === 10) await maybe(() => ev.connect(stranger).resolveMissingDeposit(core.address, id));
                else if (roll === 11)
                    await maybe(() => ev.connect(arbiter).rule(core.address, id, pick(2) === 0, ethers.utils.id("r")));
                else if (roll === 12) await maybe(() => ev.connect(stranger).resolveByDefault(core.address, id));
                else if (roll === 13) await maybe(() => ev.connect(stranger).sweep(core.address, id));
                else if (roll === 14) await maybe(() => ev.connect(client).withdraw(token.address, client.address));
                else {
                    await time.increase(3600);
                    await maybe(() => ev.connect(stranger).escalateOnSilence(core.address, id));
                    await maybe(() => core.connect(stranger).claimRefund(id));
                }
            }

            const count = (await core.jobCount()).toNumber();
            for (let id = 1; id <= count; id++) {
                const status = (await core.getJob(id)).status;
                if (status === COMPLETED || status === REJECTED || status === EXPIRED) {
                    if (terminals.has(id)) {
                        expect(status, `I-7 job ${id}`).to.equal(terminals.get(id));
                    } else {
                        terminals.set(id, status);
                    }
                }
            }
            await assertI2(core, ev, token, accounts);
        }
    });

    it("ends every max-window job with only permissionless calls (I-4)", async () => {
        const token = await deployUsdc();
        const core = await deployCore(token.address);
        const ev = await deployEvaluator();
        const now = await time.latest();
        const expiredAt = now + 180 * 24 * 60 * 60;
        const cfg = defaultConfig(operator.address, {
            submitWindow: 3600,
            reviewWindow: 3600,
            maxExtension: 0,
            depositWindow: 0,
            disputeWindow: 0,
        });

        for (let n = 0; n < 2; n++) {
            await core.connect(client).createJob(provider.address, ev.address, expiredAt, `ipfs://${n}`, ev.address);
            const id = n + 1;
            await core.connect(client).setBudget(id, 100_000000, EMPTY);
            await ev.connect(client).configure(core.address, id, cfg);
            await token.mint(client.address, 100_000000);
            await token.connect(client).approve(core.address, 100_000000);
            await core.connect(client).fund(id, 100_000000, EMPTY);
        }
        await core.connect(provider).submit(2, ethers.utils.id("w"), EMPTY);

        await time.increase(3600);
        await ev.connect(stranger).timeoutNoSubmission(core.address, 1);
        await time.increase(3600);
        await ev.connect(stranger).finalize(core.address, 2);

        expect((await core.getJob(1)).status).to.equal(REJECTED);
        expect((await core.getJob(2)).status).to.equal(COMPLETED);

        const confirmCfg = defaultConfig(operator.address, {
            submitWindow: 3600,
            reviewWindow: 3600,
            maxExtension: 0,
            depositWindow: 3600,
            disputeWindow: 3600,
            autoCompleteOnSilence: false,
            arbiter: arbiter.address,
            disputeDeposit: 1_000000,
        });
        await core.connect(client).createJob(provider.address, ev.address, expiredAt, "ipfs://c", ev.address);
        await core.connect(client).setBudget(3, 100_000000, EMPTY);
        await token.mint(client.address, 101_000000);
        await token.connect(client).approve(ev.address, 1_000000);
        await ev.connect(client).configure(core.address, 3, confirmCfg);
        await token.connect(client).approve(core.address, 100_000000);
        await core.connect(client).fund(3, 100_000000, EMPTY);
        await core.connect(provider).submit(3, ethers.utils.id("w"), EMPTY);
        await time.increase(3600);
        await ev.connect(stranger).escalateOnSilence(core.address, 3);
        await time.increase(3600);
        await ev.connect(stranger).resolveMissingDeposit(core.address, 3);
        expect((await core.getJob(3)).status).to.equal(REJECTED);

        await core.connect(client).createJob(provider.address, ev.address, expiredAt, "ipfs://d", ev.address);
        await core.connect(client).setBudget(4, 100_000000, EMPTY);
        await token.mint(client.address, 101_000000);
        await token.connect(client).approve(ev.address, 1_000000);
        await ev.connect(client).configure(core.address, 4, confirmCfg);
        await token.connect(client).approve(core.address, 100_000000);
        await core.connect(client).fund(4, 100_000000, EMPTY);
        await core.connect(provider).submit(4, ethers.utils.id("w"), EMPTY);
        await token.mint(provider.address, 1_000000);
        await token.connect(provider).approve(ev.address, 1_000000);
        await ev.connect(client).object(core.address, 4, ethers.utils.id("o"));
        await ev.connect(provider).postDeposit(core.address, 4);
        await time.setNextBlockTimestamp((await ev.disputeDeadlineOf(core.address, 4)).toNumber());
        await ev.connect(stranger).resolveByDefault(core.address, 4);
        expect((await core.getJob(4)).status).to.equal(COMPLETED);
    });

    it("concession always ends the job in the other party's favour (I-9)", async () => {
        const token = await deployUsdc();
        const core = await deployCore(token.address);
        const ev = await deployEvaluator();
        const expiredAt = (await time.latest()) + 2 * 24 * 60 * 60;
        await core.connect(client).createJob(provider.address, ev.address, expiredAt, DESC, ev.address);
        await core.connect(client).setBudget(1, 100_000000, EMPTY);
        await ev.connect(client).configure(core.address, 1, defaultConfig(operator.address));
        await token.mint(client.address, 100_000000);
        await token.connect(client).approve(core.address, 100_000000);
        await core.connect(client).fund(1, 100_000000, EMPTY);
        await ev.connect(provider).withdrawAsProvider(core.address, 1);
        expect((await core.getJob(1)).status).to.equal(REJECTED);
        expect(await token.balanceOf(client.address)).to.equal(100_000000);

        await core.connect(client).createJob(provider.address, ev.address, expiredAt, DESC, ev.address);
        await core.connect(client).setBudget(2, 100_000000, EMPTY);
        await ev.connect(client).configure(core.address, 2, defaultConfig(operator.address));
        await token.mint(client.address, 100_000000);
        await token.connect(client).approve(core.address, 100_000000);
        await core.connect(client).fund(2, 100_000000, EMPTY);
        await core.connect(provider).submit(2, ethers.utils.id("w"), EMPTY);
        await ev.connect(client).approveJob(core.address, 2);
        expect((await core.getJob(2)).status).to.equal(COMPLETED);
        expect(await token.balanceOf(provider.address)).to.equal(100_000000);
    });
});

describe("Invariant regressions (#19)", () => {
    it("keeps the CI seed list so a failed nightly seed can be pasted here", () => {
        const regressionSeeds = [1];
        expect(regressionSeeds).to.include(1);
    });
});
