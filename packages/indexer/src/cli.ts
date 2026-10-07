import type { Server } from "http";
import { readFileSync } from "fs";

import { redactUrls } from "./redact";

import { amoy, loadAddresses, localHardhat } from "@opus/sdk";
import { createPublicClient, http } from "viem";

import { Indexer } from "./indexer";
import { createIndexerServer, type IndexerStatus, type ServerOptions } from "./server";
import { MemoryLedger, type Ledger } from "./ledger";
import { postgresDb, SqlLedger, sqliteDb } from "./sql-ledger";
import type { IndexStore, InstanceView, JobView } from "./store";

function fromBlock(chainId: number): bigint {
    const raw = process.env.INDEXER_FROM_BLOCK?.trim();
    if (raw === undefined || raw === "") {
        if (chainId === 80002) throw new Error("INDEXER_FROM_BLOCK is required on Amoy");
        return 0n;
    }
    if (!/^\d+$/.test(raw)) throw new Error("INDEXER_FROM_BLOCK must be a block number");
    return BigInt(raw);
}

/** Starts the HTTP face of an index. Kept for callers that only need the server. */
export function startServer(
    store: IndexStore,
    host: string,
    port: number,
    options: ServerOptions = {}
): Promise<Server> {
    const server = createIndexerServer(store, options);
    return new Promise((resolve) => {
        server.listen(port, host, () => resolve(server));
    });
}

const whole = (name: string): number | undefined => {
    const raw = process.env[name]?.trim();
    if (raw === undefined || raw === "") return undefined;
    if (!/^\d+$/.test(raw)) throw new Error(`${name} must be a whole number`);
    return Number(raw);
};

/** PostgreSQL if `INDEXER_DATABASE_URL` is set, else a SQLite file if `INDEXER_DB_FILE` is set, else memory. */
export async function openLedger(env: NodeJS.ProcessEnv): Promise<Ledger> {
    const url = env.INDEXER_DATABASE_URL?.trim();
    if (url !== undefined && url !== "") return SqlLedger.open(await postgresDb(url));
    const file = env.INDEXER_DB_FILE?.trim();
    if (file !== undefined && file !== "") return SqlLedger.open(await sqliteDb(file));
    return new MemoryLedger();
}

async function main(): Promise<void> {
    const path = process.env.INDEXER_ADDRESSES?.trim();
    if (path === undefined || path === "") throw new Error("INDEXER_ADDRESSES is required");
    const addresses = loadAddresses(readFileSync(path, "utf8"));
    const chain = addresses.chainId === 80002 ? amoy : localHardhat;
    const rpc = process.env.INDEXER_RPC_URL?.trim() || chain.rpcUrls.default.http[0];
    // A block can be replaced shortly after it appears. On a public chain stay a few blocks behind the head.
    const confirmations = BigInt(whole("INDEXER_CONFIRMATIONS") ?? (addresses.chainId === 80002 ? 5 : 0));
    const key = `${addresses.chainId}:${addresses.factory}:${addresses.instance}:${addresses.evaluator}`;
    const ledger = await openLedger(process.env);
    // A database that belongs to other contracts would mix two ledgers. Refuse rather than wipe it.
    const owner = await ledger.getMeta("key");
    if (owner !== undefined && owner !== key) {
        throw new Error("The index database was made for other contracts or another chain; use an empty database");
    }
    await ledger.setMeta("key", key);
    const indexer = new Indexer(
        createPublicClient({ chain, transport: http(rpc) }),
        addresses,
        fromBlock(addresses.chainId),
        {
            confirmations,
            ledger,
            onReorg: (fork, from) => {
                status.reorgs = (status.reorgs ?? 0) + 1;
                console.warn(`chain reorganised: took back blocks ${fork + 1n}..${from - 1n} and read them again`);
            },
        }
    );
    await indexer.load();
    const resumed = await indexer.store.cursor();
    if (resumed !== undefined)
        console.log(`resuming from block ${resumed} with ${await indexer.store.jobCount()} jobs`);
    const host = process.env.INDEXER_HOST?.trim() || "127.0.0.1";
    const port = Number(process.env.INDEXER_PORT ?? "8788");
    const poll = whole("INDEXER_POLL_MS") ?? 15_000;
    const status: IndexerStatus = {
        startedAt: Date.now(),
        head: 0n,
        indexedTo: indexer.progress().indexedTo,
        failures: 0,
        jobs: await indexer.store.jobCount(),
        staleMs: Math.max(120_000, 4 * poll),
        caughtUpWithin: confirmations + 3n,
    };
    await startServer(indexer.store, host, port, {
        status: () => status,
        token: process.env.INDEXER_API_TOKEN?.trim(),
    });
    console.log(`indexer listening on ${host}:${port}`);
    let stopping = false;
    const stop = () => {
        // Finish the range in progress (it is saved as it completes), then leave.
        stopping = true;
    };
    process.on("SIGTERM", stop);
    process.on("SIGINT", stop);
    while (!stopping) {
        try {
            const added = await indexer.sync();
            status.syncs = (status.syncs ?? 0) + 1;
            if (added > 0) console.log(`indexed ${added}`);
            const progress = indexer.progress();
            status.head = progress.head;
            status.indexedTo = progress.indexedTo;
            status.lastOkAt = progress.lastOkAt;
            status.jobs = await indexer.store.jobCount();
            status.failures = 0;
            status.lastError = undefined;
        } catch (error) {
            // A failed request is retried later: ranges are applied whole, so nothing is counted twice.
            status.failures += 1;
            status.syncFailures = (status.syncFailures ?? 0) + 1;
            status.lastError = redactUrls(error instanceof Error ? error.message.split("\n")[0] : String(error));
            const progress = indexer.progress();
            status.head = progress.head;
            status.indexedTo = progress.indexedTo;
            console.error(`sync failed (${status.failures} in a row): ${status.lastError}`);
        }
        // Wait longer after failures (up to 5 minutes) so a struggling node is not hit every 15 seconds.
        const wait = Math.min(poll * 2 ** Math.min(status.failures, 5), Math.max(poll, 300_000));
        for (let waited = 0; waited < wait && !stopping; waited += 1_000) {
            await new Promise((resolve) => setTimeout(resolve, Math.min(1_000, wait - waited)));
        }
    }
    await ledger.close();
    console.log("indexer stopped");
    process.exit(0);
}

if (require.main === module) {
    main().catch((error: unknown) => {
        console.error(redactUrls(error instanceof Error ? error.message : String(error)));
        process.exit(1);
    });
}

export type { InstanceView, JobView };
