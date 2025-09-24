import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { Wallet } from "ethers";
import { ethers } from "hardhat";

import { HardhatAccount } from "../../src/HardhatAccount";
import {
    HookAlwaysRevert,
    HookGasBurn,
    HookReenter,
    MockBlacklistToken,
    MockFeeOnTransferToken,
    MockHookReenterTarget,
    MockPermitToken,
    MockReentrantToken,
    MockTokenReenterTarget,
} from "../../typechain-types";

describe("Test mocks (#4)", () => {
    const wallets = HardhatAccount.keys.map((key) => new Wallet(key, ethers.provider));
    const [deployer, other] = wallets;

    it("accepts an EIP-2612 permit", async () => {
        const factory = await ethers.getContractFactory("MockPermitToken");
        const token = (await factory.connect(deployer).deploy("USD Coin", "USDC", 6)) as MockPermitToken;
        await token.deployed();
        await token.mint(deployer.address, 1_000_000);

        const deadline = (await time.latest()) + 3600;
        const nonce = await token.nonces(deployer.address);
        const value = 1000;
        const domain = {
            name: "USD Coin",
            version: "1",
            chainId: 31337,
            verifyingContract: token.address,
        };
        const types = {
            Permit: [
                { name: "owner", type: "address" },
                { name: "spender", type: "address" },
                { name: "value", type: "uint256" },
                { name: "nonce", type: "uint256" },
                { name: "deadline", type: "uint256" },
            ],
        };
        const signature = await deployer._signTypedData(domain, types, {
            owner: deployer.address,
            spender: other.address,
            value,
            nonce,
            deadline,
        });
        const { v, r, s } = ethers.utils.splitSignature(signature);
        await token.permit(deployer.address, other.address, value, deadline, v, r, s);
        expect(await token.allowance(deployer.address, other.address)).to.equal(value);
    });

    it("takes a fee on transfer", async () => {
        const factory = await ethers.getContractFactory("MockFeeOnTransferToken");
        const token = (await factory.connect(deployer).deploy("Fee", "FEE", 6)) as MockFeeOnTransferToken;
        await token.deployed();
        await token.mint(deployer.address, 10_000);
        await token.transfer(other.address, 10_000);
        expect(await token.balanceOf(other.address)).to.equal(9900);
        expect(await token.balanceOf(deployer.address)).to.equal(0);
    });

    it("rejects a transfer to a blacklisted address", async () => {
        const factory = await ethers.getContractFactory("MockBlacklistToken");
        const token = (await factory.connect(deployer).deploy("Frozen", "FRZ", 6)) as MockBlacklistToken;
        await token.deployed();
        await token.mint(deployer.address, 100);
        await token.setBlacklisted(other.address, true);
        await expect(token.transfer(other.address, 10))
            .to.be.revertedWithCustomError(token, "Blacklisted")
            .withArgs(other.address);
    });

    it("re-enters after a transfer", async () => {
        const tokenFactory = await ethers.getContractFactory("MockReentrantToken");
        const token = (await tokenFactory.connect(deployer).deploy("Re", "RE", 18)) as MockReentrantToken;
        await token.deployed();
        const targetFactory = await ethers.getContractFactory("MockTokenReenterTarget");
        const target = (await targetFactory.connect(deployer).deploy()) as MockTokenReenterTarget;
        await target.deployed();
        await token.setAttacker(target.address);
        await token.mint(deployer.address, 50);
        await token.transfer(other.address, 10);
        expect(await target.calls()).to.equal(1);
    });

    it("always-revert hook reverts both callbacks", async () => {
        const factory = await ethers.getContractFactory("HookAlwaysRevert");
        const hook = (await factory.connect(deployer).deploy()) as HookAlwaysRevert;
        await hook.deployed();
        await expect(hook.beforeAction(1, "0x12345678", "0x")).to.be.revertedWithCustomError(hook, "HookReverted");
        await expect(hook.afterAction(1, "0x12345678", "0x")).to.be.revertedWithCustomError(hook, "HookReverted");
    });

    it("gas-burn hook exhausts a capped call", async () => {
        const factory = await ethers.getContractFactory("HookGasBurn");
        const hook = (await factory.connect(deployer).deploy()) as HookGasBurn;
        await hook.deployed();
        await expect(hook.beforeAction(1, "0x12345678", "0x", { gasLimit: 300_000 })).to.be.reverted;
    });

    it("re-enter hook calls the target", async () => {
        const hookFactory = await ethers.getContractFactory("HookReenter");
        const hook = (await hookFactory.connect(deployer).deploy()) as HookReenter;
        await hook.deployed();
        const targetFactory = await ethers.getContractFactory("MockHookReenterTarget");
        const target = (await targetFactory.connect(deployer).deploy()) as MockHookReenterTarget;
        await target.deployed();
        await hook.setTarget(target.address);
        const selector = ethers.utils.id("fund(uint256,uint256,bytes)").slice(0, 10);
        await hook.beforeAction(7, selector, "0x");
        expect(await target.calls()).to.equal(1);
        expect(await target.lastSelector()).to.equal(selector);
    });
});
