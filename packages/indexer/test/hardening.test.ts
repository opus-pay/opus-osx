import { PGlite } from "@electric-sql/pglite";
import { expect } from "chai";
import type { AddressInfo } from "net";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { encodeAbiParameters, encodeEventTopics, getAddress, type Address, type Log } from "viem";

import {
    createIndexerServer,
    healthOf,
    indexAbi,
    Indexer,
    IndexStore,
    MemoryLedger,
    pageOf,
    SchemaVersionError,
    SqlLedger,
    sqliteDb,
    type Db,
    type IndexerOptions,
    type IndexerStatus,
    type Ledger,
} from "../src";

const factory = getAddress("0x0000000000000000000000000000000000000021");
const evaluator = getAddress("0x0000000000000000000000000000000000000022");
const first = getAddress("0x0000000000000000000000000000000000000023");
const second = getAddress("0x0000000000000000000000000000000000000024");
const token = getAddress("0x0000000000000000000000000000000000000025");
const client = getAddress("0x0000000000000000000000000000000000000026");
const provider = getAddress("0x0000000000000000000000000000000000000027");
const other = getAddress("0x0000000000000000000000000000000000000028");

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

const created = (instance: Address, jobId: bigint, block: bigint, who = client): Log =>
    logOf(
        instance,
        "JobCreated",
        { jobId, client: who, provider, evaluator, expiredAt: 9_000n, hook: evaluator },
        block
    );
const funded = (instance: Address, jobId: bigint, block: bigint): Log =>
    logOf(instance, "JobFunded", { jobId, client, amount: 10n }, block);
const deposit = (instance: Address, jobId: bigint, amount: bigint, block: bigint): Log =>
    logOf(evaluator, "DepositPosted", { instance, jobId, party: client, amount }, block);

/** A chain that holds logs by block and can be reorganised, or told to fail a request. */
class FakeChain {
    failNext = 0;
    requests: { addresses: Address[]; from: bigint; to: bigint }[] = [];
    /** Blocks at or above this number have a different hash, as after a reorganisation. */
    forkFrom: bigint | undefined;

    logs: Log[];
    head: bigint;

    constructor(logs: Log[], head: bigint) {
        this.logs = logs;
        this.head = head;
    }

    hash(block: bigint): string {
        return `0x${block.toString(16).padStart(8, "0")}${
            this.forkFrom !== undefined && block >= this.forkFrom ? "ff" : "00"
        }`;
    }

    client() {
        return {
            getBlockNumber: async () => this.head,
            getBlock: async (args: { blockNumber: bigint }) => ({ hash: this.hash(args.blockNumber) }),
            getLogs: async (args: { address: Address[]; fromBlock: bigint; toBlock: bigint }) => {
                this.requests.push({ addresses: args.address, from: args.fromBlock, to: args.toBlock });
                if (this.failNext > 0) {
                    this.failNext -= 1;
                    throw new Error("rpc hiccup");
                }
                const wanted = new Set(args.address.map((a) => getAddress(a)));
                return this.logs.filter(
                    (log) =>
                        wanted.has(getAddress(log.address)) &&
                        log.blockNumber! >= args.fromBlock &&
                        log.blockNumber! <= args.toBlock
                );
            },
        } as never;
    }
}

function pgliteDb(pg: PGlite): Db {
    const wrap =
        (target: { query: PGlite["query"] }): Db["query"] =>
        async (sql, params) => {
            const result = await target.query(sql, params as never[]);
            return { rows: result.rows as Record<string, unknown>[] };
        };
    const db: Db = {
        query: wrap(pg),
        transaction: (fn) =>
            pg.transaction(async (tx) =>
                fn({ query: wrap(tx), transaction: (nested) => nested(db), end: async () => undefined })
            ),
        end: () => pg.close(),
    };
    return db;
}

let shared: Db | undefined;

/** The shared PGlite with empty tables. */
async function freshPg(): Promise<Db> {
    shared ??= pgliteDb(new PGlite());
    for (const table of ["meta", "instances", "jobs", "undo", "hashes"]) {
        await shared.query(`DROP TABLE IF EXISTS ${table}`);
    }
    return shared;
}

