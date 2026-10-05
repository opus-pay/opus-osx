import { expect } from "chai";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import type { AddressInfo } from "net";
import { encodeAbiParameters, encodeEventTopics, getAddress, type Address, type Log } from "viem";

import { indexAbi, IndexStore, Indexer, loadState, saveState, page, healthOf, type IndexerStatus } from "../src";
import { createIndexerServer } from "../src/server";

const factory = getAddress("0x0000000000000000000000000000000000000021");
const evaluator = getAddress("0x0000000000000000000000000000000000000022");
const first = getAddress("0x0000000000000000000000000000000000000023");
const second = getAddress("0x0000000000000000000000000000000000000024");
const token = getAddress("0x0000000000000000000000000000000000000025");
const client = getAddress("0x0000000000000000000000000000000000000026");
const provider = getAddress("0x0000000000000000000000000000000000000027");

function logOf(
    address: Address,
    eventName: string,
    args: Record<string, unknown>,
    blockNumber: bigint,
    logIndex = 0
): Log {
    const event = indexAbi.find((item) => item.type === "event" && item.name === eventName);
    if (event === undefined || event.type !== "event") throw new Error(eventName);
    const topics = encodeEventTopics({ abi: [event], eventName: eventName as "JobCreated", args: args as never });
    const rest = event.inputs.filter((input) => !("indexed" in input && input.indexed));
    const data =
        rest.length === 0
            ? "0x"
            : encodeAbiParameters(
                  rest,
                  rest.map((input) => args[input.name ?? ""] as never)
              );
    return { address, topics, data, blockNumber, logIndex } as never;
}

const created = (instance: Address, jobId: bigint, block: bigint): Log =>
    logOf(instance, "JobCreated", { jobId, client, provider, evaluator, expiredAt: 9_000n, hook: evaluator }, block);
const deposit = (instance: Address, jobId: bigint, amount: bigint, block: bigint): Log =>
    logOf(evaluator, "DepositPosted", { instance, jobId, party: client, amount }, block);

/** A chain that holds logs by block, and can be told to fail a request. */
function chain(logs: Log[], head: bigint) {
    const state = { failNext: 0, requests: [] as { addresses: Address[]; from: bigint; to: bigint }[] };
    const fake = {
        getBlockNumber: async () => head,
        getLogs: async (args: { address: Address[]; fromBlock: bigint; toBlock: bigint }) => {
            state.requests.push({ addresses: args.address, from: args.fromBlock, to: args.toBlock });
            if (state.failNext > 0) {
                state.failNext -= 1;
                throw new Error("rpc hiccup");
            }
            const wanted = new Set(args.address.map((a) => getAddress(a)));
            return logs.filter(
                (log) =>
                    wanted.has(getAddress(log.address)) &&
                    log.blockNumber! >= args.fromBlock &&
                    log.blockNumber! <= args.toBlock
            );
        },
    };
    return { fake, state };
}

