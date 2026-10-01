import { createServer, type IncomingMessage, type Server, type ServerResponse } from "http";
import { readFileSync } from "fs";

import { amoy, loadAddresses, localHardhat } from "@opus/sdk";
import { getAddress, isAddress, type Address } from "viem";
import { createPublicClient, http } from "viem";

import { Indexer } from "./indexer";
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

function json(value: unknown): string {
    return JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item));
}

function send(res: ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(json(body));
}

export function startServer(store: IndexStore, host: string, port: number): Promise<Server> {
    const server = createServer((req, res) => handle(store, req, res));
    return new Promise((resolve) => {
        server.listen(port, host, () => resolve(server));
    });
}

function handle(store: IndexStore, req: IncomingMessage, res: ServerResponse): void {
    if (req.method !== "GET" || req.url === undefined) {
        send(res, 404, { error: "not found" });
        return;
    }
    const url = new URL(req.url, "http://indexer");
    if (url.pathname === "/health") {
        send(res, 200, { ok: true });
        return;
    }
    if (url.pathname === "/instances") {
        send(res, 200, store.instances());
        return;
    }
    if (url.pathname === "/jobs") {
        const account = url.searchParams.get("account");
        if (account === null || !isAddress(account)) {
            send(res, 400, { error: "account is required" });
            return;
        }
        send(res, 200, store.jobsFor(getAddress(account)));
        return;
    }
    if (url.pathname === "/active") {
        const instance = url.searchParams.get("instance");
        const evaluator = url.searchParams.get("evaluator");
        if (instance === null || evaluator === null || !isAddress(instance) || !isAddress(evaluator)) {
            send(res, 400, { error: "instance and evaluator are required" });
            return;
        }
        send(res, 200, store.activeJobs(getAddress(instance), getAddress(evaluator)));
        return;
    }
    const jobPath = /^\/jobs\/(0x[0-9a-fA-F]{40})\/(\d+)$/.exec(url.pathname);
    if (jobPath !== null) {
        const job = store.job(getAddress(jobPath[1] as Address), BigInt(jobPath[2]));
        if (job === undefined) {
            send(res, 404, { error: "job not in the index" });
            return;
        }
        send(res, 200, job);
        return;
    }
    send(res, 404, { error: "not found" });
}

async function main(): Promise<void> {
    const path = process.env.INDEXER_ADDRESSES?.trim();
    if (path === undefined || path === "") throw new Error("INDEXER_ADDRESSES is required");
    const addresses = loadAddresses(readFileSync(path, "utf8"));
    const chain = addresses.chainId === 80002 ? amoy : localHardhat;
    const rpc = process.env.INDEXER_RPC_URL?.trim() || chain.rpcUrls.default.http[0];
    const indexer = new Indexer(
        createPublicClient({ chain, transport: http(rpc) }),
        addresses,
        fromBlock(addresses.chainId)
    );
    const host = process.env.INDEXER_HOST?.trim() || "127.0.0.1";
    const port = Number(process.env.INDEXER_PORT ?? "8788");
    const poll = Number(process.env.INDEXER_POLL_MS ?? "15000");
    await startServer(indexer.store, host, port);
    console.log(`indexer listening on ${host}:${port}`);
    for (;;) {
        const added = await indexer.sync();
        if (added > 0) console.log(`indexed ${added}`);
        await new Promise((resolve) => setTimeout(resolve, poll));
    }
}

if (require.main === module) {
    main().catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : error);
        process.exit(1);
    });
}

export type { InstanceView, JobView };
