import { expect } from "chai";
import type { AddressInfo } from "net";
import { privateKeyToAccount } from "viem/accounts";
import { deviceMessage, muteMessage, type PushLang, type PushPlatform } from "@opus/sdk";

import {
    MessageRelayer,
    RelayRejected,
    RelayUnavailable,
    Store,
    MAX_DEVICES_PER_ADDRESS,
    createMessageRelayerServer,
    hashKey,
    newServiceKey,
    parseServices,
    serviceForKey,
    textFor,
} from "../src";

const alice = privateKeyToAccount(`0x${"11".repeat(32)}`);
const bob = privateKeyToAccount(`0x${"22".repeat(32)}`);
const T = (c: string) => `ExponentPushToken[${c.repeat(22)}]`;

const { key: WAYHAND_KEY, service: wayhand } = newServiceKey("wayhand", "wayhand", { perWalletPerDay: 2 });
const { key: OTHER_KEY, service: other } = newServiceKey("other", "other-app");

type Expo = { sent: any[][]; replies: any[]; receipts: Record<string, any>; down: boolean };

async function setup(now = { t: 1_800_000_000 }) {
    const expo: Expo = { sent: [], replies: [], receipts: {}, down: false };
    const fetchFn = (async (url: string, init: { body: string }) => {
        if (expo.down) throw new Error("offline");
        const body = JSON.parse(init.body);
        if (String(url).endsWith("/send")) {
            expo.sent.push(body);
            const reply = expo.replies.shift();
            const data =
                reply ?? body.map((_: unknown, i: number) => ({ status: "ok", id: `tk-${expo.sent.length}-${i}` }));
            return { ok: true, status: 200, json: async () => ({ data }) };
        }
        return { ok: true, status: 200, json: async () => ({ data: expo.receipts }) };
    }) as unknown as typeof fetch;
    const store = await Store.open(":memory:");
    const relayer = new MessageRelayer({
        store,
        services: [wayhand, other],
        expo: { fetch: fetchFn, accessToken: "expo-secret", sleep: async () => undefined, retries: 0 },
        now: () => now.t,
    });
    return { expo, store, relayer, now };
}

const sign = (account: typeof alice, message: string) => account.signMessage({ message });

async function register(
    relayer: MessageRelayer,
    account: typeof alice,
    token: string,
    over: Partial<{ lang: PushLang; platform: PushPlatform; issuedAt: number; action: "register" | "unregister" }> = {},
    now = 1_800_000_000
) {
    const f = {
        action: over.action ?? "register",
        address: account.address,
        token,
        lang: over.lang ?? "ko",
        platform: over.platform ?? "ios",
        issuedAt: over.issuedAt ?? now,
    } as const;
    return relayer.device({ ...f, signature: await sign(account, deviceMessage(f)) });
}

describe("service keys", () => {
    it("issues a key, stores only its hash, and finds the service by key", () => {
        expect(WAYHAND_KEY).to.match(/^opus_msg_[A-Za-z0-9_-]{43}$/);
        expect(wayhand.keyHash).to.equal(hashKey(WAYHAND_KEY));
        expect(JSON.stringify(wayhand)).to.not.contain(WAYHAND_KEY);
        expect(serviceForKey([wayhand, other], WAYHAND_KEY)?.id).to.equal("wayhand");
        expect(serviceForKey([wayhand, other], OTHER_KEY)?.app).to.equal("other-app");
        expect(serviceForKey([wayhand], "nope")).to.equal(undefined);
        expect(serviceForKey([wayhand], "")).to.equal(undefined);
    });

    it("reads the config strictly", () => {
        expect(parseServices(JSON.stringify([wayhand]))).to.have.length(1);
        expect(() => parseServices("[]")).to.throw("at least one");
        expect(() => parseServices(JSON.stringify([{ ...wayhand, keyHash: "abc" }]))).to.throw("SHA-256");
        expect(() => parseServices(JSON.stringify([{ ...wayhand, app: "Bad App" }]))).to.throw("lower case");
        expect(() => parseServices(JSON.stringify([wayhand, wayhand]))).to.throw("twice");
        expect(() => parseServices(JSON.stringify([{ ...wayhand, perWalletPerDay: 0 }]))).to.throw("per-wallet");
    });
});

