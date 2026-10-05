import { timingSafeEqual } from "crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "http";

import { getAddress, isAddress, type Address } from "viem";

import type { IndexStore } from "./store";

/** What the sync loop tells the health check. */
export type IndexerStatus = {
    startedAt: number;
    head: bigint;
    indexedTo: bigint;
    lastOkAt?: number;
    lastError?: string;
    failures: number;
    jobs: number;
    /** Longest silence since the last clean sync that still counts as healthy. */
    staleMs: number;
    /** Blocks behind the head that still count as caught up (the confirmation depth plus a little). */
    caughtUpWithin: bigint;
};

export type ServerOptions = {
    /** Health from the sync loop. Without it `/health` only says the process is up. */
    status?: () => IndexerStatus;
    /** If set, every path but `/health` needs `Authorization: Bearer <token>`. */
    token?: string;
    now?: () => number;
};

export const MAX_PAGE = 1000;

/** Reads `?limit=` (default and most 1000) and `?offset=`. */
export function pageOf(params: URLSearchParams): { limit: number; offset: number } {
    const wanted = Number(params.get("limit") ?? MAX_PAGE);
    const limit = Number.isInteger(wanted) && wanted >= 1 ? Math.min(wanted, MAX_PAGE) : MAX_PAGE;
    const skipped = Number(params.get("offset") ?? 0);
    return { limit, offset: Number.isInteger(skipped) && skipped >= 0 ? skipped : 0 };
}

function json(value: unknown): string {
    return JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item));
}

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
    res.writeHead(status, { "content-type": "application/json", ...headers });
    res.end(json(body));
}

function allowed(expected: string, header: string | undefined): boolean {
    const given = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
    const left = Buffer.from(expected);
    const right = Buffer.from(given);
    return left.length > 0 && left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Health for a monitor: 200 while the loop has had a clean sync recently and is not failing over and over,
 * with `synced` saying whether the ledger has caught up to the chain (it has not during the first read, when
 * `/jobs` may be incomplete). 503 with reasons otherwise.
 */
export function healthOf(status: IndexerStatus, now: number) {
    const reasons: string[] = [];
    if (now - (status.lastOkAt ?? status.startedAt) > status.staleMs) reasons.push("no clean sync for too long");
    if (status.failures >= 5) reasons.push(`${status.failures} syncs failed in a row`);
    const lag = status.head > status.indexedTo ? status.head - status.indexedTo : 0n;
    return {
        ok: reasons.length === 0,
        reasons,
        synced: status.lastOkAt !== undefined && lag <= status.caughtUpWithin,
        head: status.head,
        indexedTo: status.indexedTo,
        lag,
        jobs: status.jobs,
        lastOkAgeSeconds: status.lastOkAt === undefined ? undefined : Math.round((now - status.lastOkAt) / 1000),
        lastError: status.lastError,
    };
}

export function createIndexerServer(store: IndexStore, options: ServerOptions = {}): Server {
    const now = options.now ?? Date.now;
    return createServer((req, res) => {
        handle(store, options, now, req, res).catch((error: unknown) => {
            console.error(error instanceof Error ? error.message : error);
            if (!res.headersSent) send(res, 500, { error: "index unavailable" });
        });
    });
}

async function handle(
    store: IndexStore,
    options: ServerOptions,
    now: () => number,
    req: IncomingMessage,
    res: ServerResponse
): Promise<void> {
    if (req.method !== "GET" || req.url === undefined) {
        send(res, 404, { error: "not found" });
        return;
    }
    const url = new URL(req.url, "http://indexer");
    if (url.pathname === "/health") {
        if (options.status === undefined) {
            send(res, 200, { ok: true });
            return;
        }
        const view = healthOf(options.status(), now());
        send(res, view.ok ? 200 : 503, view);
        return;
    }
    if (options.token !== undefined && options.token !== "" && !allowed(options.token, req.headers.authorization)) {
        send(res, 401, { error: "unauthorized" });
        return;
    }
    if (url.pathname === "/instances") {
        const { items, total } = await store.instances(pageOf(url.searchParams));
        send(res, 200, items, { "x-total-count": String(total) });
        return;
    }
    if (url.pathname === "/jobs") {
        const account = url.searchParams.get("account");
        if (account === null || !isAddress(account)) {
            send(res, 400, { error: "account is required" });
            return;
        }
        const { items, total } = await store.jobsFor(getAddress(account), pageOf(url.searchParams));
        send(res, 200, items, { "x-total-count": String(total) });
        return;
    }
    if (url.pathname === "/active") {
        const instance = url.searchParams.get("instance");
        const evaluator = url.searchParams.get("evaluator");
        if (instance === null || evaluator === null || !isAddress(instance) || !isAddress(evaluator)) {
            send(res, 400, { error: "instance and evaluator are required" });
            return;
        }
        send(res, 200, await store.activeJobs(getAddress(instance), getAddress(evaluator)));
        return;
    }
    const jobPath = /^\/jobs\/(0x[0-9a-fA-F]{40})\/(\d+)$/.exec(url.pathname);
    if (jobPath !== null) {
        const job = await store.job(getAddress(jobPath[1] as Address), BigInt(jobPath[2]));
        if (job === undefined) {
            send(res, 404, { error: "job not in the index" });
            return;
        }
        send(res, 200, job);
        return;
    }
    send(res, 404, { error: "not found" });
}
