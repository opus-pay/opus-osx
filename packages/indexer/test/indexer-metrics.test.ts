import { expect } from "chai";
import type { AddressInfo } from "net";

import { MemoryLedger } from "../src/ledger";
import { createIndexerServer, indexerMetrics, type IndexerStatus } from "../src/server";
import { IndexStore } from "../src/store";

const status = (over: Partial<IndexerStatus> = {}): IndexerStatus => ({
    startedAt: 1_000_000,
    head: 120n,
    indexedTo: 118n,
    lastOkAt: 1_050_000,
    failures: 0,
    jobs: 3,
    staleMs: 120_000,
    caughtUpWithin: 5n,
    ...over,
});

describe("indexer metrics", () => {
    it("reports health, lag and the ledger by status", async () => {
        const store = new IndexStore(new MemoryLedger());
        const text = await indexerMetrics(store, status({ syncs: 4, reorgs: 1 }), 1_060_000);
        expect(text).to.contain("opus_indexer_up 1");
        expect(text).to.contain("opus_indexer_synced 1");
        expect(text).to.contain("opus_indexer_head_block 120");
        expect(text).to.contain("opus_indexer_lag_blocks 2");
        expect(text).to.contain("opus_indexer_last_ok_age_seconds 10");
        expect(text).to.contain("opus_indexer_syncs_total 4");
        expect(text).to.contain("opus_indexer_reorgs_total 1");
        expect(text).to.contain("opus_indexer_instances 0");
    });

    it("says down and not synced when it is behind or silent", async () => {
        const store = new IndexStore(new MemoryLedger());
        const behind = await indexerMetrics(store, status({ head: 500n }), 1_060_000);
        expect(behind).to.contain("opus_indexer_up 1").and.to.contain("opus_indexer_synced 0");
        const silent = await indexerMetrics(store, status(), 1_500_000);
        expect(silent).to.contain("opus_indexer_up 0");
    });

    it("counts jobs by status in the ledger", async () => {
        const ledger = new MemoryLedger();
        const base = {
            instance: "0x0000000000000000000000000000000000000004",
            client: "0x00000000000000000000000000000000000000c1",
            provider: "0x00000000000000000000000000000000000000c2",
            evaluator: "0x0000000000000000000000000000000000000005",
            hook: "0x0000000000000000000000000000000000000005",
            expiredAt: 0n,
            budget: 1n,
            phase: "None",
            configured: true,
            deliverable: undefined,
            disputeDeadline: undefined,
            deposit: 0n,
            tipPaid: 0n,
            feePaid: 0n,
            swept: false,
        };
        await ledger.putJob({ ...base, jobId: 1n, status: "Funded" } as never);
        await ledger.putJob({ ...base, jobId: 2n, status: "Funded" } as never);
        await ledger.putJob({ ...base, jobId: 3n, status: "Completed" } as never);
        const text = await indexerMetrics(new IndexStore(ledger), undefined, 0);
        expect(text).to.contain('opus_indexer_jobs{status="Funded"} 2');
        expect(text).to.contain('opus_indexer_jobs{status="Completed"} 1');
        expect(text).to.not.contain("opus_indexer_up");
    });

    it("serves /metrics over HTTP and keeps it behind the token when one is set", async () => {
        const server = createIndexerServer(new IndexStore(new MemoryLedger()), {
            status: () => status(),
            token: "secret",
            now: () => 1_060_000,
        });
        await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
        const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        try {
            expect((await fetch(`${url}/metrics`)).status).to.equal(401);
            const ok = await fetch(`${url}/metrics`, { headers: { authorization: "Bearer secret" } });
            expect(ok.status).to.equal(200);
            expect(ok.headers.get("content-type")).to.contain("text/plain");
            expect(await ok.text()).to.contain("opus_indexer_up 1");
        } finally {
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
    });
});
