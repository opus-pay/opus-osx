import { expect } from "chai";
import { ethers, network } from "hardhat";
import { createPublicClient, custom, getAddress } from "viem";

import { Indexer } from "../../../indexer/src";
import { localHardhat } from "../../../sdk/src";
import { deployCore, deployUsdc, EMPTY, fundJob, testWallets } from "../helpers/acp";

describe("Indexer on a local Hardhat node (#26)", () => {
    const wallets = testWallets();
    const [deployer, , , , client, provider, evaluator] = wallets;

    it("loads the job page from the index after the chain moves", async () => {
        const token = await deployUsdc();
        const core = await deployCore(token.address);
        const jobId = await fundJob(core, token, client, provider, evaluator);
        await core.connect(provider).submit(jobId, ethers.constants.HashZero, EMPTY);

        const indexer = new Indexer(createPublicClient({ chain: localHardhat, transport: custom(network.provider) }), {
            factory: getAddress(deployer.address),
            instance: getAddress(core.address),
            evaluator: getAddress(evaluator.address),
        });
        const added = await indexer.sync();
        expect(added).to.be.greaterThan(0);
        const again = await indexer.sync();
        expect(again).to.equal(0);

        const page = await indexer.store.job(getAddress(core.address), BigInt(jobId));
        expect(page?.status).to.equal("Submitted");
        expect(page?.client).to.equal(getAddress(client.address));
        expect(page?.provider).to.equal(getAddress(provider.address));
        expect(page?.budget).to.equal(100_000000n);
        expect(page?.expiredAt).to.be.greaterThan(0n);
        expect(await indexer.store.activeJobs(getAddress(core.address), getAddress(evaluator.address))).to.have.length(
            1
        );
        expect((await indexer.store.jobsFor(getAddress(client.address))).items.map((job) => job.status)).to.deep.equal([
            "Submitted",
        ]);
        expect(page).to.not.have.property("logs");

        await core.connect(evaluator).complete(jobId, ethers.constants.HashZero, EMPTY);
        await indexer.sync();
        expect((await indexer.store.job(getAddress(core.address), BigInt(jobId)))?.status).to.equal("Completed");
        expect(await indexer.store.activeJobs(getAddress(core.address), getAddress(evaluator.address))).to.deep.equal(
            []
        );
    });
});
