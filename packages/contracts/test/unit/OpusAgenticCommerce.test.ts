import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

import { MockFeeOnTransferToken, OpusAgenticCommerce } from "../../typechain-types";
import { defaultExpiry, deployCore, deployUsdc, DESC, EMPTY, fundJob, openJob, testWallets } from "../helpers/acp";

describe("OpusAgenticCommerce (#6)", () => {
    const wallets = testWallets();
    const [, , , , client, provider, evaluator, stranger] = wallets;

    let token: Awaited<ReturnType<typeof deployUsdc>>;
    let core: OpusAgenticCommerce;

    beforeEach(async () => {
        token = await deployUsdc();
        core = await deployCore(token.address);
    });

    async function createOpen(providerAddr = provider.address) {
        const expiredAt = await defaultExpiry();
        const tx = await core
            .connect(client)
            .createJob(providerAddr, evaluator.address, expiredAt, DESC, ethers.constants.AddressZero);
        const receipt = await tx.wait();
        return receipt.events?.find((e) => e.event === "JobCreated")?.args?.jobId.toNumber() as number;
    }

    describe("createJob", () => {
        it("creates an Open job and records the client", async () => {
            const expiredAt = await defaultExpiry();
            await expect(
                core
                    .connect(client)
                    .createJob(provider.address, evaluator.address, expiredAt, DESC, ethers.constants.AddressZero)
            )
                .to.emit(core, "JobCreated")
                .withArgs(
                    1,
                    client.address,
                    provider.address,
                    evaluator.address,
                    expiredAt,
                    ethers.constants.AddressZero
                );
            const job = await core.getJob(1);
            expect(job.client).to.equal(client.address);
            expect(job.status).to.equal(0);
            expect(job.description).to.equal(DESC);
            const view = await core.getJobView(1);
            expect(view.client).to.equal(client.address);
            expect(view.hook).to.equal(ethers.constants.AddressZero);
        });

        it("allows a zero provider", async () => {
            const jobId = await createOpen(ethers.constants.AddressZero);
            expect((await core.getJob(jobId)).provider).to.equal(ethers.constants.AddressZero);
        });

        it("reverts when the evaluator is zero", async () => {
            await expect(
                core
                    .connect(client)
                    .createJob(
                        provider.address,
                        ethers.constants.AddressZero,
                        await defaultExpiry(),
                        DESC,
                        ethers.constants.AddressZero
                    )
            ).to.be.revertedWithCustomError(core, "ZeroAddress");
        });

        it("reverts when expiredAt is before the minimum duration", async () => {
            const next = (await time.latest()) + 1;
            await time.setNextBlockTimestamp(next);
            await expect(
                core
                    .connect(client)
                    .createJob(provider.address, evaluator.address, next + 3600 - 1, DESC, ethers.constants.AddressZero)
            ).to.be.revertedWithCustomError(core, "ExpiryTooSoon");
        });

        it("accepts expiredAt at the minimum and maximum bounds", async () => {
            const next = (await time.latest()) + 1;
            await time.setNextBlockTimestamp(next);
            await core
                .connect(client)
                .createJob(provider.address, evaluator.address, next + 3600, DESC, ethers.constants.AddressZero);
            const next2 = (await time.latest()) + 1;
            await time.setNextBlockTimestamp(next2);
            await core
                .connect(client)
                .createJob(
                    provider.address,
                    evaluator.address,
                    next2 + 180 * 24 * 3600,
                    DESC,
                    ethers.constants.AddressZero
                );
        });

        it("reverts when expiredAt is past the maximum duration", async () => {
            const next = (await time.latest()) + 1;
            await time.setNextBlockTimestamp(next);
            await expect(
                core
                    .connect(client)
                    .createJob(
                        provider.address,
                        evaluator.address,
                        next + 180 * 24 * 3600 + 1,
                        DESC,
                        ethers.constants.AddressZero
                    )
            ).to.be.revertedWithCustomError(core, "ExpiryTooFar");
        });
    });

    describe("setProvider", () => {
        it("lets the client set a provider once while Open", async () => {
            const jobId = await createOpen(ethers.constants.AddressZero);
            await expect(core.connect(client).setProvider(jobId, provider.address, EMPTY))
                .to.emit(core, "ProviderSet")
                .withArgs(jobId, provider.address);
        });

        it("reverts for a stranger, a second set, a zero provider, a funded job, and an unknown id", async () => {
            const jobId = await createOpen(ethers.constants.AddressZero);
            await expect(
                core.connect(stranger).setProvider(jobId, provider.address, EMPTY)
            ).to.be.revertedWithCustomError(core, "Unauthorized");
            await expect(
                core.connect(client).setProvider(jobId, ethers.constants.AddressZero, EMPTY)
            ).to.be.revertedWithCustomError(core, "ZeroAddress");
            await core.connect(client).setProvider(jobId, provider.address, EMPTY);
            await expect(
                core.connect(client).setProvider(jobId, stranger.address, EMPTY)
            ).to.be.revertedWithCustomError(core, "WrongStatus");
            await expect(core.connect(client).setProvider(99, provider.address, EMPTY)).to.be.revertedWithCustomError(
                core,
                "InvalidJob"
            );

            const funded = await fundJob(core, token, client, provider, evaluator);
            await expect(
                core.connect(client).setProvider(funded, stranger.address, EMPTY)
            ).to.be.revertedWithCustomError(core, "WrongStatus");
        });
    });

    describe("setBudget", () => {
        it("lets the client or the provider set the budget while Open", async () => {
            const jobId = await createOpen();
            await expect(core.connect(client).setBudget(jobId, 1_000000, EMPTY))
                .to.emit(core, "BudgetSet")
                .withArgs(jobId, 1_000000);
            await expect(core.connect(provider).setBudget(jobId, 2_000000, EMPTY))
                .to.emit(core, "BudgetSet")
                .withArgs(jobId, 2_000000);
        });

        it("reverts for a stranger or after funding", async () => {
            const jobId = await createOpen();
            await expect(core.connect(stranger).setBudget(jobId, 1_000000, EMPTY)).to.be.revertedWithCustomError(
                core,
                "Unauthorized"
            );
            const funded = await fundJob(core, token, client, provider, evaluator);
            await expect(core.connect(client).setBudget(funded, 1_000000, EMPTY)).to.be.revertedWithCustomError(
                core,
                "WrongStatus"
            );
        });
    });

    describe("fund", () => {
        it("escrows the budget and emits JobFunded", async () => {
            const jobId = await openJob(core, token, client, provider.address, evaluator.address);
            await expect(core.connect(client).fund(jobId, 100_000000, EMPTY))
                .to.emit(core, "JobFunded")
                .withArgs(jobId, client.address, 100_000000);
            expect(await token.balanceOf(core.address)).to.equal(100_000000);
            expect((await core.getJob(jobId)).status).to.equal(1);
        });

        it("reverts on role, status, provider, budget, expiry, and fee-on-transfer", async () => {
            const jobId = await openJob(core, token, client, provider.address, evaluator.address);
            await expect(core.connect(stranger).fund(jobId, 100_000000, EMPTY)).to.be.revertedWithCustomError(
                core,
                "Unauthorized"
            );
            await expect(core.connect(client).fund(jobId, 99_000000, EMPTY)).to.be.revertedWithCustomError(
                core,
                "BudgetMismatch"
            );

            const noProvider = await createOpen(ethers.constants.AddressZero);
            await core.connect(client).setBudget(noProvider, 100_000000, EMPTY);
            await expect(core.connect(client).fund(noProvider, 100_000000, EMPTY)).to.be.revertedWithCustomError(
                core,
                "ProviderNotSet"
            );

            const zeroBudget = await createOpen();
            await expect(core.connect(client).fund(zeroBudget, 0, EMPTY)).to.be.revertedWithCustomError(
                core,
                "ZeroBudget"
            );

            const funded = await fundJob(core, token, client, provider, evaluator);
            await expect(core.connect(client).fund(funded, 100_000000, EMPTY)).to.be.revertedWithCustomError(
                core,
                "WrongStatus"
            );

            const expiredOpen = await openJob(core, token, client, provider.address, evaluator.address);
            const expiredAt = (await core.getJob(expiredOpen)).expiredAt.toNumber();
            await time.increaseTo(expiredAt);
            await expect(core.connect(client).fund(expiredOpen, 100_000000, EMPTY)).to.be.revertedWithCustomError(
                core,
                "WrongStatus"
            );

            const feeFactory = await ethers.getContractFactory("MockFeeOnTransferToken");
            const feeToken = (await feeFactory.deploy("Fee", "FEE", 6)) as MockFeeOnTransferToken;
            await feeToken.deployed();
            const feeCore = await deployCore(feeToken.address);
            const feeJob = await openJob(
                feeCore,
                feeToken as unknown as typeof token,
                client,
                provider.address,
                evaluator.address
            );
            await expect(feeCore.connect(client).fund(feeJob, 100_000000, EMPTY)).to.be.revertedWithCustomError(
                feeCore,
                "UnexpectedFundedAmount"
            );
        });
    });

    describe("submit / complete / reject", () => {
        it("runs the standard funded → submitted → completed path (I-3)", async () => {
            const jobId = await fundJob(core, token, client, provider, evaluator);
            const deliverable = ethers.utils.id("proof");
            await expect(core.connect(provider).submit(jobId, deliverable, EMPTY))
                .to.emit(core, "JobSubmitted")
                .withArgs(jobId, provider.address, deliverable);
            await expect(core.connect(evaluator).complete(jobId, ethers.constants.HashZero, EMPTY))
                .to.emit(core, "JobCompleted")
                .to.emit(core, "PaymentReleased")
                .withArgs(jobId, provider.address, 100_000000);
            expect(await token.balanceOf(provider.address)).to.equal(100_000000);
            expect((await core.getJob(jobId)).status).to.equal(3);
        });

        it("rejects by the client while Open and by the evaluator after fund", async () => {
            const openId = await createOpen();
            await expect(core.connect(client).reject(openId, ethers.utils.id("cancel"), EMPTY))
                .to.emit(core, "JobRejected")
                .withArgs(openId, client.address, ethers.utils.id("cancel"));

            const funded = await fundJob(core, token, client, provider, evaluator);
            await expect(core.connect(evaluator).reject(funded, ethers.constants.HashZero, EMPTY))
                .to.emit(core, "Refunded")
                .withArgs(funded, client.address, 100_000000);
            expect(await token.balanceOf(client.address)).to.equal(100_000000);
        });

        it("enforces roles (I-3)", async () => {
            const jobId = await fundJob(core, token, client, provider, evaluator);
            await expect(
                core.connect(client).submit(jobId, ethers.constants.HashZero, EMPTY)
            ).to.be.revertedWithCustomError(core, "Unauthorized");
            await core.connect(provider).submit(jobId, ethers.constants.HashZero, EMPTY);
            await expect(
                core.connect(client).complete(jobId, ethers.constants.HashZero, EMPTY)
            ).to.be.revertedWithCustomError(core, "Unauthorized");
            await expect(
                core.connect(provider).complete(jobId, ethers.constants.HashZero, EMPTY)
            ).to.be.revertedWithCustomError(core, "Unauthorized");
            await expect(
                core.connect(client).reject(jobId, ethers.constants.HashZero, EMPTY)
            ).to.be.revertedWithCustomError(core, "Unauthorized");
            await expect(
                core.connect(provider).reject(jobId, ethers.constants.HashZero, EMPTY)
            ).to.be.revertedWithCustomError(core, "Unauthorized");
        });
    });

    describe("claimRefund and I-7", () => {
        it("refunds at expiredAt and not at expiredAt − 1", async () => {
            const jobId = await fundJob(core, token, client, provider, evaluator);
            const expiredAt = (await core.getJob(jobId)).expiredAt.toNumber();
            await time.setNextBlockTimestamp(expiredAt - 1);
            await expect(core.connect(stranger).claimRefund(jobId)).to.be.revertedWithCustomError(core, "WrongStatus");
            await time.setNextBlockTimestamp(expiredAt);
            await expect(core.connect(stranger).claimRefund(jobId)).to.emit(core, "JobExpired").withArgs(jobId);
            expect(await token.balanceOf(client.address)).to.equal(100_000000);
            expect((await core.getJob(jobId)).status).to.equal(5);
        });

        it("does not let a terminal job move again (I-7)", async () => {
            const jobId = await fundJob(core, token, client, provider, evaluator);
            await core.connect(provider).submit(jobId, ethers.constants.HashZero, EMPTY);
            await core.connect(evaluator).complete(jobId, ethers.constants.HashZero, EMPTY);
            await expect(
                core.connect(evaluator).complete(jobId, ethers.constants.HashZero, EMPTY)
            ).to.be.revertedWithCustomError(core, "WrongStatus");
            await expect(
                core.connect(evaluator).reject(jobId, ethers.constants.HashZero, EMPTY)
            ).to.be.revertedWithCustomError(core, "WrongStatus");
            await expect(core.connect(stranger).claimRefund(jobId)).to.be.revertedWithCustomError(core, "WrongStatus");
            await expect(
                core.connect(provider).submit(jobId, ethers.constants.HashZero, EMPTY)
            ).to.be.revertedWithCustomError(core, "WrongStatus");
        });
    });

    it("rejects a constructor token that is not 6 or 18 decimals", async () => {
        const factory = await ethers.getContractFactory("OpusAgenticCommerce");
        await expect(
            factory.deploy(
                token.address,
                8,
                ethers.constants.AddressZero,
                0,
                ethers.constants.AddressZero,
                ethers.constants.AddressZero
            )
        ).to.be.revertedWithCustomError(factory, "InvalidTokenDecimals");
    });
});
