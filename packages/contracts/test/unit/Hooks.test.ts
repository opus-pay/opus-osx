import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

import { HookAlwaysRevert, HookArmAfterFund, HookGasBurn, HookReenter, ReenterSetBudget } from "../../typechain-types";
import { defaultExpiry, deployCore, deployUsdc, DESC, EMPTY, testWallets } from "../helpers/acp";

describe("Hooks (#9)", () => {
    const wallets = testWallets();
    const [, , , , client, provider, evaluator, stranger] = wallets;

    it("reverts hookable actions when the hook reverts or burns gas", async () => {
        const token = await deployUsdc();
        const core = await deployCore(token.address);
        const expiredAt = await defaultExpiry();

        const revertHook = (await (await ethers.getContractFactory("HookAlwaysRevert")).deploy()) as HookAlwaysRevert;
        await revertHook.deployed();
        await core.connect(client).createJob(provider.address, evaluator.address, expiredAt, DESC, revertHook.address);
        await expect(core.connect(client).setBudget(1, 1, EMPTY)).to.be.revertedWithCustomError(core, "HookFailed");

        const burn = (await (await ethers.getContractFactory("HookGasBurn")).deploy()) as HookGasBurn;
        await burn.deployed();
        await core.connect(client).createJob(provider.address, evaluator.address, expiredAt, DESC, burn.address);
        await expect(core.connect(client).setBudget(2, 1, EMPTY)).to.be.revertedWithCustomError(core, "HookFailed");
    });

    it("stops a hook that re-enters the core", async () => {
        const token = await deployUsdc();
        const core = await deployCore(token.address);
        const hook = (await (await ethers.getContractFactory("HookReenter")).deploy()) as HookReenter;
        await hook.deployed();
        const attacker = (await (
            await ethers.getContractFactory("ReenterSetBudget")
        ).deploy(core.address)) as ReenterSetBudget;
        await attacker.deployed();
        await hook.setTarget(attacker.address);

        const expiredAt = await defaultExpiry();
        await core.connect(client).createJob(provider.address, evaluator.address, expiredAt, DESC, hook.address);
        await expect(core.connect(client).setBudget(1, 1, EMPTY)).to.be.revertedWithCustomError(core, "HookFailed");
    });

    it("lets claimRefund finish after expiry when later hooks revert (I-4)", async () => {
        const hook = (await (await ethers.getContractFactory("HookArmAfterFund")).deploy()) as HookArmAfterFund;
        await hook.deployed();
        const token = await deployUsdc();
        const core = await deployCore(token.address);
        const expiredAt = await defaultExpiry();
        await core.connect(client).createJob(provider.address, evaluator.address, expiredAt, DESC, hook.address);
        await core.connect(client).setBudget(1, 100_000000, EMPTY);
        await token.mint(client.address, 100_000000);
        await token.connect(client).approve(core.address, 100_000000);
        await core.connect(client).fund(1, 100_000000, EMPTY);
        expect(await hook.armed()).to.equal(true);
        await expect(core.connect(provider).submit(1, ethers.constants.HashZero, EMPTY)).to.be.revertedWithCustomError(
            core,
            "HookFailed"
        );

        await time.setNextBlockTimestamp((await core.getJob(1)).expiredAt.toNumber());
        await expect(core.connect(stranger).claimRefund(1)).to.emit(core, "JobExpired");
        expect(await token.balanceOf(client.address)).to.equal(100_000000);
    });
});
