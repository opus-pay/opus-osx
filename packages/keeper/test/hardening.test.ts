import { expect } from "chai";
import type { AddressInfo } from "net";
import { getAddress, type Address, type Hash } from "viem";

import { AlertGate, createHealthServer, createNotifier, Keeper, judge, type Alert, type KeeperStatus } from "../src";

const EVALUATOR = getAddress("0x00000000000000000000000000000000000000e1");
const OTHER = getAddress("0x00000000000000000000000000000000000000e2");
const KEEPER = getAddress("0x00000000000000000000000000000000000000cc");
const HASH = `0x${"cd".repeat(32)}` as Hash;

type Job = { evaluator: Address; status: string; expiredAt: bigint };

function fake(
    jobs: Record<number, Job>,
    over: { due?: Record<number, string[]>; unreadable?: number[]; receipt?: "ok" | "timeout" } = {}
) {
    const calls: { jobId: bigint; action: string }[] = [];
    const reads: bigint[] = [];
    const opus = {
        addresses: { instance: getAddress("0x00000000000000000000000000000000000000a1"), evaluator: EVALUATOR },
        publicClient: {
            getBalance: async () => 10n ** 18n,
            readContract: async () => BigInt(Object.keys(jobs).length),
            getBlock: async () => ({ timestamp: 1_000n }),
            waitForTransactionReceipt: async () => {
                if (over.receipt === "timeout") throw new Error("timed out");
                return { status: "success" };
            },
        },
        job: async (jobId: bigint) => {
            reads.push(jobId);
            if (over.unreadable?.includes(Number(jobId))) throw new Error("rpc hiccup");
            return jobs[Number(jobId)];
        },
        status: async (jobId: bigint) => ({ actions: over.due?.[Number(jobId)] ?? [] }),
    } as Record<string, unknown>;
    for (const action of [
        "finalize",
        "timeoutNoSubmission",
        "escalateOnSilence",
        "resolveMissingDeposit",
        "resolveByDefault",
    ]) {
        opus[action] = async (jobId: bigint) => {
            calls.push({ jobId, action });
            return HASH;
        };
    }
    return { opus: opus as never, calls, reads };
}

const live = (over: Partial<Job> = {}): Job => ({
    evaluator: EVALUATOR,
    status: "Submitted",
    expiredAt: 10n ** 12n,
    ...over,
});

describe("keeper pass", () => {
    it("reads a finished job or another evaluator's job only once", async () => {
        const f = fake({ 1: live({ status: "Completed" }), 2: live({ evaluator: OTHER }), 3: live() });
        const keeper = new Keeper(f.opus, KEEPER, { baseDelayMs: 0 });
        const first = await keeper.tick();
        expect(first).to.include({ checked: 3, skipped: 0 });
        const second = await keeper.tick();
        expect(second).to.include({ checked: 1, skipped: 2 });
        expect(f.reads.filter((id) => id === 1n)).to.have.length(1);
    });

    it("keeps going when one job cannot be read, and says which", async () => {
        const f = fake({ 1: live(), 2: live(), 3: live() }, { unreadable: [2], due: { 3: ["finalize"] } });
        const alerts: Alert[] = [];
        const result = await new Keeper(f.opus, KEEPER, { onAlert: (a) => alerts.push(a) }).tick();
        expect(result.errors).to.have.length(1);
        expect(result.errors[0]).to.deep.include({ jobId: 2n, message: "rpc hiccup" });
        expect(result.calls.map((c) => c.jobId)).to.deep.equal([3n]);
        expect(alerts.some((a) => a.kind === "job-error")).to.equal(true);
    });

    it("does not send a call again while an earlier one is waiting for a block", async () => {
        const f = fake({ 1: live() }, { due: { 1: ["finalize"] }, receipt: "timeout" });
        let clock = 0;
        const alerts: Alert[] = [];
        const keeper = new Keeper(f.opus, KEEPER, {
            now: () => clock,
            pendingTtlMs: 600_000,
            onAlert: (a) => alerts.push(a),
        });
        await keeper.tick();
        expect(f.calls).to.have.length(1);
        expect(alerts.map((a) => a.kind)).to.include("call-pending");
        clock += 60_000;
        await keeper.tick();
        expect(f.calls).to.have.length(1);
        expect(keeper.pendingCalls).to.equal(1);
        clock += 600_000;
        await keeper.tick();
        expect(f.calls).to.have.length(2);
    });
});

describe("keeper alerts", () => {
    it("lets the same alert through once per cooldown", () => {
        let clock = 0;
        const gate = new AlertGate(1_000, () => clock);
        const alert: Alert = { kind: "near-expiry", jobId: 1n, expiredAt: 5n, now: 1n };
        expect(gate.allow(alert)).to.equal(true);
        expect(gate.allow(alert)).to.equal(false);
        expect(gate.allow({ ...alert, jobId: 2n })).to.equal(true);
        clock += 1_001;
        expect(gate.allow(alert)).to.equal(true);
    });

    it("posts to a webhook once, without breaking when it fails", async () => {
        const sent: { url: string; body: string }[] = [];
        const lines: string[] = [];
        const notify = createNotifier({
            webhookUrl: "http://hook",
            log: (l) => lines.push(l),
            fetch: (async (url: string, init: { body: string }) => {
                sent.push({ url, body: init.body });
                throw new Error("hook down");
            }) as never,
        });
        const alert: Alert = { kind: "low-balance", balance: 5n, minimum: 10n };
        notify(alert);
        notify(alert);
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(sent).to.have.length(1);
        expect(JSON.parse(sent[0].body)).to.deep.include({ service: "opus-keeper" });
        expect(lines.join()).to.contain("webhook-failed");
    });
});

describe("keeper health", () => {
    const base: KeeperStatus = { startedAt: 0, failures: 0, checked: 0, skipped: 0, pendingCalls: 0 };

    it("is healthy with a recent clean pass, and not when stale or failing", () => {
        expect(judge({ ...base, lastOkAt: 90_000 }, 100_000, 120_000).ok).to.equal(true);
        expect(judge(base, 50_000, 120_000).ok).to.equal(true);
        expect(judge(base, 500_000, 120_000).reasons[0]).to.contain("too long");
        expect(judge({ ...base, lastOkAt: 90_000, failures: 5 }, 100_000, 120_000).reasons[0]).to.contain("in a row");
    });

    it("answers 200 or 503 over http", async () => {
        let status: KeeperStatus = { ...base, lastOkAt: Date.now() };
        const server = createHealthServer(() => status, 120_000);
        await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
        const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/health`;
        try {
            expect((await fetch(url)).status).to.equal(200);
            status = { ...status, failures: 9, lastError: "node down" };
            const bad = await fetch(url);
            expect(bad.status).to.equal(503);
            expect(await bad.json()).to.deep.include({ ok: false, lastError: "node down" });
        } finally {
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
    });
});
