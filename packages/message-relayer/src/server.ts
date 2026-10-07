import { createServer, type IncomingMessage, type Server, type ServerResponse } from "http";

import { METRICS_CONTENT_TYPE, renderMetrics, type Sample } from "./metrics";
import { MessageRelayer, RelayRejected, RelayUnavailable } from "./relay";
import { SlidingCounter } from "./services";
import type { Store } from "./store";

/** Bodies larger than this are refused. A push or a signed request is a few hundred bytes. */
export const MAX_BODY_BYTES = 16_000;

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

export type ServerOptions = {
    /** Signed-request calls (register, mute) allowed per minute from one address. Default 30. */
    publicPerMinute?: number;
    /** Read the caller's address from `x-forwarded-for` (set it only behind a proxy you control). */
    trustProxy?: boolean;
    now?: () => number;
};

/**
 * The HTTP face. `POST /v1/push` is for services (bearer key). `POST /v1/devices` and `POST /v1/mutes` are for
 * wallets (signed). `/health` and `/metrics` are for operators; keep `/metrics` on an internal network.
 */
export function createMessageRelayerServer(relayer: MessageRelayer, store: Store, options: ServerOptions = {}): Server {
    const now = options.now ?? (() => Math.floor(Date.now() / 1000));
    const publicLimit = new SlidingCounter(options.publicPerMinute ?? 30, 60, now);
    const byRoute = new Map<string, number>();

    const callerOf = (req: IncomingMessage): string => {
        if (options.trustProxy === true) {
            const forwarded = req.headers["x-forwarded-for"];
            const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim();
            if (first) return first;
        }
        return req.socket.remoteAddress ?? "unknown";
    };

    const send = (
        res: ServerResponse,
        route: string,
        status: number,
        body: unknown,
        headers: Record<string, string> = {}
    ) => {
        const key = `${route}\u0000${status}`;
        byRoute.set(key, (byRoute.get(key) ?? 0) + 1);
        const text = typeof body === "string" ? body : JSON.stringify(body);
        res.writeHead(status, {
            "content-type": typeof body === "string" ? METRICS_CONTENT_TYPE : "application/json",
            "cache-control": "no-store",
            ...headers,
        });
        res.end(text);
    };

    return createServer((req, res) => {
        void (async () => {
            const url = new URL(req.url ?? "/", "http://localhost");
            const route = `${req.method} ${url.pathname}`;
            try {
                if (req.method === "GET" && url.pathname === "/health") {
                    return send(res, route, 200, { ok: true, devices: store.deviceCount() });
                }
                if (req.method === "GET" && url.pathname === "/metrics") {
                    const samples: Sample[] = [
                        { name: "opus_message_relayer_up", help: "1 while the process runs.", type: "gauge", value: 1 },
                        {
                            name: "opus_message_relayer_devices",
                            help: "Phones registered.",
                            type: "gauge",
                            value: store.deviceCount(),
                        },
                        {
                            name: "opus_message_relayer_registrations_total",
                            help: "Device registrations accepted.",
                            type: "counter",
                            value: relayer.stats.registrations,
                        },
                        {
                            name: "opus_message_relayer_devices_forgotten_total",
                            help: "Dead phones removed.",
                            type: "counter",
                            value: relayer.stats.devicesForgotten,
                        },
                    ];
                    for (const [service, counts] of relayer.stats.pushes) {
                        for (const [outcome, value] of Object.entries(counts)) {
                            samples.push({
                                name: "opus_message_relayer_pushes_total",
                                help: "Wallets handled for services, by outcome.",
                                type: "counter",
                                value,
                                labels: { service, outcome },
                            });
                        }
                    }
                    for (const [key, value] of byRoute) {
                        const [r, status] = key.split("\u0000");
                        samples.push({
                            name: "opus_message_relayer_http_requests_total",
                            help: "HTTP requests by route and status.",
                            type: "counter",
                            value,
                            labels: { route: r, status },
                        });
                    }
                    return send(res, route, 200, renderMetrics(samples));
                }
                const isPush = req.method === "POST" && url.pathname === "/v1/push";
                const isLanguages = req.method === "POST" && url.pathname === "/v1/languages";
                const isDevices = req.method === "POST" && url.pathname === "/v1/devices";
                const isMutes = req.method === "POST" && url.pathname === "/v1/mutes";
                if (!isPush && !isLanguages && !isDevices && !isMutes)
                    return send(res, route, 404, { error: "Not found" });

                let body: unknown;
                try {
                    body = JSON.parse(await readBody(req, MAX_BODY_BYTES));
                } catch (error) {
                    if (error instanceof TooLarge) {
                        return send(res, route, 413, { error: "The request is too large" }, { connection: "close" });
                    }
                    return send(res, route, 400, { error: "The body is not valid JSON" });
                }
                if (isPush || isLanguages) {
                    const header = req.headers.authorization ?? "";
                    const bearer = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
                    const service = relayer.authenticate(bearer);
                    if (isLanguages) return send(res, route, 200, { languages: relayer.languages(service, body) });
                    return send(res, route, 200, await relayer.push(service, body));
                }
                if (!publicLimit.hit(callerOf(req))) {
                    return send(res, route, 429, { error: "Too many requests" }, { "retry-after": "60" });
                }
                if (isDevices) return send(res, route, 200, await relayer.device(body));
                await relayer.mute(body);
                return send(res, route, 200, { result: "ok" });
            } catch (error) {
                if (error instanceof RelayRejected) return send(res, route, error.status, { error: error.message });
                if (error instanceof RelayUnavailable) return send(res, route, 503, { error: error.message });
                // Never show internal detail.
                console.error(JSON.stringify({ event: "error", route, reason: String(error) }));
                return send(res, route, 500, { error: "The message relayer failed" });
            }
        })();
    });
}
