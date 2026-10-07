import { expect } from "chai";
import type { AddressInfo } from "net";
import { getAddress, type Address, type Hash } from "viem";

import {
    MAX_BODY_BYTES,
    parseForwardRequest,
    parseIntegrators,
    Relayer,
    RelayPending,
    RelayRejected,
    RelayUnavailable,
} from "../src";
import { createRelayerServer } from "../src/server";
import type { ProtocolAddresses } from "../../sdk/src";

const addresses: ProtocolAddresses = {
    network: "hardhat",
    chainId: 31337,
    forwarder: getAddress("0x0000000000000000000000000000000000000001"),
    factory: getAddress("0x0000000000000000000000000000000000000002"),
    usdc: getAddress("0x0000000000000000000000000000000000000003"),
    instance: getAddress("0x0000000000000000000000000000000000000004"),
    evaluator: getAddress("0x0000000000000000000000000000000000000005"),
};

const SIGNER = getAddress("0x00000000000000000000000000000000000000aa");
const WALLET = getAddress("0x00000000000000000000000000000000000000bb");
const HASH = `0x${"ab".repeat(32)}` as Hash;
const TOKEN = "secret-token";

const wire = (over: Record<string, unknown> = {}) => ({
    from: SIGNER,
    to: addresses.instance,
    value: "0",
    gas: "200000",
    deadline: 4_000_000_000,
    data: "0x1234",
    signature: `0x${"11".repeat(65)}`,
    ...over,
});

type Fakes = {
    balance: bigint;
    receipt: "ok" | "revert" | "timeout";
    sends: number;
    nodeDown: boolean;
};

function setup(over: Partial<Fakes> = {}, options: Partial<ConstructorParameters<typeof Relayer>[3]> = {}) {
    const fakes: Fakes = { balance: 10n ** 18n, receipt: "ok", sends: 0, nodeDown: false, ...over };
    const publicClient = {
        readContract: async () => true,
        getGasPrice: async () => 1n,
        estimateGas: async () => 100_000n,
        getBalance: async () => {
            if (fakes.nodeDown) throw new Error("node down");
            return fakes.balance;
        },
        getTransactionCount: async () => 7,
        waitForTransactionReceipt: async () => {
            if (fakes.receipt === "timeout") throw new Error("timed out");
            return { status: fakes.receipt === "ok" ? "success" : "reverted", gasUsed: 60_000n, effectiveGasPrice: 1n };
        },
    };
    const wallet = {
        account: { address: WALLET },
        chain: undefined,
        sendTransaction: async () => {
            fakes.sends += 1;
            return HASH;
        },
    };
    const logs: Record<string, unknown>[] = [];
    const budgets: Record<string, bigint>[] = [];
    const relayer = new Relayer(publicClient as never, wallet as never, addresses, {
        integrators: [{ id: "errands", token: TOKEN, budgetWei: 1_000_000n, maxRequests: 100, windowSeconds: 60 }],
        blocked: new Set<Address>(),
        now: () => 1_000,
        log: (entry) => logs.push(entry),
        onBudgets: (left) => budgets.push(left),
        ...options,
    });
    return { relayer, fakes, logs, budgets };
}

const request = (over: Record<string, unknown> = {}) => parseForwardRequest(wire(over));

