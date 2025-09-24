import { expect } from "chai";
import { ethers } from "hardhat";

import { defaultExpiry, deployCore, deployUsdc, DESC, EMPTY, fundJob, openJob, testWallets } from "../helpers/acp";
import { defaultConfig, deployEvaluator, openConfiguredJob, submitConfiguredJob } from "../helpers/evaluator";
import { MockFeeOnTransferToken, OpusACPFactory } from "../../typechain-types";

describe("Unit completeness (#18)", () => {
    const wallets = testWallets();
    const [, , , , client, provider, evaluator, stranger, operator, arbiter] = wallets;

    describe("OpusAgenticCommerce errors", () => {
        it("hits remaining constructor, withdraw, fund, and permit errors", async () => {
            const token = await deployUsdc();
            const factory = await ethers.getContractFactory("OpusAgenticCommerce");
            await expect(
                factory.deploy(
                    ethers.constants.AddressZero,
                    6,
                    ethers.constants.AddressZero,
                    0,
                    ethers.constants.AddressZero,
                    ethers.constants.AddressZero
                )
            ).to.be.revertedWithCustomError(factory, "ZeroAddress");
            await expect(
                factory.deploy(
                    token.address,
                    6,
                    stranger.address,
                    1001,
                    ethers.constants.AddressZero,
                    ethers.constants.AddressZero
                )
            ).to.be.revertedWithCustomError(factory, "FeesTooHigh");

            const core = await deployCore(token.address);
            await expect(core.connect(client).withdraw(ethers.constants.AddressZero)).to.be.revertedWithCustomError(
                core,
                "ZeroAddress"
            );
            await expect(core.connect(client).withdraw(client.address)).to.be.revertedWithCustomError(
                core,
                "NothingToWithdraw"
            );

            const expiredAt = await defaultExpiry();
            await core
                .connect(client)
                .createJob(
                    ethers.constants.AddressZero,
                    evaluator.address,
                    expiredAt,
                    DESC,
                    ethers.constants.AddressZero
                );
            await expect(core.connect(client).fund(1, 100_000000, EMPTY)).to.be.revertedWithCustomError(
                core,
                "ProviderNotSet"
            );
            await core.connect(client).setProvider(1, provider.address, EMPTY);
            await expect(core.connect(client).fund(1, 100_000000, EMPTY)).to.be.revertedWithCustomError(
                core,
                "ZeroBudget"
            );
            await core.connect(client).setBudget(1, 100_000000, EMPTY);
            await expect(core.connect(client).fund(1, 99_000000, EMPTY)).to.be.revertedWithCustomError(
                core,
                "BudgetMismatch"
            );

            await token.mint(client.address, 100_000000);
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            await expect(
                core
                    .connect(client)
                    .fundWithPermit(
                        1,
                        100_000000,
                        EMPTY,
                        deadline,
                        0,
                        ethers.constants.HashZero,
                        ethers.constants.HashZero
                    )
            ).to.be.revertedWithCustomError(core, "InsufficientAllowance");
        });
    });

    describe("OpusACPFactory errors", () => {
        it("rejects a zero or non-6/18 token in the constructor list", async () => {
            const factoryFactory = await ethers.getContractFactory("OpusACPFactory");
            await expect(
                factoryFactory.deploy([ethers.constants.AddressZero], ethers.constants.AddressZero)
            ).to.be.revertedWithCustomError(factoryFactory, "ZeroAddress");

            const odd = await (await ethers.getContractFactory("MockPermitToken")).deploy("Odd", "ODD", 8);
            await odd.deployed();
            await expect(
                factoryFactory.deploy([odd.address], ethers.constants.AddressZero)
            ).to.be.revertedWithCustomError(factoryFactory, "InvalidTokenDecimals");
            const listed = (await factoryFactory.deploy(
                [(await deployUsdc()).address],
                ethers.constants.AddressZero
            )) as OpusACPFactory;
            expect((await listed.stablecoins()).length).to.equal(1);
        });
    });

    describe("OptimisticEvaluator errors", () => {
        it("hits configure, sweep, withdraw, and fee-config errors", async () => {
            const token = await deployUsdc();
            const core = await deployCore(token.address);
            const ev = await deployEvaluator();
            const expiredAt = await defaultExpiry();
            await core.connect(client).createJob(provider.address, ev.address, expiredAt, DESC, ev.address);
            await core.connect(client).setBudget(1, 100_000000, EMPTY);

            await expect(
                ev.connect(client).configure(ethers.constants.AddressZero, 1, defaultConfig(operator.address))
            ).to.be.revertedWithCustomError(ev, "ZeroAddress");
            await expect(
                ev.connect(client).configure(core.address, 1, defaultConfig(operator.address, { budgetLock: 3 }))
            ).to.be.revertedWithCustomError(ev, "InvalidBudgetLock");
            await expect(
                ev.connect(client).configure(
                    core.address,
                    1,
                    defaultConfig(operator.address, {
                        evaluationFee: 1_000000,
                        operator: ethers.constants.AddressZero,
                    })
                )
            ).to.be.revertedWithCustomError(ev, "InvalidFeeConfig");
            await expect(
                ev
                    .connect(client)
                    .configure(
                        core.address,
                        1,
                        defaultConfig(operator.address, { evaluationFee: 1_000000, keeperTip: 600000 })
                    )
            ).to.be.revertedWithCustomError(ev, "InvalidFeeConfig");
            await expect(
                ev
                    .connect(client)
                    .configure(core.address, 1, defaultConfig(operator.address, { disputeDeposit: 1_000000 }))
            ).to.be.revertedWithCustomError(ev, "InvalidDepositConfig");

            await ev.connect(client).configure(core.address, 1, defaultConfig(operator.address));
            await expect(ev.connect(stranger).timeoutNoSubmission(core.address, 1)).to.be.revertedWithCustomError(
                ev,
                "WrongStatus"
            );
            await expect(ev.connect(client).approve(core.address, 1)).to.be.revertedWithCustomError(ev, "WrongStatus");
            await expect(ev.connect(provider).withdrawAsProvider(core.address, 1)).to.be.revertedWithCustomError(
                ev,
                "WrongStatus"
            );
            await expect(ev.connect(stranger).sweep(core.address, 1)).to.be.revertedWithCustomError(ev, "WrongStatus");
            await expect(ev.connect(client).withdraw(token.address, client.address)).to.be.revertedWithCustomError(
                ev,
                "NothingToWithdraw"
            );
            await expect(
                ev.connect(client).withdraw(token.address, ethers.constants.AddressZero)
            ).to.be.revertedWithCustomError(ev, "ZeroAddress");

            const unconfigured = await deployCore(token.address);
            await expect(ev.connect(stranger).finalize(unconfigured.address, 1)).to.be.revertedWithCustomError(
                ev,
                "NotConfigured"
            );
        });

        it("rejects a fee-on-transfer evaluation fee and sweeps nothing after a fee-less end", async () => {
            const feeToken = (await (
                await ethers.getContractFactory("MockFeeOnTransferToken")
            ).deploy("Fee", "FEE", 6)) as MockFeeOnTransferToken;
            await feeToken.deployed();
            const core = await deployCore(feeToken.address);
            const ev = await deployEvaluator();
            const expiredAt = await defaultExpiry();
            await core.connect(client).createJob(provider.address, ev.address, expiredAt, DESC, ev.address);
            await core.connect(client).setBudget(1, 100_000000, EMPTY);
            await feeToken.mint(client.address, 2_000000);
            await feeToken.connect(client).approve(ev.address, 2_000000);
            await expect(
                ev
                    .connect(client)
                    .configure(core.address, 1, defaultConfig(operator.address, { evaluationFee: 2_000000 }))
            ).to.be.revertedWithCustomError(ev, "UnexpectedFeeAmount");

            const token = await deployUsdc();
            const core2 = await deployCore(token.address);
            const ev2 = await deployEvaluator();
            const jobId = await openConfiguredJob(core2, ev2, token, client, provider.address, operator.address);
            await core2.connect(client).reject(jobId, ethers.utils.id("cancel"), EMPTY);
            await expect(ev2.connect(stranger).sweep(core2.address, jobId)).to.be.revertedWithCustomError(
                ev2,
                "NothingToSweep"
            );
        });

        it("covers mode, deposit, and adapter error branches", async () => {
            const token = await deployUsdc();
            const core = await deployCore(token.address);
            const ev = await deployEvaluator();
            const autoId = await submitConfiguredJob(core, ev, token, client, provider, operator.address);
            await expect(ev.connect(stranger).escalateOnSilence(core.address, autoId)).to.be.revertedWithCustomError(
                ev,
                "WrongMode"
            );
            await expect(ev.connect(stranger).postDeposit(core.address, autoId)).to.be.revertedWithCustomError(
                ev,
                "WrongStatus"
            );

            const core2 = await deployCore(token.address);
            const ev2 = await deployEvaluator();
            const confirmId = await submitConfiguredJob(
                core2,
                ev2,
                token,
                client,
                provider,
                operator.address,
                100_000000,
                { autoCompleteOnSilence: false, arbiter: arbiter.address, disputeDeposit: 1_000000 }
            );
            await expect(ev2.connect(stranger).finalize(core2.address, confirmId)).to.be.revertedWithCustomError(
                ev2,
                "WrongMode"
            );
            const reviewEnd = (await ev2.reviewEnd(core2.address, confirmId)).toNumber();
            const { time } = await import("@nomicfoundation/hardhat-network-helpers");
            await time.setNextBlockTimestamp(reviewEnd);
            await ev2.connect(stranger).escalateOnSilence(core2.address, confirmId);
            await expect(ev2.connect(stranger).postDeposit(core2.address, confirmId)).to.be.revertedWithCustomError(
                ev2,
                "Unauthorized"
            );
            await token.mint(provider.address, 1_000000);
            await token.connect(provider).approve(ev2.address, 1_000000);
            await ev2.connect(provider).postDeposit(core2.address, confirmId);
            await expect(
                ev2.connect(stranger).resolveByDefault(core2.address, confirmId)
            ).to.be.revertedWithCustomError(ev2, "TooEarly");

            const adapterFactory = await ethers.getContractFactory("KlerosArbiterAdapter");
            await expect(adapterFactory.deploy(ethers.constants.AddressZero)).to.be.revertedWithCustomError(
                adapterFactory,
                "ZeroAddress"
            );
            const adapter = await adapterFactory.deploy(arbiter.address);
            await adapter.deployed();
            await expect(adapter.connect(stranger).rule(1, 1)).to.be.revertedWithCustomError(adapter, "Unauthorized");
            await expect(adapter.connect(arbiter).rule(1, 1)).to.be.revertedWithCustomError(adapter, "UnknownDispute");
            await adapter.bind(ev.address, core.address, autoId, 9);
            await expect(adapter.bind(ev.address, core.address, autoId, 10)).to.be.revertedWithCustomError(
                adapter,
                "AlreadyBound"
            );
            expect(await ev.supportsInterface("0x01ffc9a7")).to.equal(true);
            expect(await ev.supportsInterface("0xffffffff")).to.equal(false);
            expect(await ev.reviewEnd(core.address, 99)).to.equal(0);
        });

        it("defers an evaluation fee when the operator cannot receive tokens (I-2)", async () => {
            const [deployer] = testWallets();
            const frozen = await (await ethers.getContractFactory("MockBlacklistToken")).deploy("Blk", "BLK", 6);
            await frozen.deployed();
            const core = await deployCore(frozen.address);
            const ev = await deployEvaluator();
            const expiredAt = await defaultExpiry();
            await core.connect(client).createJob(provider.address, ev.address, expiredAt, DESC, ev.address);
            await core.connect(client).setBudget(1, 100_000000, EMPTY);
            await frozen.mint(client.address, 101_000000);
            await frozen.connect(client).approve(ev.address, 1_000000);
            await ev
                .connect(client)
                .configure(core.address, 1, defaultConfig(operator.address, { evaluationFee: 1_000000 }));
            await frozen.connect(client).approve(core.address, 100_000000);
            await core.connect(client).fund(1, 100_000000, EMPTY);
            await core.connect(provider).submit(1, ethers.utils.id("w"), EMPTY);
            await frozen.connect(deployer).setBlacklisted(operator.address, true);
            await ev.connect(client).approve(core.address, 1);
            expect(await ev.claimable(frozen.address, operator.address)).to.equal(1_000000);
            await frozen.connect(deployer).setBlacklisted(operator.address, false);
            await ev.connect(operator).withdraw(frozen.address, operator.address);
            expect(await frozen.balanceOf(operator.address)).to.equal(1_000000);
        });
    });
});
