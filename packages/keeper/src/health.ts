import { createServer, type Server } from "http";

/** What the loop tells the health check after each pass. */
export type KeeperStatus = {
    startedAt: number;
    lastOkAt?: number;
    lastError?: string;
    failures: number;
    checked: number;
    skipped: number;
    pendingCalls: number;
};

export type HealthView = { ok: boolean; reasons: string[] };

/**
 * Healthy means: a pass finished cleanly within `staleMs` (the first one gets that long after start) and not
 * too many passes in a row have failed.
 */
export function judge(status: KeeperStatus, now: number, staleMs: number, maxFailures = 5): HealthView {
    const reasons: string[] = [];
    if (now - (status.lastOkAt ?? status.startedAt) > staleMs) reasons.push("no clean pass for too long");
    if (status.failures >= maxFailures) reasons.push(`${status.failures} passes failed in a row`);
    return { ok: reasons.length === 0, reasons };
}

/** `GET /health` for an uptime monitor: 200 when healthy, 503 with the reasons otherwise. */
export function createHealthServer(read: () => KeeperStatus, staleMs: number, now: () => number = Date.now): Server {
    return createServer((req, res) => {
        if (req.method !== "GET" || req.url !== "/health") {
            res.writeHead(404);
            res.end();
            return;
        }
        const status = read();
        const view = judge(status, now(), staleMs);
        res.writeHead(view.ok ? 200 : 503, { "content-type": "application/json" });
        res.end(
            JSON.stringify({
                ok: view.ok,
                reasons: view.reasons,
                lastOkAgeSeconds:
                    status.lastOkAt === undefined ? undefined : Math.round((now() - status.lastOkAt) / 1000),
                lastError: status.lastError,
                failures: status.failures,
                checked: status.checked,
                skipped: status.skipped,
                pendingCalls: status.pendingCalls,
            })
        );
    });
}