describe("relayer safety", () => {
    it("reads a request strictly and names what is wrong", () => {
        expect(request().gas).to.equal(200_000n);
        expect(() => parseForwardRequest(null)).to.throw(RelayRejected, "missing");
        expect(() => request({ from: "nope" })).to.throw(RelayRejected, "bad address");
        expect(() => request({ gas: "12abc" })).to.throw(RelayRejected, "bad gas");
        expect(() => request({ gas: "-1" })).to.throw(RelayRejected, "bad gas");
        expect(() => request({ data: "0xzz" })).to.throw(RelayRejected, "bad data");
        expect(() => request({ signature: "0x12" })).to.throw(RelayRejected, "bad signature");
    });

    it("refuses a request that asks for too much gas, or has expired", async () => {
        const { relayer } = setup({}, { maxGas: 300_000n });
        await relayer.submit(request(), "errands", TOKEN);
        let failure: unknown;
        await relayer.submit(request({ gas: "300001" }), "errands", TOKEN).catch((e) => (failure = e));
        expect((failure as Error).message).to.contain("more gas");
        await relayer.submit(request({ deadline: 999 }), "errands", TOKEN).catch((e) => (failure = e));
        expect((failure as Error).message).to.contain("expired");
    });

    it("stops before sending when the gas wallet is nearly empty", async () => {
        const { relayer, fakes } = setup({ balance: 150_000n }, { minBalanceWei: 100_000n });
        let failure: unknown;
        await relayer.submit(request(), "errands", TOKEN).catch((e) => (failure = e));
        expect(failure).to.be.instanceOf(RelayUnavailable);
        expect(fakes.sends).to.equal(0);
        expect(relayer.budgetsLeft().errands).to.equal(1_000_000n);
    });

    it("settles a budget to the gas actually used and reports each change", async () => {
        const { relayer, budgets } = setup();
        await relayer.submit(request(), "errands", TOKEN);
        expect(relayer.budgetsLeft().errands).to.equal(1_000_000n - 60_000n);
        expect(budgets.length).to.be.greaterThan(1);
    });

    it("keeps the gas held when a sent transaction is not confirmed in time", async () => {
        const { relayer } = setup({ receipt: "timeout" });
        let failure: unknown;
        await relayer.submit(request(), "errands", TOKEN).catch((e) => (failure = e));
        expect(failure).to.be.instanceOf(RelayPending);
        expect((failure as RelayPending).hash).to.equal(HASH);
        expect(relayer.budgetsLeft().errands).to.equal(1_000_000n - 100_000n);
    });

    it("restores a budget from an earlier run but never above the configured one", () => {
        expect(setup({}, { restoredBudgets: { errands: 500n } }).relayer.budgetsLeft().errands).to.equal(500n);
        expect(setup({}, { restoredBudgets: { errands: 10n ** 30n } }).relayer.budgetsLeft().errands).to.equal(
            1_000_000n
        );
    });
});

