import { expect } from "chai";
import { ethers } from "hardhat";

import { deployCore, deployUsdc, EMPTY, testWallets } from "../helpers/acp";
import { deployEvaluator, submitConfiguredJob } from "../helpers/evaluator";
import { KlerosArbiterAdapter, MockKlerosArbitrator, MockOpusArbiter } from "../../typechain-types";

describe("OptimisticEvaluator arbiter adapters (#54)", () => {
    const wallets = testWallets();
    const [, , , , client, provider, , , operator, arbiter] = wallets;

    async function submitted(arbiterAddr: string) {
        const token = await deployUsdc();
        const core = await deployCore(token.address);
        const evaluator = await deployEvaluator();
        const jobId = await submitConfiguredJob(
            core,
            evaluator,
            token,
            client,
            provider,
            operator.address,
            100_000000,
            { arbiter: arbiterAddr }
        );
        await evaluator.connect(client).object(core.address, jobId, ethers.utils.id("e"));
        return { token, core, evaluator, jobId };
    }

    it("accepts an EOA arbiter without any adapter contract", async () => {
        const { core, evaluator, jobId } = await submitted(arbiter.address);
        await expect(evaluator.connect(arbiter).rule(core.address, jobId, true, ethers.utils.id("eoa"))).to.emit(
            core,
            "JobCompleted"
        );
    });

    it("accepts a mock contract arbiter that calls rule", async () => {
        const mock = (await (await ethers.getContractFactory("MockOpusArbiter")).deploy()) as MockOpusArbiter;
        await mock.deployed();
        const { core, evaluator, jobId } = await submitted(mock.address);
        await expect(mock.decide(evaluator.address, core.address, jobId, false, ethers.utils.id("mock"))).to.emit(
            core,
            "JobRejected"
        );
    });

    it("accepts a Kleros-style adapter driven by an external arbitrator", async () => {
        const kleros = (await (
            await ethers.getContractFactory("MockKlerosArbitrator")
        ).deploy()) as MockKlerosArbitrator;
        await kleros.deployed();
        const adapter = (await (
            await ethers.getContractFactory("KlerosArbiterAdapter")
        ).deploy(kleros.address)) as KlerosArbiterAdapter;
        await adapter.deployed();
        const { core, evaluator, jobId } = await submitted(adapter.address);
        await adapter.bind(evaluator.address, core.address, jobId, 7);
        await expect(kleros.deliver(adapter.address, 7, 1)).to.emit(core, "JobCompleted");
    });
});