describe("registering a phone", () => {
    it("takes a phone signed by the wallet and keeps at most five per wallet", async () => {
        const { relayer, store } = await setup();
        expect(await register(relayer, alice, T("a"))).to.equal("registered");
        expect(store.devicesOf(alice.address.toLowerCase())).to.have.length(1);
        const tokens = "bcdefg".split("");
        let t = 1_800_000_000;
        for (const c of tokens) await register(relayer, alice, T(c), {}, t++);
        const left = store.devicesOf(alice.address.toLowerCase()).map((d) => d.token);
        expect(left).to.have.length(MAX_DEVICES_PER_ADDRESS);
        expect(left).to.not.include(T("a"));
    });

    it("refuses a signature from another wallet, an old one, and bad fields", async () => {
        const { relayer } = await setup();
        const f = {
            action: "register",
            address: alice.address,
            token: T("a"),
            lang: "ko",
            platform: "ios",
            issuedAt: 1_800_000_000,
        } as const;
        const wrongSigner = await sign(bob, deviceMessage(f));
        await relayer.device({ ...f, signature: wrongSigner }).then(
            () => expect.fail("should refuse"),
            (e) => expect((e as RelayRejected).status).to.equal(401)
        );
        await register(relayer, alice, T("a"), { issuedAt: 1_800_000_000 - 301 }).then(
            () => expect.fail(),
            (e) => expect(e.message).to.contain("too old")
        );
        // A signature for a different token does not carry over to another one.
        const sig = await sign(alice, deviceMessage(f));
        await relayer.device({ ...f, token: T("z"), signature: sig }).then(
            () => expect.fail(),
            (e) => expect((e as RelayRejected).status).to.equal(401)
        );
        for (const bad of [
            { token: "nope" },
            { lang: "fr" },
            { platform: "web" },
            { action: "delete" },
            { address: "0x123" },
        ]) {
            await relayer.device({ ...f, signature: sig, ...bad }).then(
                () => expect.fail(JSON.stringify(bad)),
                (e) => expect(e).to.be.instanceOf(RelayRejected)
            );
        }
    });

    it("moves a token to the wallet that registers it last, and removes a phone", async () => {
        const { relayer, store } = await setup();
        await register(relayer, alice, T("a"));
        await register(relayer, bob, T("a"));
        expect(store.devicesOf(alice.address.toLowerCase())).to.have.length(0);
        expect(store.devicesOf(bob.address.toLowerCase())).to.have.length(1);
        expect(await register(relayer, bob, T("a"), { action: "unregister" })).to.equal("unregistered");
        expect(store.devicesOf(bob.address.toLowerCase())).to.have.length(0);
    });
});

