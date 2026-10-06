import { expect } from "chai";

import { keeperMetrics, type KeeperStatus } from "../src/health";

const base: KeeperStatus = { startedAt: 1_000_000, failures: 0, checked: 3, skipped: 5, pendingCalls: 1 };

describe("keeper metrics", () => {
    it("says up and how long ago the last clean pass was", () => {
        const text = keeperMetrics({ ...base, lastOkAt: 1_050_000 }, 1_060_000, 120_000);
        expect(text).to.contain("opus_keeper_up 1");
        expect(text).to.contain("opus_keeper_last_ok_age_seconds 10");
        expect(text).to.contain("opus_keeper_jobs_checked 3");
        expect(text).to.contain("opus_keeper_pending_calls 1");
    });

    it("says down when no pass was clean for too long or many passes failed", () => {
        expect(keeperMetrics({ ...base, lastOkAt: 1_000_000 }, 1_500_000, 120_000)).to.contain("opus_keeper_up 0");
        expect(keeperMetrics({ ...base, failures: 5, lastOkAt: 1_000_000 }, 1_010_000, 120_000)).to.contain(
            "opus_keeper_up 0"
        );
    });

    it("reports the wallet, the calls sent and the alerts by kind", () => {
        const text = keeperMetrics(
            {
                ...base,
                wallet: "0xabc",
                balanceWei: 2_000_000_000_000_000_000n,
                minBalanceWei: 500_000_000_000_000_000n,
                callsSent: { finalize: 2, timeout: 1 },
                alerts: { "low-balance": 1 },
                source: "index",
            },
            1_010_000,
            120_000
        );
        expect(text).to.contain('opus_keeper_wallet_balance_coins{wallet="0xabc"} 2');
        expect(text).to.contain("opus_keeper_wallet_min_balance_coins 0.5");
        expect(text).to.contain('opus_keeper_calls_sent_total{action="finalize"} 2');
        expect(text).to.contain('opus_keeper_alerts_total{kind="low-balance"} 1');
        expect(text).to.contain("opus_keeper_source_index 1");
    });

    it("leaves out what it does not know yet", () => {
        const text = keeperMetrics(base, 1_010_000, 120_000);
        expect(text).to.not.contain("wallet_balance");
        expect(text).to.not.contain("calls_sent_total");
    });
});
