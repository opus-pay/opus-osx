import { expect } from "chai";

import {
    buildPushMessage,
    chunkMessages,
    getPushReceipts,
    isExpoPushToken,
    isInsidePath,
    MAX_PUSH_DATA_BYTES,
    pushToDevices,
    sendPush,
} from "../src";
import type { PushMessage } from "../src";

const T1 = "ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]";
const T2 = "ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]";
const base = { to: T1, title: "Proof submitted", body: "Open the errand to review it.", route: { app: "wayhand" } };

type Call = { url: string; body: any; headers: Record<string, string> };

/** A fake service: answers with the given replies in turn and records each call. */
function fakeService(replies: { status?: number; json?: unknown }[]) {
    const calls: Call[] = [];
    const fetchFn = (async (url: string, init: { body: string; headers: Record<string, string> }) => {
        calls.push({ url, body: JSON.parse(init.body), headers: init.headers });
        const reply = replies[Math.min(calls.length - 1, replies.length - 1)];
        const status = reply.status ?? 200;
        return { ok: status >= 200 && status < 300, status, json: async () => reply.json } as unknown as Response;
    }) as unknown as typeof fetch;
    return { calls, fetchFn };
}

const noSleep = async () => undefined;

describe("push messages", () => {
    it("accepts Expo push tokens only", () => {
        expect(isExpoPushToken(T1)).to.equal(true);
        expect(isExpoPushToken("ExpoPushToken[xyz]")).to.equal(true);
        for (const bad of ["", "abc", "ExponentPushToken[]", "ExponentPushToken[a b]", 5, null]) {
            expect(isExpoPushToken(bad), String(bad)).to.equal(false);
        }
    });

    it("builds the route into data and fills defaults", () => {
        const m = buildPushMessage({ ...base, route: { app: "wayhand", path: "/errand/12", payload: { id: 12 } } });
        expect(m.data).to.deep.equal({ app: "wayhand", path: "/errand/12", payload: { id: 12 } });
        expect(m).to.include({ sound: "default", priority: "high", ttl: 86_400, channelId: "default" });
        expect(buildPushMessage(base).data).to.deep.equal({ app: "wayhand" });
    });

    it("keeps the path inside the mini-app", () => {
        for (const ok of ["/", "/errand/1", "/a?b=1"]) expect(isInsidePath(ok), ok).to.equal(true);
        for (const bad of ["errand", "//evil.com/x", "https://evil.com", "/\\evil", "/a\nb", "/x://y"]) {
            expect(isInsidePath(bad), bad).to.equal(false);
            expect(() => buildPushMessage({ ...base, route: { app: "wayhand", path: bad } })).to.throw(
                "inside the mini-app"
            );
        }
    });

    it("refuses a bad token, id, text, size and ttl", () => {
        expect(() => buildPushMessage({ ...base, to: "nope" })).to.throw("Expo push token");
        for (const app of ["", "Way Hand", "WAYHAND", "-x", "a".repeat(33)]) {
            expect(() => buildPushMessage({ ...base, route: { app } }), app).to.throw("mini-app id");
        }
        expect(() => buildPushMessage({ ...base, title: "  " })).to.throw("title");
        expect(() => buildPushMessage({ ...base, body: "x".repeat(401) })).to.throw("body");
        expect(() =>
            buildPushMessage({ ...base, route: { app: "wayhand", payload: "x".repeat(MAX_PUSH_DATA_BYTES) } })
        ).to.throw("larger than");
        expect(() => buildPushMessage({ ...base, ttlSeconds: -1 })).to.throw("ttlSeconds");
        const loop: Record<string, unknown> = {};
        loop.self = loop;
        expect(() => buildPushMessage({ ...base, route: { app: "wayhand", payload: loop } })).to.throw("JSON");
        expect(() => buildPushMessage({ ...base, route: { app: "wayhand", payload: () => 1 } })).to.throw("JSON");
    });

    it("splits into batches of at most 100", () => {
        const sizes = chunkMessages(Array.from({ length: 250 }, (_, i) => i)).map((c) => c.length);
        expect(sizes).to.deep.equal([100, 100, 50]);
        expect(() => chunkMessages([1], 0)).to.throw("at least 1");
    });
});