describe("sending push for a service", () => {
    const input = (over: Record<string, unknown> = {}) => ({
        to: [alice.address],
        title: { en: "New applicant", ko: "새 지원자" },
        body: { en: "Open the errand.", ko: "심부름을 확인하세요." },
        path: "/errand/7",
        ...over,
    });

    it("rejects a bad key", async () => {
        const { relayer } = await setup();
        expect(() => relayer.authenticate("wrong")).to.throw("not valid");
        expect(relayer.authenticate(WAYHAND_KEY).id).to.equal("wayhand");
    });

    it("sends in the device's language, as the service's own app, with the Expo key", async () => {
        const { relayer, expo } = await setup();
        await register(relayer, alice, T("a"), { lang: "ko" });
        await register(relayer, alice, T("b"), { lang: "en" });
        const out = await relayer.push(wayhand, input({ payload: { id: 7 } }));
        expect(out).to.deep.equal({ accepted: 1, noDevice: 0, muted: 0, limited: 0, failed: 0 });
        const sent = expo.sent[0];
        expect(sent).to.have.length(2);
        const ko = sent.find((m) => m.to === T("a"));
        const en = sent.find((m) => m.to === T("b"));
        expect(ko.title).to.equal("새 지원자");
        expect(en.title).to.equal("New applicant");
        expect(ko.data).to.deep.equal({ app: "wayhand", path: "/errand/7", payload: { id: 7 } });
    });

    it("cannot name another app: the service's app always wins", async () => {
        const { relayer, expo } = await setup();
        await register(relayer, alice, T("a"));
        await relayer.push(other, input({ app: "wayhand" }));
        expect(expo.sent[0][0].data.app).to.equal("other-app");
    });

    it("counts wallets without a phone, muted wallets and the daily limit, and shows counts only", async () => {
        const { relayer, expo } = await setup();
        await register(relayer, alice, T("a"));
        const none = await relayer.push(wayhand, input({ to: [bob.address] }));
        expect(none.noDevice).to.equal(1);
        // mute
        const m = { address: alice.address, app: "wayhand", muted: true, issuedAt: 1_800_000_000 };
        await relayer.mute({ ...m, signature: await sign(alice, muteMessage(m)) });
        expect((await relayer.push(wayhand, input())).muted).to.equal(1);
        expect(expo.sent).to.have.length(0);
        const u = { ...m, muted: false };
        await relayer.mute({ ...u, signature: await sign(alice, muteMessage(u)) });
        // a mute for one app does not stop another
        expect((await relayer.push(wayhand, input())).accepted).to.equal(1);
        expect((await relayer.push(wayhand, input())).accepted).to.equal(1);
        expect((await relayer.push(wayhand, input())).limited).to.equal(1);
        expect(expo.sent).to.have.length(2);
    });

    it("forgets a phone the push service says is gone and counts it as failed", async () => {
        const { relayer, expo, store } = await setup();
        await register(relayer, alice, T("a"));
        expo.replies.push([{ status: "error", message: "gone", details: { error: "DeviceNotRegistered" } }]);
        const out = await relayer.push(wayhand, input());
        expect(out).to.deep.include({ accepted: 0, failed: 1 });
        expect(store.devicesOf(alice.address.toLowerCase())).to.have.length(0);
    });

    it("sends nothing for a bad request", async () => {
        const { relayer, expo } = await setup();
        await register(relayer, alice, T("a"));
        for (const bad of [
            input({ to: [] }),
            input({ to: ["0x123"] }),
            input({ to: Array.from({ length: 101 }, () => alice.address) }),
            input({ path: "//evil.com" }),
            input({ path: "https://evil.com" }),
            input({ title: "" }),
            input({ body: { de: "" } }),
            input({ title: "x".repeat(101) }),
            {},
        ]) {
            await relayer.push(wayhand, bad).then(
                () => expect.fail(JSON.stringify(bad).slice(0, 60)),
                (e) => expect(e).to.be.instanceOf(RelayRejected)
            );
        }
        expect(expo.sent).to.have.length(0);
    });

    it("stops a service at its request limit", async () => {
        const { relayer } = await setup();
        const limited = { ...wayhand, maxRequestsPerMinute: 2 };
        const r = new MessageRelayer({
            store: await Store.open(":memory:"),
            services: [limited],
            now: () => 1_800_000_000,
        });
        await r.push(limited, input({ to: [bob.address] }));
        await r.push(limited, input({ to: [bob.address] }));
        await r.push(limited, input({ to: [bob.address] })).then(
            () => expect.fail(),
            (e) => expect((e as RelayRejected).status).to.equal(429)
        );
        void relayer;
    });

    it("says 503 when the push service cannot be reached", async () => {
        const { relayer, expo } = await setup();
        await register(relayer, alice, T("a"));
        expo.down = true;
        await relayer.push(wayhand, input()).then(
            () => expect.fail(),
            (e) => expect(e).to.be.instanceOf(RelayUnavailable)
        );
    });

    it("picks the right language text", () => {
        expect(textFor("plain", "ja")).to.equal("plain");
        expect(textFor({ en: "E", ko: "K" }, "ko")).to.equal("K");
        expect(textFor({ en: "E", ko: "K" }, "zh")).to.equal("E");
        expect(textFor({ ko: "K" }, "ja")).to.equal("K");
    });
});

