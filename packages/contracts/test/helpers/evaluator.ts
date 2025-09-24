import { time } from "@nomicfoundation/hardhat-network-helpers";
import { Wallet } from "ethers";
import { ethers } from "hardhat";

import { MockPermitToken, OptimisticEvaluator, OpusAgenticCommerce } from "../../typechain-types";
import { defaultExpiry, deployCore, DESC, EMPTY } from "./acp";

export async function deployEvaluator(): Promise<OptimisticEvaluator> {
    const factory = await ethers.getContractFactory("OptimisticEvaluator");
    const evaluator = (await factory.deploy()) as OptimisticEvaluator;
    await evaluator.deployed();
    return evaluator;
}

export function defaultConfig(operator: string, overrides: Record<string, unknown> = {}) {
    return {
        submitWindow: 3600,
        reviewWindow: 3600,
        maxExtension: 0,
        depositWindow: 3600,
        disputeWindow: 3600,
        autoCompleteOnSilence: true,
        defaultComplete: true,
        budgetLock: 0,
        arbiter: ethers.constants.AddressZero,
        operator,
        evaluationFee: 0,
        keeperTip: 0,
        disputeDeposit: 0,
        ...overrides,
    };
}

export async function openConfiguredJob(
    core: OpusAgenticCommerce,
    evaluator: OptimisticEvaluator,
    token: MockPermitToken,
    client: Wallet,
    provider: string,
    operator: string,
    budget: number | string = 100_000000,
    configOverrides: Record<string, unknown> = {}
): Promise<number> {
    const expiredAt = await defaultExpiry();
    const tx = await core.connect(client).createJob(provider, evaluator.address, expiredAt, DESC, evaluator.address);
    const receipt = await tx.wait();
    const jobId = receipt.events?.find((e) => e.event === "JobCreated")?.args?.jobId.toNumber() as number;
    await core.connect(client).setBudget(jobId, budget, EMPTY);
    await evaluator.connect(client).configure(core.address, jobId, defaultConfig(operator, configOverrides));
    await token.mint(client.address, budget);
    await token.connect(client).approve(core.address, budget);
    return jobId;
}

export async function longExpiry(): Promise<number> {
    return (await time.latest()) + 30 * 24 * 60 * 60;
}

export async function deployCoreAndEvaluator(): Promise<{
    token: MockPermitToken;
    core: OpusAgenticCommerce;
    evaluator: OptimisticEvaluator;
}> {
    const { deployUsdc } = await import("./acp");
    const token = await deployUsdc();
    const core = await deployCore(token.address);
    const evaluator = await deployEvaluator();
    return { token, core, evaluator };
}