describe("relayer public integrator (an app that cannot keep a secret)", () => {
    const signerLimit = { maxRequests: 2, windowSeconds: 3600, gasWei: 250_000n };
    const publicIntegrator = {
        id: "app",
        token: "",
        public: true,
        budgetWei: 1_000_000n,
        maxRequests: 100,
        windowSeconds: 60,
        signer: signerLimit,
    };
    const pub = () => setup({}, { integrators: [publicIntegrator] });

    it("reads the config: a public integrator needs per-signer limits and takes no token", () => {
        const base = { id: "app", budgetWei: "1000", maxRequests: 10, windowSeconds: 60 };
        expect(() => parseIntegrators(JSON.stringify([{ ...base, public: true }]))).to.throw("per-signer limits");
        expect(() =>
            parseIntegrators(
                JSON.stringify([
                    { ...base, public: true, token: "x", signer: { maxRequests: 1, windowSeconds: 1, gasWei: "1" } },
                ])
            )
        ).to.throw("takes no token");
        const [row] = parseIntegrators(
            JSON.stringify([{ ...base, public: true, signer: { maxRequests: 5, windowSeconds: 60, gasWei: "100" } }])
        );
        expect(row.public).to.equal(true);
        expect(row.signer?.gasWei).to.equal(100n);
        // A normal integrator still needs a token.
        expect(() => parseIntegrators(JSON.stringify([{ ...base }]))).to.throw("id and a token");
    });

    it("accepts a request with no token", async () => {
        const { relayer } = pub();
        expect(await relayer.submit(request(), "app", "")).to.equal(HASH);
    });

    it("still refuses an empty token on a normal integrator", async () => {
        const { relayer } = setup();
        try {
            await relayer.submit(request(), "errands", "");
            expect.fail("should refuse");
        } catch (error) {
            expect(error).to.be.instanceOf(RelayRejected);
        }
    });

    it("stops one signer at the per-signer request limit but serves another", async () => {
        const { relayer } = pub();
        await relayer.submit(request(), "app", "");
        await relayer.submit(request(), "app", "");
        try {
            await relayer.submit(request(), "app", "");
            expect.fail("should refuse");
        } catch (error) {
            expect((error as Error).message).to.equal("The signer rate limit is spent");
        }
        const other = getAddress("0x00000000000000000000000000000000000000cc");
        expect(await relayer.submit(request({ from: other }), "app", "")).to.equal(HASH);
    });

    it("stops one signer at the per-signer gas limit (each request holds 100,000 wei here)", async () => {
        const { relayer } = setup(
            {},
            { integrators: [{ ...publicIntegrator, signer: { ...signerLimit, maxRequests: 10, gasWei: 150_000n } }] }
        );
        await relayer.submit(request(), "app", "");
        try {
            await relayer.submit(request(), "app", "");
            expect.fail("should refuse");
        } catch (error) {
            expect((error as Error).message).to.equal("The signer gas limit is spent");
        }
    });

    it("does not count a request whose signature is bad against the named signer", async () => {
        let valid = false;
        const { relayer } = setup({}, { integrators: [publicIntegrator] });
        (relayer as unknown as { publicClient: { readContract: () => Promise<boolean> } }).publicClient.readContract =
            async () => valid;
        for (let i = 0; i < 5; i += 1) {
            try {
                await relayer.submit(request(), "app", "");
            } catch {
                /* a forged request is refused */
            }
        }
        valid = true;
        expect(await relayer.submit(request(), "app", "")).to.equal(HASH);
    });

    it("lets the signer back in after the window passes", async () => {
        let t = 1_000;
        const { relayer } = setup({}, { integrators: [publicIntegrator], now: () => t });
        await relayer.submit(request(), "app", "");
        await relayer.submit(request(), "app", "");
        t += 3_601;
        expect(await relayer.submit(request({ deadline: 4_000_000_000 }), "app", "")).to.equal(HASH);
    });
});