describe("receipts", () => {
    it("forgets phones whose receipt says they are gone, and keeps the rest", async () => {
        const { relayer, expo, store, now } = await setup();
        await register(relayer, alice, T("a"));
        await register(relayer, bob, T("b"));
        await relayer.push(wayhand, { to: [alice.address, bob.address], title: "t", body: "b" });
        now.t += 20 * 60;
        const ids = expo.sent[0].map((_: unknown, i: number) => `tk-1-${i}`);
        expo.receipts = {
            [ids[0]]: { status: "error", details: { error: "DeviceNotRegistered" } },
            [ids[1]]: { status: "ok" },
        };
        const out = await relayer.sweepReceipts();
        expect(out).to.deep.equal({ checked: 2, delivered: 1, failed: 1, forgotten: 1 });
        expect(store.deviceCount()).to.equal(1);
        expect((await relayer.sweepReceipts()).checked).to.equal(0);
    });

    it("leaves a push alone until a receipt can exist", async () => {
        const { relayer } = await setup();
        await register(relayer, alice, T("a"));
        await relayer.push(wayhand, { to: [alice.address], title: "t", body: "b" });
        expect((await relayer.sweepReceipts()).checked).to.equal(0);
    });
});

describe("http", () => {
    async function serve() {
        const env = await setup();
        const server = createMessageRelayerServer(env.relayer, env.store, { publicPerMinute: 3, now: () => env.now.t });
        await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
        const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        return { ...env, base, close: () => new Promise((r) => server.close(r)) };
    }
    const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
        fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json", ...headers },
            body: typeof body === "string" ? body : JSON.stringify(body),
        });

    it("answers 401 without a key, 400 for bad JSON, 413 for a huge body, 404 elsewhere", async () => {
        const s = await serve();
        expect((await post(`${s.base}/v1/push`, {})).status).to.equal(401);
        expect((await post(`${s.base}/v1/push`, "{nope", { authorization: `Bearer ${WAYHAND_KEY}` })).status).to.equal(
            400
        );
        expect(
            (await post(`${s.base}/v1/push`, "x".repeat(20_000), { authorization: `Bearer ${WAYHAND_KEY}` })).status
        ).to.equal(413);
        expect((await fetch(`${s.base}/nothing`)).status).to.equal(404);
        await s.close();
    });

    it("registers a phone and pushes to it, answering counts only", async () => {
        const s = await serve();
        const f = {
            action: "register",
            address: alice.address,
            token: T("a"),
            lang: "en",
            platform: "android",
            issuedAt: s.now.t,
        } as const;
        const reg = await post(`${s.base}/v1/devices`, { ...f, signature: await sign(alice, deviceMessage(f)) });
        expect(reg.status).to.equal(200);
        const res = await post(
            `${s.base}/v1/push`,
            { to: [alice.address, bob.address], title: "Hi", body: "There" },
            { authorization: `Bearer ${WAYHAND_KEY}` }
        );
        expect(await res.json()).to.deep.equal({ accepted: 1, noDevice: 1, muted: 0, limited: 0, failed: 0 });
        const metrics = await (await fetch(`${s.base}/metrics`)).text();
        expect(metrics).to.contain('opus_message_relayer_pushes_total{service="wayhand",outcome="accepted"} 1');
        expect(metrics).to.contain("opus_message_relayer_devices 1");
        expect(metrics).to.not.contain(WAYHAND_KEY).and.not.contain("expo-secret");
        expect((await (await fetch(`${s.base}/health`)).json()).ok).to.equal(true);
        await s.close();
    });

    it("rate-limits the public calls and hides internal errors", async () => {
        const s = await serve();
        const statuses: number[] = [];
        for (let i = 0; i < 5; i++) statuses.push((await post(`${s.base}/v1/devices`, { nothing: true })).status);
        expect(statuses).to.deep.equal([400, 400, 400, 429, 429]);
        await s.close();
    });
});