describe("sending push", () => {
    const msg = (to: string): PushMessage => buildPushMessage({ ...base, to });

    it("reports each message in order and flags a dead token", async () => {
        const { calls, fetchFn } = fakeService([
            {
                json: {
                    data: [
                        { status: "ok", id: "t-1" },
                        { status: "error", message: "gone", details: { error: "DeviceNotRegistered" } },
                    ],
                },
            },
        ]);
        const out = await sendPush([msg(T1), msg(T2)], { fetch: fetchFn, accessToken: "secret" });
        expect(out[0]).to.deep.equal({ to: T1, ok: true, ticketId: "t-1" });
        expect(out[1]).to.include({ to: T2, ok: false, error: "DeviceNotRegistered", invalidToken: true });
        expect(calls).to.have.length(1);
        expect(calls[0].url).to.equal("https://exp.host/--/api/v2/push/send");
        expect(calls[0].headers.authorization).to.equal("Bearer secret");
    });

    it("sends more than 100 messages in several requests", async () => {
        const reply = (n: number) => ({
            json: { data: Array.from({ length: n }, (_, i) => ({ status: "ok", id: `t${i}` })) },
        });
        const { calls, fetchFn } = fakeService([reply(100), reply(20)]);
        const out = await sendPush(
            Array.from({ length: 120 }, () => msg(T1)),
            { fetch: fetchFn }
        );
        expect(out).to.have.length(120);
        expect(calls.map((c) => c.body.length)).to.deep.equal([100, 20]);
    });

    it("sends no token header when none is given", async () => {
        const { calls, fetchFn } = fakeService([{ json: { data: [{ status: "ok", id: "x" }] } }]);
        await sendPush([msg(T1)], { fetch: fetchFn });
        expect(calls[0].headers).to.not.have.property("authorization");
    });

    it("retries a 429 or 5xx answer, then gives up", async () => {
        const ok = { json: { data: [{ status: "ok", id: "x" }] } };
        const a = fakeService([{ status: 429 }, { status: 503 }, ok]);
        expect(await sendPush([msg(T1)], { fetch: a.fetchFn, sleep: noSleep })).to.have.length(1);
        expect(a.calls).to.have.length(3);
        const b = fakeService([{ status: 500 }]);
        let message = "";
        try {
            await sendPush([msg(T1)], { fetch: b.fetchFn, sleep: noSleep, retries: 2 });
        } catch (error) {
            message = (error as Error).message;
        }
        expect(message).to.contain("500");
        expect(b.calls).to.have.length(3);
    });

    it("does not retry a refused request, and reports a whole-batch error", async () => {
        const a = fakeService([{ status: 400, json: {} }]);
        try {
            await sendPush([msg(T1)], { fetch: a.fetchFn, sleep: noSleep });
            expect.fail("should throw");
        } catch (error) {
            expect((error as Error).message).to.contain("400");
        }
        expect(a.calls).to.have.length(1);
        const b = fakeService([{ json: { errors: [{ message: "PUSH_TOO_MANY_EXPERIENCE_IDS" }] } }]);
        try {
            await sendPush([msg(T1)], { fetch: b.fetchFn });
            expect.fail("should throw");
        } catch (error) {
            expect((error as Error).message).to.contain("PUSH_TOO_MANY_EXPERIENCE_IDS");
        }
    });

    it("retries when the network fails, then says it could not be reached", async () => {
        let calls = 0;
        const failing = (async () => {
            calls += 1;
            throw new Error("offline");
        }) as unknown as typeof fetch;
        try {
            await sendPush([msg(T1)], { fetch: failing, sleep: noSleep, retries: 1 });
            expect.fail("should throw");
        } catch (error) {
            expect((error as Error).message).to.contain("could not be reached");
        }
        expect(calls).to.equal(2);
    });

    it("pushes to several devices once each and returns the tokens to forget", async () => {
        const { calls, fetchFn } = fakeService([
            {
                json: {
                    data: [
                        { status: "ok", id: "a" },
                        { status: "error", details: { error: "DeviceNotRegistered" } },
                    ],
                },
            },
        ]);
        const { results, invalidTokens } = await pushToDevices(
            [T1, T2, T1],
            { title: "Hi", body: "There", route: { app: "wayhand" } },
            { fetch: fetchFn }
        );
        expect(calls[0].body).to.have.length(2);
        expect(results).to.have.length(2);
        expect(invalidTokens).to.deep.equal([T2]);
    });
});

describe("push receipts", () => {
    it("sorts tickets into delivered, failed and pending", async () => {
        const { calls, fetchFn } = fakeService([
            {
                json: {
                    data: {
                        a: { status: "ok" },
                        b: { status: "error", message: "bad", details: { error: "DeviceNotRegistered" } },
                    },
                },
            },
        ]);
        const out = await getPushReceipts(["a", "b", "c"], { fetch: fetchFn });
        expect(out.delivered).to.deep.equal(["a"]);
        expect(out.failed).to.deep.equal([{ ticketId: "b", error: "DeviceNotRegistered", message: "bad" }]);
        expect(out.pending).to.deep.equal(["c"]);
        expect(calls[0].url).to.equal("https://exp.host/--/api/v2/push/getReceipts");
        expect(calls[0].body).to.deep.equal({ ids: ["a", "b", "c"] });
    });
});
