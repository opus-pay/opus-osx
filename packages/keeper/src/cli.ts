import { readFileSync } from "fs";

import { amoy, loadAddresses, localHardhat, Opus } from "@opus/sdk";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { createHealthServer, type KeeperStatus } from "./health";
import { describe, Keeper } from "./keeper";
import { createNotifier } from "./notify";
import { redactUrls, rpcHost } from "./redact";
import { keeperAccountFromEnv } from "./wallet";

/**
 * The ids of live jobs from the indexer, or `undefined` if it is not reachable or has not caught up (a list read
 * before then may be missing jobs, so the keeper scans the chain instead).
 */
async function activeFromIndex(
    base: string,
    token: string | undefined,
    instance: string,
    evaluator: string
): Promise<bigint[] | undefined> {
    const headers: Record<string, string> =
        token === undefined || token === "" ? {} : { authorization: `Bearer ${token}` };
    const health = await fetch(`${base}/health`, { signal: AbortSignal.timeout(5_000) });
    const state = (await health.json()) as { ok?: boolean; synced?: boolean };
    if (!health.ok || state.ok !== true || state.synced !== true) return undefined;
    const response = await fetch(`${base}/active?instance=${instance}&evaluator=${evaluator}`, {
        headers,
        signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return undefined;
    const jobs = (await response.json()) as { jobId: string }[];
    return jobs.map((job) => BigInt(job.jobId));
}

async function main(): Promise<void> {
    const account = keeperAccountFromEnv(process.env);
    const path = process.env.KEEPER_ADDRESSES?.trim();
    if (path === undefined || path === "") throw new Error("KEEPER_ADDRESSES is required");
    const addresses = loadAddresses(readFileSync(path, "utf8"));
    const chain = addresses.chainId === 80002 ? amoy : localHardhat;
    const rpc = process.env.KEEPER_RPC_URL?.trim() || chain.rpcUrls.default.http[0];
    const transport = http(rpc);
    const signer = privateKeyToAccount(account.privateKey);
    const publicClient = createPublicClient({ chain, transport });
    const walletClient = createWalletClient({ account: signer, chain, transport });
    const opus = new Opus(publicClient, addresses, walletClient);
    const low = process.env.KEEPER_LOW_BALANCE_WEI?.trim();
    const margin = process.env.KEEPER_EXPIRY_MARGIN_SECONDS?.trim();
    const number = (name: string): number | undefined => {
        const raw = process.env[name]?.trim();
        if (raw === undefined || raw === "") return undefined;
        if (!/^\d+$/.test(raw)) throw new Error(`${name} must be a whole number`);
        return Number(raw);
    };
    const notify = createNotifier({
        webhookUrl: process.env.KEEPER_ALERT_WEBHOOK_URL?.trim(),
        cooldownMs: number("KEEPER_ALERT_COOLDOWN_MS"),
    });
    const indexerUrl = process.env.KEEPER_INDEXER_URL?.trim();
    const indexerToken = process.env.KEEPER_INDEXER_TOKEN?.trim();
    const keeper = new Keeper(opus, account.address, {
        fullScanEvery: number("KEEPER_FULL_SCAN_EVERY"),
        activeJobs:
            indexerUrl === undefined || indexerUrl === ""
                ? undefined
                : () => activeFromIndex(indexerUrl, indexerToken, addresses.instance, addresses.evaluator),
        lowBalanceWei: low === undefined || low === "" ? undefined : BigInt(low),
        marginSeconds: margin === undefined || margin === "" ? undefined : BigInt(margin),
        receiptTimeoutMs: number("KEEPER_RECEIPT_TIMEOUT_MS"),
        pendingTtlMs: number("KEEPER_PENDING_TTL_MS"),
        onAlert: notify,
    });
    const poll = number("KEEPER_POLL_MS") ?? 30_000;
    const status: KeeperStatus = {
        startedAt: Date.now(),
        failures: 0,
        checked: 0,
        skipped: 0,
        pendingCalls: 0,
        wallet: account.address,
        minBalanceWei: keeper.minBalanceWei,
        passes: 0,
        callsSent: {},
        alerts: {},
        jobErrors: 0,
    };
    const healthPort = process.env.KEEPER_HEALTH_PORT?.trim();
    if (healthPort !== "off") {
        const host = process.env.KEEPER_HEALTH_HOST?.trim() || "127.0.0.1";
        const port = Number(healthPort || "8789");
        // Healthy when a pass finished cleanly within three poll periods (at least two minutes).
        createHealthServer(() => status, Math.max(120_000, 3 * poll)).listen(port, host);
    }
    console.log("keeper started");
    console.log(`wallet ${account.address}`);
    console.log(`network ${addresses.network} chain ${chain.id} ${chain.name}`);
    // Provider URLs often carry the API key in the path or the query: log the host only.
    console.log(`rpc ${rpcHost(rpc)}`);
    console.log(`instance ${addresses.instance}`);
    console.log(`evaluator ${addresses.evaluator}`);
    console.log(`forwarder ${addresses.forwarder}`);
    console.log(`factory ${addresses.factory}`);
    console.log(`usdc ${addresses.usdc}`);
    console.log(`poll ${poll}ms`);
    let stopping = false;
    const stop = () => {
        // Finish the pass in progress, then leave; never cut a sent call off halfway.
        stopping = true;
    };
    process.on("SIGTERM", stop);
    process.on("SIGINT", stop);
    while (!stopping) {
        try {
            const result = await keeper.tick();
            for (const call of result.calls) {
                console.log(`${call.action} job ${call.jobId} ${call.hash}`);
            }
            status.source = result.source;
            status.passes = (status.passes ?? 0) + 1;
            status.balanceWei = result.balance;
            status.jobErrors = (status.jobErrors ?? 0) + result.errors.length;
            for (const call of result.calls)
                status.callsSent = { ...status.callsSent, [call.action]: (status.callsSent?.[call.action] ?? 0) + 1 };
            for (const alert of result.alerts)
                status.alerts = { ...status.alerts, [alert.kind]: (status.alerts?.[alert.kind] ?? 0) + 1 };
            status.failures = 0;
            status.lastError = undefined;
            status.checked = result.checked;
            status.skipped = result.skipped;
            // A pass with job-level errors still ran; only a failed pass counts toward "not healthy".
            status.lastOkAt = Date.now();
        } catch (error) {
            status.failures += 1;
            status.lastError = describe(error);
            console.error(`tick failed: ${status.lastError}`);
            if (status.failures === 3 || status.failures % 20 === 0) {
                status.alerts = { ...status.alerts, "tick-failing": (status.alerts?.["tick-failing"] ?? 0) + 1 };
                notify({ kind: "tick-failing", failures: status.failures, message: status.lastError });
            }
        }
        status.pendingCalls = keeper.pendingCalls;
        // After failures wait longer (up to 5 minutes) so a down node is not hit every 30 seconds.
        const wait = Math.min(poll * 2 ** Math.min(status.failures, 4), Math.max(poll, 300_000));
        for (let waited = 0; waited < wait && !stopping; waited += 1_000) {
            await new Promise((resolve) => setTimeout(resolve, Math.min(1_000, wait - waited)));
        }
    }
    console.log("keeper stopped");
    process.exit(0);
}

if (require.main === module) {
    main().catch((error: unknown) => {
        console.error(redactUrls(error instanceof Error ? error.message : String(error)));
        process.exit(1);
    });
}
