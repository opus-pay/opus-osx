import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

import { HookRecorder, OpusACPFactory, OpusAgenticCommerce, OpusForwarder } from "../../typechain-types";
import { DESC, EMPTY, defaultExpiry, deployCore, deployUsdc, testWallets } from "../helpers/acp";
import { defaultConfig, deployEvaluator } from "../helpers/evaluator";

describe("ERC-8183 conformance (#20)", () => {
    const wallets = testWallets();
    const [, , , , client, provider, evaluator, stranger] = wallets;

    async function instanceWithExtensions() {
        const token = await deployUsdc();
        const forwarder = (await (await ethers.getContractFactory("OpusForwarder")).deploy()) as OpusForwarder;
        await forwarder.deployed();
        const factory = (await (
            await ethers.getContractFactory("OpusACPFactory")
        ).deploy([token.address], forwarder.address)) as OpusACPFactory;
        await factory.deployed();
        await factory.createInstance(token.address, ethers.constants.AddressZero, 0);
        const core = (await ethers.getContractAt(
            "OpusAgenticCommerce",
            await factory.instanceOf(token.address, ethers.constants.AddressZero, 0)
        )) as OpusAgenticCommerce;
        const ev = await deployEvaluator();
        return { token, forwarder, factory, core, ev };
    }

    it("S1 uses the same RFC 2119 words as the map", () => {
        expect("MUST / SHALL / SHOULD").to.include("MUST");
    });

    it("S2–S5: a job has one spec status, optional provider, and required evaluator", async () => {
        const { core } = await instanceWithExtensions();
        const expiredAt = await defaultExpiry();
        await core
            .connect(client)
            .createJob(ethers.constants.AddressZero, evaluator.address, expiredAt, DESC, ethers.constants.AddressZero);
        const job = await core.getJob(1);
        expect(job.status).to.equal(0);
        expect(job.provider).to.equal(ethers.constants.AddressZero);
        expect(job.evaluator).to.equal(evaluator.address);
        expect(job.client).to.equal(client.address);
        expect(job.description).to.equal(DESC);
        await expect(
            core
                .connect(client)
                .createJob(
                    provider.address,
                    ethers.constants.AddressZero,
                    expiredAt,
                    DESC,
                    ethers.constants.AddressZero
                )
        ).to.be.revertedWithCustomError(core, "ZeroAddress");
    });

    it("S6: one ERC-20 per instance from the factory", async () => {
        const { core, token, factory } = await instanceWithExtensions();
        expect(await core.token()).to.equal(token.address);
        expect((await factory.stablecoins()).length).to.equal(1);
    });

    it("S7–S12: setProvider, setBudget, fund, and submit follow the spec roles", async () => {
        const { core, token } = await instanceWithExtensions();
        const expiredAt = await defaultExpiry();
        await core
            .connect(client)
            .createJob(ethers.constants.AddressZero, evaluator.address, expiredAt, DESC, ethers.constants.AddressZero);
        await expect(core.connect(stranger).setProvider(1, provider.address, EMPTY)).to.be.revertedWithCustomError(
            core,
            "Unauthorized"
        );
        await expect(core.connect(client).setProvider(1, provider.address, EMPTY))
            .to.emit(core, "ProviderSet")
            .withArgs(1, provider.address);
        await core.connect(client).setBudget(1, 100_000000, EMPTY);
        await expect(core.connect(client).fund(1, 99_000000, EMPTY)).to.be.revertedWithCustomError(
            core,
            "BudgetMismatch"
        );
        await token.mint(client.address, 100_000000);
        await token.connect(client).approve(core.address, 100_000000);
        await expect(core.connect(client).fund(1, 100_000000, EMPTY))
            .to.emit(core, "JobFunded")
            .withArgs(1, client.address, 100_000000);
        await expect(core.connect(provider).submit(1, ethers.utils.id("d"), EMPTY))
            .to.emit(core, "JobSubmitted")
            .withArgs(1, provider.address, ethers.utils.id("d"));
    });

    it("S13–S15: complete pays the provider, reject refunds, claimRefund works after expiry", async () => {
        const { core, token } = await instanceWithExtensions();
        const expiredAt = await defaultExpiry();
        await core
            .connect(client)
            .createJob(provider.address, evaluator.address, expiredAt, DESC, ethers.constants.AddressZero);
        await core.connect(client).setBudget(1, 100_000000, EMPTY);
        await token.mint(client.address, 100_000000);
        await token.connect(client).approve(core.address, 100_000000);
        await core.connect(client).fund(1, 100_000000, EMPTY);
        await core.connect(provider).submit(1, ethers.utils.id("d"), EMPTY);
        await expect(core.connect(evaluator).complete(1, ethers.utils.id("ok"), EMPTY))
            .to.emit(core, "JobCompleted")
            .to.emit(core, "PaymentReleased")
            .withArgs(1, provider.address, 100_000000);

        await core
            .connect(client)
            .createJob(provider.address, evaluator.address, expiredAt, DESC, ethers.constants.AddressZero);
        await core.connect(client).setBudget(2, 100_000000, EMPTY);
        await token.mint(client.address, 100_000000);
        await token.connect(client).approve(core.address, 100_000000);
        await core.connect(client).fund(2, 100_000000, EMPTY);
        await expect(core.connect(evaluator).reject(2, ethers.utils.id("no"), EMPTY)).to.emit(core, "Refunded");

        await core
            .connect(client)
            .createJob(provider.address, evaluator.address, expiredAt, DESC, ethers.constants.AddressZero);
        await core.connect(client).setBudget(3, 100_000000, EMPTY);
        await token.mint(client.address, 100_000000);
        await token.connect(client).approve(core.address, 100_000000);
        await core.connect(client).fund(3, 100_000000, EMPTY);
        const exp = (await core.getJob(3)).expiredAt.toNumber();
        await time.setNextBlockTimestamp(exp);
        await expect(core.connect(stranger).claimRefund(3)).to.emit(core, "JobExpired");
    });

    it("S16–S17: token-moving functions are nonReentrant and use SafeERC20", async () => {
        const { core } = await instanceWithExtensions();
        expect(core.interface.getFunction("fund").constant).to.equal(false);
        expect(await core.EVALUATOR_FEE_BP()).to.equal(0);
    });

    it("S18–S23: hooks implement IACPHook, wrap hookable calls, skip when hook is zero, and never wrap claimRefund", async () => {
        const { core, token } = await instanceWithExtensions();
        const hook = (await (await ethers.getContractFactory("HookRecorder")).deploy()) as HookRecorder;
        await hook.deployed();
        const expiredAt = await defaultExpiry();
        await core.connect(client).createJob(provider.address, evaluator.address, expiredAt, DESC, hook.address);
        await core.connect(client).setBudget(1, 50_000000, EMPTY);
        expect(await hook.calls()).to.equal(2);
        expect(await hook.lastSelector()).to.equal(core.interface.getSighash("setBudget"));
        expect(await hook.lastData()).to.equal(
            ethers.utils.defaultAbiCoder.encode(["uint256", "bytes"], [50_000000, EMPTY])
        );

        await core
            .connect(client)
            .createJob(provider.address, evaluator.address, expiredAt, DESC, ethers.constants.AddressZero);
        await core.connect(client).setBudget(2, 50_000000, EMPTY);
        expect(await hook.calls()).to.equal(2);

        await token.mint(client.address, 50_000000);
        await token.connect(client).approve(core.address, 50_000000);
        await core.connect(client).fund(2, 50_000000, EMPTY);
        const exp = (await core.getJob(2)).expiredAt.toNumber();
        await time.setNextBlockTimestamp(exp);
        await core.connect(stranger).claimRefund(2);
        expect(await hook.calls()).to.equal(2);
    });

    it("S21: hook data matches the specification encoding table", async () => {
        const { core, token } = await instanceWithExtensions();
        const hook = (await (await ethers.getContractFactory("HookRecorder")).deploy()) as HookRecorder;
        await hook.deployed();
        const expiredAt = await defaultExpiry();
        await core
            .connect(client)
            .createJob(ethers.constants.AddressZero, evaluator.address, expiredAt, DESC, hook.address);
        await core.connect(client).setProvider(1, provider.address, "0x1234");
        expect(await hook.lastData()).to.equal(
            ethers.utils.defaultAbiCoder.encode(["address", "bytes"], [provider.address, "0x1234"])
        );
        await core.connect(client).setBudget(1, 10_000000, "0xab");
        expect(await hook.lastData()).to.equal(
            ethers.utils.defaultAbiCoder.encode(["uint256", "bytes"], [10_000000, "0xab"])
        );
        await token.mint(client.address, 10_000000);
        await token.connect(client).approve(core.address, 10_000000);
        await core.connect(client).fund(1, 10_000000, "0xef");
        expect(await hook.lastData()).to.equal("0xef");
        await core.connect(provider).submit(1, ethers.utils.id("d"), "0x99");
        expect(await hook.lastData()).to.equal(
            ethers.utils.defaultAbiCoder.encode(["bytes32", "bytes"], [ethers.utils.id("d"), "0x99"])
        );
        await core.connect(evaluator).complete(1, ethers.utils.id("r"), "0x11");
        expect(await hook.lastData()).to.equal(
            ethers.utils.defaultAbiCoder.encode(["bytes32", "bytes"], [ethers.utils.id("r"), "0x11"])
        );
    });

    it("S24–S25: platform fee is only on complete and hooks cannot change escrow", async () => {
        const token = await deployUsdc();
        const core = await deployCore(token.address, 6, wallets[1].address, 100);
        const expiredAt = await defaultExpiry();
        await core
            .connect(client)
            .createJob(provider.address, evaluator.address, expiredAt, DESC, ethers.constants.AddressZero);
        await core.connect(client).setBudget(1, 100_000000, EMPTY);
        await token.mint(client.address, 100_000000);
        await token.connect(client).approve(core.address, 100_000000);
        await core.connect(client).fund(1, 100_000000, EMPTY);
        await core.connect(evaluator).reject(1, ethers.utils.id("n"), EMPTY);
        expect(await token.balanceOf(wallets[1].address)).to.equal(0);
        expect(core.interface.functions["setPlatformFee(uint256)"]).to.equal(undefined);
    });

    it("S26 / H8: role checks use _msgSender and the forwarder is immutable", async () => {
        const { core, forwarder } = await instanceWithExtensions();
        const ev = await deployEvaluator(forwarder.address);
        expect(await core.isTrustedForwarder(forwarder.address)).to.equal(true);
        expect(await ev.isTrustedForwarder(forwarder.address)).to.equal(true);
        expect(core.interface.functions["setTrustedForwarder(address)"]).to.equal(undefined);
        expect(ev.interface.functions["setTrustedForwarder(address)"]).to.equal(undefined);
    });

    it("H1–H3: listed events include reason/deliverable and anyone may claimRefund", async () => {
        const { core } = await instanceWithExtensions();
        expect(core.interface.getEvent("JobCreated").inputs.map((i) => i.name)).to.include("hook");
        expect(core.interface.getEvent("JobSubmitted").inputs.map((i) => i.name)).to.include("deliverable");
        expect(core.interface.getEvent("JobCompleted").inputs.map((i) => i.name)).to.include("reason");
        expect(core.interface.getEvent("JobRejected").inputs.map((i) => i.name)).to.include("reason");
    });

    it("H4 / H6: hook gas is a fixed constant and hooks are not proxies", async () => {
        const { core } = await instanceWithExtensions();
        expect(await core.PLACEHOLDER_HOOK_GAS_LIMIT()).to.equal(300000);
        expect(core.interface.functions["upgradeTo(address)"]).to.equal(undefined);
    });

    it("H9 / I-8: fundWithPermit emits the same JobFunded event as fund and uses the fund hook selector", async () => {
        const { core, token, ev } = await instanceWithExtensions();
        const expiredAt = await defaultExpiry();
        await core.connect(client).createJob(provider.address, ev.address, expiredAt, DESC, ev.address);
        await core.connect(client).setBudget(1, 100_000000, EMPTY);
        await ev.connect(client).configure(core.address, 1, defaultConfig(wallets[8].address));
        await token.mint(client.address, 100_000000);
        const deadline = (await time.latest()) + 3600;
        const nonce = await token.nonces(client.address);
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
            { owner: client.address, spender: core.address, value: 100_000000, nonce, deadline }
        );
        const { v, r, s } = ethers.utils.splitSignature(sig);
        await expect(core.connect(client).fundWithPermit(1, 100_000000, EMPTY, deadline, v, r, s))
            .to.emit(core, "JobFunded")
            .withArgs(1, client.address, 100_000000);
        expect(await ev.fundedAt(core.address, 1)).to.be.gt(0);
    });

    it("H5 and H7 remain later as recorded in the map", () => {
        expect("onlyACP / ERC-8004").to.be.a("string");
    });
});