type Backend = {
    name: string;
    make: () => Promise<{ ledger: Ledger; reopen: () => Promise<Ledger>; done: () => Promise<void> }>;
};

const backends: Backend[] = [
    {
        name: "memory",
        make: async () => {
            const ledger = new MemoryLedger();
            return { ledger, reopen: async () => ledger, done: async () => undefined };
        },
    },
    {
        name: "sqlite",
        make: async () => {
            const dir = mkdtempSync(path.join(tmpdir(), "indexer-"));
            const file = path.join(dir, "ledger.db");
            const ledger = await SqlLedger.open(await sqliteDb(file));
            return {
                ledger,
                reopen: async () => SqlLedger.open(await sqliteDb(file)),
                done: async () => rmSync(dir, { recursive: true, force: true }),
            };
        },
    },
    {
        name: "postgres (PGlite)",
        make: async () => {
            // Starting a PGlite takes a few seconds, so one is shared and its tables are emptied between tests.
            const db = await freshPg();
            const ledger = await SqlLedger.open(db);
            // PGlite is one in-process database: "reopening" is a second ledger over the same tables.
            return { ledger, reopen: async () => SqlLedger.open(db), done: async () => undefined };
        },
    },
];

for (const backend of backends) {
    describe(`indexer on ${backend.name}`, () => {
        let env: Awaited<ReturnType<Backend["make"]>>;
        beforeEach(async () => {
            env = await backend.make();
        });
        afterEach(async () => {
            await env.done();
        });

        const indexerOn = (chain: FakeChain, ledger: Ledger, over: IndexerOptions = {}) =>
            new Indexer(chain.client(), { factory, instance: first, evaluator }, 0n, { ledger, ...over });

        it("retries a failed request without counting an event twice", async () => {
            const chain = new FakeChain(
                [created(first, 1n, 3n), deposit(first, 1n, 5n, 4n), deposit(first, 1n, 7n, 5n)],
                10n
            );
            const indexer = indexerOn(chain, env.ledger);
            chain.failNext = 1;
            let failed = false;
            await indexer.sync().catch(() => (failed = true));
            expect(failed).to.equal(true);
            await indexer.sync();
            expect((await indexer.store.job(first, 1n))?.deposit).to.equal(12n);
            await indexer.sync();
            expect((await indexer.store.job(first, 1n))?.deposit).to.equal(12n);
        });

        it("follows an instance the factory announces and reads its events from the same range", async () => {
            const announce = logOf(
                factory,
                "InstanceCreated",
                { instance: second, token, treasury: client, feeBP: 0n },
                6n
            );
            const chain = new FakeChain([announce, created(second, 1n, 7n)], 20n);
            const indexer = indexerOn(chain, env.ledger, { step: 100n });
            await indexer.sync();
            expect((await indexer.store.instances()).items.map((i) => i.instance)).to.deep.equal([second]);
            expect((await indexer.store.job(second, 1n))?.client).to.equal(client);
        });

        it("stays behind the head by the confirmation depth", async () => {
            const chain = new FakeChain([], 100n);
            const indexer = indexerOn(chain, env.ledger, { confirmations: 5n });
            await indexer.sync();
            expect(Math.max(...chain.requests.map((r) => Number(r.to)))).to.equal(95);
            expect(indexer.progress()).to.include({ head: 100n, indexedTo: 95n, lag: 5n });
        });

        it("resumes where it stopped when the ledger is opened again", async () => {
            const chain = new FakeChain([created(first, 1n, 3n), deposit(first, 1n, 5n, 4n)], 10n);
            await indexerOn(chain, env.ledger).sync();
            const again = indexerOn(chain, await env.reopen());
            await again.load();
            expect(again.progress().indexedTo).to.equal(10n);
            chain.requests.length = 0;
            await again.sync();
            expect(chain.requests).to.have.length(0);
            const job = await again.store.job(first, 1n);
            expect(job?.deposit).to.equal(5n);
            expect(job?.expiredAt).to.equal(9_000n);
        });

        it("takes back what a replaced block added and reads the new chain", async () => {
            const chain = new FakeChain(
                [
                    created(first, 1n, 3n),
                    deposit(first, 1n, 5n, 10n),
                    logOf(factory, "InstanceCreated", { instance: second, token, treasury: client, feeBP: 0n }, 11n),
                ],
                20n
            );
            let reorg: [bigint, bigint] | undefined;
            const indexer = indexerOn(chain, env.ledger, { step: 5n, onReorg: (fork, from) => (reorg = [fork, from]) });
            await indexer.sync();
            expect((await indexer.store.job(first, 1n))?.deposit).to.equal(5n);
            expect((await indexer.store.instances()).total).to.equal(1);

            // Blocks from 10 on are replaced: the deposit moves to 11 with another amount, and the instance is gone.
            chain.forkFrom = 10n;
            chain.logs = [created(first, 1n, 3n), deposit(first, 1n, 9n, 11n)];
            await indexer.sync();
            expect(reorg?.[0]).to.equal(9n);
            expect((await indexer.store.job(first, 1n))?.deposit).to.equal(9n);
            expect((await indexer.store.instances()).total).to.equal(0);
            expect(indexer.progress().indexedTo).to.equal(20n);
            // Nothing is counted twice afterwards.
            await indexer.sync();
            expect((await indexer.store.job(first, 1n))?.deposit).to.equal(9n);
        });

        it("removes a job that only existed in a replaced block", async () => {
            const chain = new FakeChain([created(first, 1n, 3n), created(first, 2n, 12n)], 20n);
            const indexer = indexerOn(chain, env.ledger, { step: 5n });
            await indexer.sync();
            expect(await indexer.store.jobCount()).to.equal(2);
            chain.forkFrom = 11n;
            chain.logs = [created(first, 1n, 3n)];
            await indexer.sync();
            expect(await indexer.store.jobCount()).to.equal(1);
            expect(await indexer.store.job(first, 2n)).to.equal(undefined);
        });

        it("says so when the chain changed deeper than it remembers", async () => {
            const chain = new FakeChain([created(first, 1n, 3n)], 20n);
            const indexer = indexerOn(chain, env.ledger, { step: 5n });
            await indexer.sync();
            chain.forkFrom = 0n;
            let message = "";
            await indexer.sync().catch((error: Error) => (message = error.message));
            expect(message).to.contain("deeper");
        });

        it("keeps jobs apart by wallet, in order, with a page and a total", async () => {
            const logs: Log[] = [];
            for (let id = 1n; id <= 12n; id++) logs.push(created(first, id, 2n, id % 2n === 0n ? client : other));
            logs.push(created(second, 1n, 3n, client));
            const chain = new FakeChain(logs, 10n);
            const indexer = new Indexer(chain.client(), { factory, instance: first, evaluator }, 0n, {
                ledger: env.ledger,
            });
            await indexer.store.apply(
                logOf(factory, "InstanceCreated", { instance: second, token, treasury: client, feeBP: 0n }, 1n)
            );
            await indexer.sync();
            const all = await indexer.store.jobsFor(client);
            expect(all.total).to.equal(7);
            expect(all.items.map((job) => `${job.instance === first ? "a" : "b"}${job.jobId}`)).to.deep.equal(
                ["a2", "a4", "a6", "a8", "a10", "a12", "b1"].map((x) => x)
            );
            const part = await indexer.store.jobsFor(client, { limit: 3, offset: 4 });
            expect(part.total).to.equal(7);
            expect(part.items.map((job) => job.jobId)).to.deep.equal([10n, 12n, 1n]);
        });

        it("lists active jobs of one instance and evaluator", async () => {
            const chain = new FakeChain([created(first, 1n, 2n), funded(first, 1n, 3n), created(first, 2n, 2n)], 10n);
            const indexer = indexerOn(chain, env.ledger);
            await indexer.sync();
            expect((await indexer.store.activeJobs(first, evaluator)).map((job) => job.jobId)).to.deep.equal([1n]);
            expect(await indexer.store.activeJobs(second, evaluator)).to.deep.equal([]);
        });
    });
}

