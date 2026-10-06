import { createServer, type Server } from "http";

import { coins, METRICS_CONTENT_TYPE, renderMetrics, type Sample } from "./metrics";

/** What the loop tells the health check after each pass. */
export type KeeperStatus = {
    startedAt: number;
    lastOkAt?: number;
    lastError?: string;
    failures: number;
    checked: number;
    skipped: number;
    pendingCalls: number;
    /** Where the last pass got its list of jobs: the index or a scan of the chain. */
    source?: "index" | "scan";
    /** The keeper wallet, its balance and the least it should keep, for `/metrics`. */
    wallet?: string;
    balanceWei?: bigint;
    minBalanceWei?: bigint;
    /** Totals since start: passes run, calls sent by action, alerts raised by kind, jobs that could not be handled. */
    passes?: number;
    callsSent?: Record<string, number>;
    alerts?: Record<string, number>;
    jobErrors?: number;
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

/** What Prometheus scrapes at `GET /metrics`: whether the loop is healthy, how it is doing and what the wallet holds. */
export function keeperMetrics(status: KeeperStatus, now: number, staleMs: number): string {
    const view = judge(status, now, staleMs);
    const samples: Sample[] = [
        { name: "opus_keeper_up", help: "1 when the keeper loop is healthy.", type: "gauge", value: view.ok ? 1 : 0 },
        {
            name: "opus_keeper_last_ok_age_seconds",
            help: "Seconds since the last clean pass (since start before the first one).",
            type: "gauge",
            value: Math.round((now - (status.lastOkAt ?? status.startedAt)) / 1000),
        },
        {
            name: "opus_keeper_failed_passes",
            help: "Passes that failed in a row.",
            type: "gauge",
            value: status.failures,
        },
        {
            name: "opus_keeper_passes_total",
            help: "Passes run since start.",
            type: "counter",
            value: status.passes ?? 0,
        },
        {
            name: "opus_keeper_jobs_checked",
            help: "Jobs read in the last pass.",
            type: "gauge",
            value: status.checked,
        },
        {
            name: "opus_keeper_jobs_skipped",
            help: "Jobs left out of the last pass because they are finished or belong to another evaluator.",
            type: "gauge",
            value: status.skipped,
        },
        {
            name: "opus_keeper_pending_calls",
            help: "Calls sent that have not shown up in a block yet.",
            type: "gauge",
            value: status.pendingCalls,
        },
        {
            name: "opus_keeper_job_errors_total",
            help: "Jobs that could not be read or handled, since start.",
            type: "counter",
            value: status.jobErrors ?? 0,
        },
        {
            name: "opus_keeper_start_time_seconds",
            help: "When the keeper started, in Unix seconds.",
            type: "gauge",
            value: Math.round(status.startedAt / 1000),
        },
    ];
    if (status.source !== undefined)
        samples.push({
            name: "opus_keeper_source_index",
            help: "1 when the last pass took its job list from the indexer, 0 when it scanned the chain.",
            type: "gauge",
            value: status.source === "index" ? 1 : 0,
        });
    if (status.balanceWei !== undefined)
        samples.push({
            name: "opus_keeper_wallet_balance_coins",
            help: "Balance of the keeper wallet in POL.",
            type: "gauge",
            value: coins(status.balanceWei),
            labels: status.wallet === undefined ? {} : { wallet: status.wallet },
        });
    if (status.minBalanceWei !== undefined)
        samples.push({
            name: "opus_keeper_wallet_min_balance_coins",
            help: "The least POL the keeper wants to keep; it alerts below this.",
            type: "gauge",
            value: coins(status.minBalanceWei),
        });
    for (const [action, count] of Object.entries(status.callsSent ?? {}))
        samples.push({
            name: "opus_keeper_calls_sent_total",
            help: "Calls the keeper sent, by action.",
            type: "counter",
            value: count,
            labels: { action },
        });
    for (const [kind, count] of Object.entries(status.alerts ?? {}))
        samples.push({
            name: "opus_keeper_alerts_total",
            help: "Alerts the keeper raised, by kind.",
            type: "counter",
            value: count,
            labels: { kind },
        });
    return renderMetrics(samples);
}

/** `GET /health` for an uptime monitor: 200 when healthy, 503 with the reasons otherwise. */
export function createHealthServer(read: () => KeeperStatus, staleMs: number, now: () => number = Date.now): Server {
    return createServer((req, res) => {
        if (req.method === "GET" && req.url === "/metrics") {
            res.writeHead(200, { "content-type": METRICS_CONTENT_TYPE });
            res.end(keeperMetrics(read(), now(), staleMs));
            return;
        }
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
                source: status.source,
            })
        );
    });
}
