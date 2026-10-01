import { expect } from "chai";
import {
    encodeAbiParameters,
    encodeEventTopics,
    getAddress,
    zeroAddress,
    zeroHash,
    type Address,
    type Hex,
} from "viem";

import { indexAbi, IndexStore } from "../src";

const instance = getAddress("0x0000000000000000000000000000000000000011");
const client = getAddress("0x0000000000000000000000000000000000000012");
const provider = getAddress("0x0000000000000000000000000000000000000013");
const evaluator = getAddress("0x0000000000000000000000000000000000000014");
const token = getAddress("0x0000000000000000000000000000000000000015");

function feed(store: IndexStore, address: Address, eventName: string, args: Record<string, unknown>) {
    const event = indexAbi.find((item) => item.type === "event" && item.name === eventName);
    if (event === undefined || event.type !== "event") throw new Error(eventName);
    const topics = encodeEventTopics({
        abi: [event],
        eventName: eventName as "JobCreated",
        args: args as never,
    });
    const rest = event.inputs.filter((input) => !("indexed" in input && input.indexed));
    const data =
        rest.length === 0
            ? "0x"
            : encodeAbiParameters(
                  rest,
                  rest.map((input) => args[input.name ?? ""] as never)
              );
    return store.apply({ address, topics, data } as never);
}

describe("@opus/indexer", () => {
    it("builds a job page from events and keeps the keeper's active set", () => {
        const store = new IndexStore();
        feed(store, instance, "JobCreated", {
            jobId: 1n,
            client,
            provider,
            evaluator,
            expiredAt: 9_000n,
            hook: evaluator,
        });
        feed(store, instance, "BudgetSet", { jobId: 1n, amount: 100n });
        feed(store, instance, "JobFunded", { jobId: 1n, client, amount: 100n });
        feed(store, evaluator, "Configured", { instance, jobId: 1n, client });
        feed(store, evaluator, "Escalated", { instance, jobId: 1n });
        feed(store, evaluator, "DepositPosted", { instance, jobId: 1n, party: client, amount: 5n });
        feed(store, evaluator, "CaseOpened", {
            instance,
            jobId: 1n,
            arbiter: evaluator,
            disputeDeadline: 50n,
            evidenceHashes: [zeroHash],
        });
        feed(store, evaluator, "TipPaid", { instance, jobId: 1n, to: provider, amount: 2n });
        feed(store, evaluator, "FeePaid", { instance, jobId: 1n, operator: client, amount: 3n });
        feed(store, evaluator, "Ruled", {
            instance,
            jobId: 1n,
            arbiter: evaluator,
            completed: true,
            reasonHash: zeroHash,
        });
        feed(store, evaluator, "Swept", { instance, jobId: 1n, to: client, amount: 1n });

        const page = store.job(instance, 1n);
        expect(page?.status).to.equal("Completed");
        expect(page?.phase).to.equal("Resolved");
        expect(page?.budget).to.equal(100n);
        expect(page?.configured).to.equal(true);
        expect(page?.deposit).to.equal(5n);
        expect(page?.tipPaid).to.equal(2n);
        expect(page?.feePaid).to.equal(3n);
        expect(page?.swept).to.equal(true);
        expect(page?.disputeDeadline).to.equal(50n);
        expect(store.jobsFor(client).map((job) => job.jobId)).to.deep.equal([1n]);
        expect(store.activeJobs(instance, evaluator)).to.deep.equal([]);
        expect("logs" in (page as object)).to.equal(false);
    });

    it("lists a funded job for the keeper until it leaves that state", () => {
        const store = new IndexStore();
        feed(store, instance, "JobCreated", {
            jobId: 4n,
            client,
            provider,
            evaluator,
            expiredAt: 1n,
            hook: zeroAddress,
        });
        feed(store, instance, "JobFunded", { jobId: 4n, client, amount: 10n });
        expect(store.activeJobs(instance, evaluator).map((job) => job.jobId)).to.deep.equal([4n]);
        feed(store, instance, "JobSubmitted", { jobId: 4n, provider, deliverable: zeroHash as Hex });
        expect(store.job(instance, 4n)?.status).to.equal("Submitted");
        feed(store, instance, "JobExpired", { jobId: 4n });
        expect(store.activeJobs(instance, evaluator)).to.deep.equal([]);
    });

    it("records factory instances", () => {
        const store = new IndexStore();
        const factory = getAddress("0x0000000000000000000000000000000000000016");
        feed(store, factory, "InstanceCreated", { instance, token, treasury: client, feeBP: 0n });
        expect(store.instances()).to.deep.equal([{ instance, token, treasury: client, feeBP: 0n }]);
    });

    it("starts the log scan at the given block", async () => {
        const { Indexer } = await import("../src/indexer");
        const seen: bigint[] = [];
        const client = {
            getBlockNumber: async () => 10n,
            getLogs: async (args: { fromBlock: bigint }) => {
                seen.push(args.fromBlock);
                return [];
            },
        };
        const indexer = new Indexer(client as never, { factory: instance, instance, evaluator }, 5n);
        await indexer.sync();
        expect(seen[0]).to.equal(5n);
    });

    it("serves the job page from the store", async () => {
        const { startServer } = await import("../src/cli");
        const store = new IndexStore();
        feed(store, instance, "JobCreated", {
            jobId: 1n,
            client,
            provider,
            evaluator,
            expiredAt: 9_000n,
            hook: zeroAddress,
        });
        feed(store, instance, "JobSubmitted", { jobId: 1n, provider, deliverable: zeroHash });
        const server = await startServer(store, "127.0.0.1", 0);
        const bound = server.address();
        if (bound === null || typeof bound === "string") throw new Error("no port");
        try {
            const page = (await (await fetch(`http://127.0.0.1:${bound.port}/jobs/${instance}/1`)).json()) as {
                status: string;
            };
            expect(page.status).to.equal("Submitted");
            expect(page).to.not.have.property("logs");
            const active = (await (
                await fetch(`http://127.0.0.1:${bound.port}/active?instance=${instance}&evaluator=${evaluator}`)
            ).json()) as { jobId: string }[];
            expect(active.map((job) => job.jobId)).to.deep.equal(["1"]);
        } finally {
            await new Promise((resolve) => server.close(resolve));
        }
    });
});