describe("sql ledger", () => {
    it("refuses a database made by a newer version", async () => {
        const db = await freshPg();
        await SqlLedger.open(db);
        await db.query("UPDATE meta SET value = '99' WHERE key = 'schema'");
        let failure: unknown;
        await SqlLedger.open(db).catch((error) => (failure = error));
        expect(failure).to.be.instanceOf(SchemaVersionError);
    });

    it("writes nothing when a transaction fails halfway", async () => {
        const ledger = await SqlLedger.open(await freshPg());
        const job = {
            instance: first,
            jobId: 1n,
            client,
            provider,
            evaluator,
            hook: evaluator,
            expiredAt: 1n,
            budget: 0n,
            status: "Open" as const,
            phase: "None" as const,
            configured: false,
            deliverable: undefined,
            disputeDeadline: undefined,
            deposit: 0n,
            tipPaid: 0n,
            feePaid: 0n,
            swept: false,
        };
        let failed = false;
        await ledger
            .transaction(async (inner) => {
                await inner.putJob(job);
                await inner.setMeta("cursor", "99");
                throw new Error("the second write failed");
            })
            .catch(() => (failed = true));
        expect(failed).to.equal(true);
        expect(await ledger.jobCount()).to.equal(0);
        expect(await ledger.getMeta("cursor")).to.equal(undefined);
        // And a transaction that succeeds lands as one.
        await ledger.transaction(async (inner) => {
            await inner.putJob(job);
            await inner.setMeta("cursor", "5");
        });
        expect(await ledger.jobCount()).to.equal(1);
        expect(await ledger.getMeta("cursor")).to.equal("5");
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

    it("reads a page request and ignores nonsense", () => {
        expect(pageOf(new URLSearchParams("limit=10&offset=20"))).to.deep.equal({ limit: 10, offset: 20 });
        expect(pageOf(new URLSearchParams("limit=0&offset=-4"))).to.deep.equal({ limit: 1000, offset: 0 });
        expect(pageOf(new URLSearchParams("limit=5000"))).to.deep.equal({ limit: 1000, offset: 0 });
        expect(pageOf(new URLSearchParams("limit=x"))).to.deep.equal({ limit: 1000, offset: 0 });
    });

    it("says whether the ledger has caught up, and when the loop is stale or failing", () => {
        expect(healthOf(status(), 2_000)).to.include({ ok: true, synced: true });
        expect(healthOf(status({ head: 200n, indexedTo: 50n }), 2_000)).to.include({ ok: true, synced: false });
        expect(healthOf(status(), 200_000).reasons[0]).to.contain("too long");
        expect(healthOf(status({ failures: 5 }), 2_000).reasons[0]).to.contain("in a row");
        expect(healthOf(status({ lastOkAt: undefined }), 2_000).synced).to.equal(false);
    });

    it("serves pages from a SQL ledger, with a token", async () => {
        const ledger = await SqlLedger.open(await freshPg());
        const store = new IndexStore(ledger);
        for (let id = 1n; id <= 5n; id++) await store.apply(created(first, id, 1n));
        const server = createIndexerServer(store, { status: () => status({ lastOkAt: Date.now() }), token: "s3cret" });
        await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
        const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        const auth = { headers: { authorization: "Bearer s3cret" } };
        try {
            const health = await fetch(`${base}/health`);
            expect(health.status).to.equal(200);
            expect(await health.json()).to.include({ ok: true, synced: true });
            expect((await fetch(`${base}/jobs?account=${client}`)).status).to.equal(401);
            const part = await fetch(`${base}/jobs?account=${client}&limit=2&offset=1`, auth);
            expect(part.headers.get("x-total-count")).to.equal("5");
            expect(((await part.json()) as { jobId: string }[]).map((job) => job.jobId)).to.deep.equal(["2", "3"]);
            expect((await fetch(`${base}/jobs/${first}/4`, auth)).status).to.equal(200);
            expect((await fetch(`${base}/jobs/${first}/99`, auth)).status).to.equal(404);
        } finally {
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
    });
});
