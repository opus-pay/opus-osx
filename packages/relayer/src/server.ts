import { createServer, type IncomingMessage, type Server, type ServerResponse } from "http";

import type { ForwardRequest } from "@opus/sdk";
import { getAddress, isAddress, type Address, type Hex } from "viem";

import { RelayPending, RelayRejected, RelayUnavailable, type RelayLog, type Relayer } from "./relayer";

/** Bodies larger than this are refused before they are read in full. A forward request is well under 2 KB. */
export const MAX_BODY_BYTES = 64_000;

class TooLarge extends Error {}

function readBody(req: IncomingMessage, limit: number): Promise<string> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        let size = 0;
        let refused = false;
        req.on("data", (chunk: Buffer) => {
            if (refused) return;
            size += chunk.length;
            if (size > limit) {
                // Keep nothing more; the answer closes the connection, which ends the upload.
                refused = true;
                chunks.length = 0;
                reject(new TooLarge());
                return;
            }
            chunks.push(chunk);
        });
        req.on("end", () => {
            if (!refused) resolve(Buffer.concat(chunks).toString("utf8"));
        });
        req.on("error", reject);
    });
}

const whole = (value: unknown, what: string): bigint => {
    if (typeof value !== "string" && typeof value !== "number")
        throw new RelayRejected(`The forward request has a bad ${what}`);
    const text = String(value).trim();
    if (!/^\d{1,40}$/.test(text)) throw new RelayRejected(`The forward request has a bad ${what}`);
    return BigInt(text);
};

/** Turns the JSON of a request into a `ForwardRequest`, or says what is wrong with it (400, never 500). */
export function parseForwardRequest(value: unknown): ForwardRequest {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new RelayRejected("The forward request is missing");
    }
    const item = value as Record<string, unknown>;
    const { from, to, data, signature } = item;
    if (typeof from !== "string" || !isAddress(from) || typeof to !== "string" || !isAddress(to)) {
        throw new RelayRejected("The forward request has a bad address");
    }
    if (typeof data !== "string" || !/^0x([0-9a-fA-F]{2})*$/.test(data)) {
        throw new RelayRejected("The forward request has bad data");
    }
    if (typeof signature !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(signature)) {
        throw new RelayRejected("The forward request has a bad signature");
    }
    const deadline = whole(item.deadline, "deadline");
    if (deadline > BigInt(Number.MAX_SAFE_INTEGER)) throw new RelayRejected("The forward request has a bad deadline");
    return {
        from: getAddress(from) as Address,
        to: getAddress(to) as Address,
        value: whole(item.value, "value"),
        gas: whole(item.gas, "gas"),
        deadline: Number(deadline),
        data: data as Hex,
        signature: signature as Hex,
    };
}

export type ServerOptions = {
    log?: RelayLog;
    /** How long a health answer may be reused. Default 10 s, so a monitor cannot flood the node. */
    healthCacheMs?: number;
    now?: () => number;
    maxBodyBytes?: number;
};

function send(res: ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { "content-type": "application/json", ...(status === 413 ? { connection: "close" } : {}) });
    res.end(JSON.stringify(body));
}

/**
 * The HTTP face of the relayer: `GET /health` and `POST /relay`. `/health` is 200 only when the node answers
 * and the gas wallet holds more than its minimum, so a monitor learns of an empty wallet before a user does.
 */
export function createRelayerServer(relayer: Relayer, options: ServerOptions = {}): Server {
    const log = options.log ?? (() => undefined);
    const now = options.now ?? Date.now;
    const cacheMs = options.healthCacheMs ?? 10_000;
    const limit = options.maxBodyBytes ?? MAX_BODY_BYTES;
    let cached: { at: number; status: number; body: unknown } | undefined;

    async function health(): Promise<{ status: number; body: unknown }> {
        if (cached !== undefined && now() - cached.at < cacheMs) return cached;
        let result: { at: number; status: number; body: unknown };
        try {
            const wallet = await relayer.walletBalance();
            const low = wallet.balanceWei <= wallet.minBalanceWei;
            result = {
                at: now(),
                status: low ? 503 : 200,
                body: {
                    ok: !low,
                    rpc: true,
                    wallet: wallet.address,
                    balanceWei: wallet.balanceWei.toString(),
                    lowBalance: low,
                },
            };
        } catch (error) {
            log({ event: "health-failed", reason: (error as Error).message });
            result = { at: now(), status: 503, body: { ok: false, rpc: false } };
        }
        cached = result;
        return result;
    }

    async function relay(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const started = now();
        let integratorId = "";
        let from: string | undefined;
        const finish = (status: number, body: Record<string, unknown>, reason?: string) => {
            log({
                event: "relay",
                integrator: integratorId,
                from,
                status,
                ms: now() - started,
                hash: body.hash,
                reason,
            });
            send(res, status, body);
        };
        try {
            const text = await readBody(req, limit);
            let body: { integratorId?: unknown; request?: unknown };
            try {
                body = JSON.parse(text) as typeof body;
            } catch {
                throw new RelayRejected("The request body is not valid JSON");
            }
            if (typeof body !== "object" || body === null)
                throw new RelayRejected("The request body is not valid JSON");
            const header = req.headers.authorization ?? "";
            const bearer = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
            integratorId = typeof body.integratorId === "string" ? body.integratorId : "";
            const request = parseForwardRequest(body.request);
            from = request.from;
            const hash = await relayer.submit(request, integratorId, bearer);
            finish(200, { hash });
        } catch (error) {
            if (error instanceof TooLarge) finish(413, { error: "The request body is too large" }, "too large");
            else if (error instanceof RelayRejected) finish(400, { error: error.message }, error.message);
            else if (error instanceof RelayUnavailable) finish(503, { error: error.message }, error.message);
            else if (error instanceof RelayPending) finish(504, { error: error.message, hash: error.hash }, "pending");
            else {
                // The reason is for the log; the sender gets no internal detail.
                finish(500, { error: "The relayer failed to send the transaction" }, (error as Error).message);
            }
        }
    }

    const server = createServer((req, res) => {
        if (req.method === "GET" && req.url === "/health") {
            void health().then((result) => send(res, result.status, result.body));
            return;
        }
        if (req.method === "POST" && req.url === "/relay") {
            void relay(req, res);
            return;
        }
        res.writeHead(404);
        res.end();
    });
    // A slow or stalled client must not hold a socket open for ever.
    server.requestTimeout = 15_000;
    server.headersTimeout = 10_000;
    server.keepAliveTimeout = 5_000;
    return server;
}