describe("relayer http", () => {
    async function serve(over: Partial<Fakes> = {}, options: Partial<ConstructorParameters<typeof Relayer>[3]> = {}) {
        const made = setup(over, options);
        const server = createRelayerServer(made.relayer, { log: (e) => made.logs.push(e), healthCacheMs: 0 });
        await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
        const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        const post = (body: string, token = TOKEN) =>
            fetch(`${url}/relay`, { method: "POST", headers: { authorization: `Bearer ${token}` }, body });
        return { ...made, url, post, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
    }

    it("relays a good request and logs it without the token", async () => {
        const s = await serve();
        try {
            const res = await s.post(JSON.stringify({ integratorId: "errands", request: wire() }));
            expect(res.status).to.equal(200);
            expect(((await res.json()) as { hash: string }).hash).to.equal(HASH);
            expect(JSON.stringify(s.logs)).to.not.contain(TOKEN);
            expect(s.logs.find((e) => e.event === "relay")).to.include({ status: 200, integrator: "errands" });
        } finally {
            await s.close();
        }
    });

    it("answers 400 for bad JSON and bad fields, 413 for a huge body, 400 for a wrong token", async () => {
        const s = await serve();
        try {
            expect((await s.post("{not json")).status).to.equal(400);
            expect(
                (await s.post(JSON.stringify({ integratorId: "errands", request: wire({ gas: "x" }) }))).status
            ).to.equal(400);
            expect((await s.post("x".repeat(MAX_BODY_BYTES + 10))).status).to.equal(413);
            const wrong = await s.post(JSON.stringify({ integratorId: "errands", request: wire() }), "nope");
            expect(wrong.status).to.equal(400);
        } finally {
            await s.close();
        }
    });

    it("answers 503 when the wallet is out of funds and 504 with the hash when a block is slow", async () => {
        const empty = await serve({ balance: 1_000n }, { minBalanceWei: 1n });
        try {
            const res = await empty.post(JSON.stringify({ integratorId: "errands", request: wire() }));
            expect(res.status).to.equal(503);
        } finally {
            await empty.close();
        }
        const slow = await serve({ receipt: "timeout" });
        try {
            const res = await slow.post(JSON.stringify({ integratorId: "errands", request: wire() }));
            expect(res.status).to.equal(504);
            expect(((await res.json()) as { hash: string }).hash).to.equal(HASH);
        } finally {
            await slow.close();
        }
    });

    it("hides internal detail when sending fails", async () => {
        const s = await serve();
        s.fakes.nodeDown = true;
        try {
            const res = await s.post(JSON.stringify({ integratorId: "errands", request: wire() }));
            expect(res.status).to.equal(500);
            const text = await res.text();
            expect(text).to.not.contain("node down");
            expect(JSON.stringify(s.logs)).to.contain("node down");
        } finally {
            await s.close();
        }
    });

    it("reports health: 200 with the wallet, 503 when low or when the node is unreachable", async () => {
        const ok = await serve({ balance: 5n * 10n ** 17n }, { minBalanceWei: 10n ** 17n });
        try {
            const res = await fetch(`${ok.url}/health`);
            expect(res.status).to.equal(200);
            expect(await res.json()).to.include({ ok: true, rpc: true, lowBalance: false });
        } finally {
            await ok.close();
        }
        const low = await serve({ balance: 5n }, { minBalanceWei: 10n });
        try {
            expect((await fetch(`${low.url}/health`)).status).to.equal(503);
        } finally {
            await low.close();
        }
        const down = await serve({ nodeDown: true });
        try {
            const res = await fetch(`${down.url}/health`);
            expect(res.status).to.equal(503);
            expect(await res.json()).to.include({ ok: false, rpc: false });
        } finally {
            await down.close();
        }
    });

    it("exposes metrics for Prometheus: wallet, budgets and the traffic by status", async () => {
        const s = await serve({ balance: 2n * 10n ** 18n }, { minBalanceWei: 10n ** 17n });
        try {
            await s.post(JSON.stringify({ integratorId: "errands", request: wire() }));
            await s.post("not json");
            for (const made of ["made-up-1", "made-up-2"])
                await s.post(JSON.stringify({ integratorId: made, request: wire() }));
            const res = await fetch(`${s.url}/metrics`);
            expect(res.status).to.equal(200);
            expect(res.headers.get("content-type")).to.contain("text/plain");
            const text = await res.text();
            expect(text).to.contain("opus_relayer_up 1");
            expect(text).to.contain(`opus_relayer_wallet_balance_coins{wallet="${WALLET}"} 2`);
            expect(text).to.contain("opus_relayer_wallet_min_balance_coins 0.1");
            expect(text).to.contain('opus_relayer_requests_total{integrator="errands",status="200"} 1');
            // Unknown or missing integrators share one label, so callers cannot grow the metrics by inventing names.
            expect(text).to.not.contain("made-up");
            expect(text).to.match(/opus_relayer_requests_total\{integrator="unknown",status="\d+"\} /);
            expect(text).to.contain('opus_relayer_budget_total_coins{integrator="errands"}');
            expect(text).to.not.contain(TOKEN);
        } finally {
            await s.close();
        }
        const down = await serve({ nodeDown: true });
        try {
            const text = await (await fetch(`${down.url}/metrics`)).text();
            expect(text).to.contain("opus_relayer_up 0").and.to.contain("opus_relayer_rpc_up 0");
        } finally {
            await down.close();
        }
    });
});
