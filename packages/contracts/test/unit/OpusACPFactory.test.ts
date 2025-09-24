import { expect } from "chai";
import { ethers } from "hardhat";

import { OpusACPFactory, OpusAgenticCommerce } from "../../typechain-types";
import { deployUsdc, EMPTY, fundJob, testWallets } from "../helpers/acp";

describe("OpusACPFactory (#11)", () => {
    const wallets = testWallets();
    const [, treasury, , , client, provider, evaluator] = wallets;

    it("creates one instance per token, treasury, and fee and has no protocol-fee parameter", async () => {
        const usdc = await deployUsdc();
        const factory = (await (
            await ethers.getContractFactory("OpusACPFactory")
        ).deploy([usdc.address], ethers.constants.AddressZero)) as OpusACPFactory;
        await factory.deployed();

        await expect(factory.createInstance(usdc.address, treasury.address, 100)).to.emit(factory, "InstanceCreated");

        const instanceAddr = await factory.instanceOf(usdc.address, treasury.address, 100);
        const instance = (await ethers.getContractAt("OpusAgenticCommerce", instanceAddr)) as OpusAgenticCommerce;
        expect(await instance.factory()).to.equal(factory.address);
        expect(await instance.platformTreasury()).to.equal(treasury.address);
        expect(await instance.EVALUATOR_FEE_BP()).to.equal(0);

        await expect(factory.createInstance(usdc.address, treasury.address, 100)).to.be.revertedWithCustomError(
            factory,
            "InstanceExists"
        );

        const zeroFee = await factory.callStatic.createInstance(usdc.address, ethers.constants.AddressZero, 0);
        await factory.createInstance(usdc.address, ethers.constants.AddressZero, 0);
        expect(zeroFee).to.not.equal(instanceAddr);
    });

    it("rejects an empty list, duplicates, unlisted tokens, and a bad fee pair", async () => {
        const usdc = await deployUsdc();
        const factoryFactory = await ethers.getContractFactory("OpusACPFactory");
        await expect(factoryFactory.deploy([], ethers.constants.AddressZero)).to.be.revertedWithCustomError(
            factoryFactory,
            "EmptyStablecoinList"
        );
        await expect(
            factoryFactory.deploy([usdc.address, usdc.address], ethers.constants.AddressZero)
        ).to.be.revertedWithCustomError(factoryFactory, "DuplicateStablecoin");

        const factory = (await factoryFactory.deploy([usdc.address], ethers.constants.AddressZero)) as OpusACPFactory;
        await factory.deployed();
        await expect(
            factory.createInstance(client.address, ethers.constants.AddressZero, 0)
        ).to.be.revertedWithCustomError(factory, "TokenNotListed");
        const coreFactory = await ethers.getContractFactory("OpusAgenticCommerce");
        await expect(
            factory.createInstance(usdc.address, ethers.constants.AddressZero, 10)
        ).to.be.revertedWithCustomError(coreFactory, "InvalidFeeConfig");
    });

    it("lets anyone use a created instance for the standard flow", async () => {
        const usdc = await deployUsdc();
        const factory = (await (
            await ethers.getContractFactory("OpusACPFactory")
        ).deploy([usdc.address], ethers.constants.AddressZero)) as OpusACPFactory;
        await factory.deployed();
        await factory.connect(client).createInstance(usdc.address, ethers.constants.AddressZero, 0);
        const instance = (await ethers.getContractAt(
            "OpusAgenticCommerce",
            await factory.instanceOf(usdc.address, ethers.constants.AddressZero, 0)
        )) as OpusAgenticCommerce;
        const jobId = await fundJob(instance, usdc, client, provider, evaluator);
        await instance.connect(provider).submit(jobId, ethers.constants.HashZero, EMPTY);
        await instance.connect(evaluator).complete(jobId, ethers.constants.HashZero, EMPTY);
        expect(await usdc.balanceOf(provider.address)).to.equal(100_000000);
    });
});