describe("language lookup for a service", () => {
    it("answers each wallet's registered language, null when none or muted", async () => {
        const { relayer, now } = await setup();
        await register(relayer, alice, T("a"), { lang: "ko" }, now.t);
        await register(relayer, alice, T("b"), { lang: "ja" }, now.t + 5);
        const out = relayer.languages(wayhand, { to: [alice.address, bob.address] });
        // the phone registered last decides
        expect(out).to.deep.equal({ [alice.address.toLowerCase()]: "ja", [bob.address.toLowerCase()]: null });
        const m = { address: alice.address, app: "wayhand", muted: true, issuedAt: now.t };
        await relayer.mute({ ...m, signature: await sign(alice, muteMessage(m)) });
        expect(relayer.languages(wayhand, { to: [alice.address] })[alice.address.toLowerCase()]).to.equal(null);
        // the mute is for wayhand only
        expect(relayer.languages(other, { to: [alice.address] })[alice.address.toLowerCase()]).to.equal("ja");
    });

    it("refuses bad addresses, empty and oversized lists, and spends the service's request limit", async () => {
        const { relayer } = await setup();
        for (const bad of [{ to: [] }, { to: ["0x1"] }, { to: Array.from({ length: 101 }, () => alice.address) }, {}]) {
            expect(() => relayer.languages(wayhand, bad)).to.throw(RelayRejected);
        }
        const limited = { ...wayhand, maxRequestsPerMinute: 1 };
        const r = new MessageRelayer({ store: await Store.open(":memory:"), services: [limited], now: () => 1 });
        r.languages(limited, { to: [alice.address] });
        expect(() => r.languages(limited, { to: [alice.address] })).to.throw("rate limit");
    });

    it("needs a service key over http", async () => {
        const env = await setup();
        const server = createMessageRelayerServer(env.relayer, env.store, { now: () => env.now.t });
        await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
        const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        const call = (headers: Record<string, string>) =>
            fetch(`${base}/v1/languages`, {
                method: "POST",
                headers: { "content-type": "application/json", ...headers },
                body: JSON.stringify({ to: [alice.address] }),
            });
        expect((await call({})).status).to.equal(401);
        await register(env.relayer, alice, T("a"), { lang: "zh" }, env.now.t);
        const ok = await call({ authorization: `Bearer ${WAYHAND_KEY}` });
        expect(await ok.json()).to.deep.equal({ languages: { [alice.address.toLowerCase()]: "zh" } });
        await new Promise((r) => server.close(r));
    });
});

import { MessageRelayerClient, registerDevice } from "@opus/sdk";

describe("end to end with the SDK", () => {
    it("a wallet registers its language, the service looks it up and sends in that language", async () => {
        const env = await setup();
        const server = createMessageRelayerServer(env.relayer, env.store, { now: () => env.now.t });
        await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
        const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        try {
            await registerDevice({
                url,
                signer: alice,
                token: T("a"),
                lang: "ja",
                platform: "ios",
                now: () => env.now.t,
            });
            await registerDevice({
                url,
                signer: bob,
                token: T("b"),
                lang: "ko",
                platform: "android",
                now: () => env.now.t,
            });
            const client = new MessageRelayerClient({ url, key: WAYHAND_KEY });
            const langs = await client.languages([alice.address, bob.address, "0x" + "9".repeat(40)]);
            expect(langs[alice.address.toLowerCase()]).to.equal("ja");
            expect(langs[bob.address.toLowerCase()]).to.equal("ko");
            const out = await client.pushLocalized({
                to: [alice.address, bob.address, "0x" + "9".repeat(40)],
                message: (lang) => ({ title: lang === "ja" ? "新しい応募" : "새 지원자", body: "…" }),
                path: "/errand/3",
            });
            expect(out).to.deep.equal({ accepted: 2, noDevice: 0, muted: 0, limited: 0, failed: 0, noLanguage: 1 });
            const titles = env.expo.sent
                .flat()
                .map((m: { title: string }) => m.title)
                .sort();
            expect(titles).to.deep.equal(["새 지원자", "新しい応募"].sort());
            // a wrong key is refused by the relayer
            await new MessageRelayerClient({ url, key: "wrong" }).languages([alice.address]).then(
                () => expect.fail("should refuse"),
                (e) => expect(e.status).to.equal(401)
            );
        } finally {
            await new Promise((r) => server.close(r));
        }
    });
});