describe("indexer hardening", () => {
    it("retries a failed request without counting an event twice", async () => {
        const logs = [created(first, 1n, 3n), deposit(first, 1n, 5n, 4n), deposit(first, 1n, 7n, 5n)];
        const { fake, state } = chain(logs, 10n);
        const indexer = new Indexer(fake as never, { factory, instance: first, evaluator }, 0n);
        state.failNext = 1;
        let failed = false;
        await indexer.sync().catch(() => (failed = true));
        expect(failed).to.equal(true);
        await indexer.sync();
        expect(indexer.store.job(first, 1n)?.deposit).to.equal(12n);
        await indexer.sync();
        expect(indexer.store.job(first, 1n)?.deposit).to.equal(12n);
    });

    it("follows an instance the factory announces and reads its events from the same range", async () => {
        const announce = logOf(
            factory,
            "InstanceCreated",
            { instance: second, token, treasury: client, feeBP: 0n },
            6n
        );
        const logs = [announce, created(second, 1n, 7n)];
        const { fake } = chain(logs, 20n);
        const indexer = new Indexer(fake as never, { factory, instance: first, evaluator }, 0n, { step: 100n });
        await indexer.sync();
        expect(indexer.store.instances().map((i) => i.instance)).to.deep.equal([second]);
        expect(indexer.store.job(second, 1n)?.client).to.equal(client);
    });

    it("stays behind the head by the confirmation depth", async () => {
        const { fake, state } = chain([], 100n);
        const indexer = new Indexer(fake as never, { factory, instance: first, evaluator }, 0n, { confirmations: 5n });
        await indexer.sync();
        expect(Math.max(...state.requests.map((r) => Number(r.to)))).to.equal(95);
        expect(indexer.progress()).to.include({ head: 100n, indexedTo: 95n, lag: 5n });
    });

    it("keeps the ledger and the cursor across a restart, and ignores a state for other contracts", async () => {
        const dir = mkdtempSync(path.join(tmpdir(), "indexer-"));
        try {
            const file = path.join(dir, "state.json");
            const logs = [created(first, 1n, 3n), deposit(first, 1n, 5n, 4n)];
            const { fake, state } = chain(logs, 10n);
            const one = new Indexer(fake as never, { factory, instance: first, evaluator }, 0n);
            await one.sync();
            saveState(file, one.snapshot("k1"));

            const saved = loadState(file, "k1");
            expect(saved?.cursor).to.equal(11n);
            const two = new Indexer(fake as never, { factory, instance: first, evaluator }, 0n);
            two.restore(saved!);
            state.requests.length = 0;
            await two.sync();
            expect(state.requests).to.have.length(0);
            expect(two.store.job(first, 1n)?.deposit).to.equal(5n);
            expect(two.store.job(first, 1n)?.expiredAt).to.equal(9_000n);

            expect(loadState(file, "other")).to.equal(undefined);
            writeFileSync(file, "{not json");
            expect(loadState(file, "k1")).to.equal(undefined);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});

describe("indexer http", () => {
    const status = (over: Partial<IndexerStatus> = {}): IndexerStatus => ({
        startedAt: 0,
        head: 100n,
        indexedTo: 100n,
        lastOkAt: 1_000,
        failures: 0,
        jobs: 2,
        staleMs: 60_000,
        caughtUpWithin: 8n,
        ...over,
    });

    it("pages a list and reports the full count", () => {
        const all = Array.from({ length: 25 }, (_, i) => i);
        expect(page(all, new URLSearchParams("limit=10&offset=20")).items).to.deep.equal([20, 21, 22, 23, 24]);
        expect(page(all, new URLSearchParams("limit=0")).items).to.have.length(25);
        expect(page(all, new URLSearchParams("limit=5000")).items).to.have.length(25);
        expect(page(all, new URLSearchParams("")).total).to.equal(25);
    });

    it("says whether the ledger has caught up, and when the loop is stale or failing", () => {
        expect(healthOf(status(), 2_000)).to.include({ ok: true, synced: true });
        expect(healthOf(status({ head: 200n, indexedTo: 50n }), 2_000)).to.include({ ok: true, synced: false });
        expect(healthOf(status(), 200_000).reasons[0]).to.contain("too long");
        expect(healthOf(status({ failures: 5 }), 2_000).reasons[0]).to.contain("in a row");
        expect(healthOf(status({ lastOkAt: undefined }), 2_000).synced).to.equal(false);
    });

    it("serves health without a token, and everything else only with it", async () => {
        const store = new IndexStore();
        const server = createIndexerServer(store, { status: () => status({ lastOkAt: Date.now() }), token: "s3cret" });
        await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
        const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        try {
            const health = await fetch(`${base}/health`);
            expect(health.status).to.equal(200);
            expect(await health.json()).to.include({ ok: true, synced: true });
            expect((await fetch(`${base}/instances`)).status).to.equal(401);
            expect((await fetch(`${base}/instances`, { headers: { authorization: "Bearer nope" } })).status).to.equal(
                401
            );
            const open = await fetch(`${base}/instances`, { headers: { authorization: "Bearer s3cret" } });
            expect(open.status).to.equal(200);
            expect(open.headers.get("x-total-count")).to.equal("0");
        } finally {
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
    });
});
