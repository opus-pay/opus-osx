import { time } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Wallet } from "ethers";
import { ethers } from "hardhat";

import { HardhatAccount } from "../../src/HardhatAccount";
import { MockPermitToken, OpusAgenticCommerce } from "../../typechain-types";

export const EMPTY = "0x";
export const DESC = "ipfs://job/1";

export function testWallets(): Wallet[] {
    return HardhatAccount.keys.map((key) => new Wallet(key, ethers.provider));
}

export async function deployUsdc(): Promise<MockPermitToken> {
    const [deployer] = testWallets();
    const factory = await ethers.getContractFactory("MockPermitToken");
    const token = (await factory.connect(deployer).deploy("USD Coin", "USDC", 6)) as MockPermitToken;
    await token.deployed();
    return token;
}

export async function deployCore(token: string, decimals = 6): Promise<OpusAgenticCommerce> {
    const [deployer] = testWallets();
    const factory = await ethers.getContractFactory("OpusAgenticCommerce");
    const core = (await factory
        .connect(deployer)
        .deploy(
            token,
            decimals,
            ethers.constants.AddressZero,
            0,
            ethers.constants.AddressZero,
            ethers.constants.AddressZero
        )) as OpusAgenticCommerce;
    await core.deployed();
    return core;
}

export async function defaultExpiry(): Promise<number> {
    return (await time.latest()) + 2 * 24 * 60 * 60;
}

export async function openJob(
    core: OpusAgenticCommerce,
    token: MockPermitToken,
    client: Wallet,
    provider: string,
    evaluator: string,
    budget: number | string = 100_000000
): Promise<number> {
    const expiredAt = await defaultExpiry();
    const tx = await core.connect(client).createJob(provider, evaluator, expiredAt, DESC, ethers.constants.AddressZero);
    const receipt = await tx.wait();
    const jobId = receipt.events?.find((e) => e.event === "JobCreated")?.args?.jobId;
    await core.connect(client).setBudget(jobId, budget, EMPTY);
    await token.mint(client.address, budget);
    await token.connect(client).approve(core.address, budget);
    return jobId.toNumber();
}

export async function fundJob(
    core: OpusAgenticCommerce,
    token: MockPermitToken,
    client: Wallet,
    provider: Wallet,
    evaluator: Wallet,
    budget = 100_000000
): Promise<number> {
    const jobId = await openJob(core, token, client, provider.address, evaluator.address, budget);
    await core.connect(client).fund(jobId, budget, EMPTY);
    return jobId;
}

export function asSigner(wallet: Wallet): SignerWithAddress {
    return wallet as unknown as SignerWithAddress;
}
