import {
    PUSH_LANGS,
    PUSH_PLATFORMS,
    PushError,
    buildPushMessage,
    deviceMessage,
    getPushReceipts,
    isExpoPushToken,
    muteMessage,
    sendPush,
    type LocalText,
    type PushClientOptions,
    type PushLang,
    type PushMessage,
    type PushPlatform,
    type PushSummary,
} from "@opus/sdk";
import { isAddress, recoverMessageAddress } from "viem";

import { serviceForKey, SlidingCounter, type Service } from "./services";
import type { Store } from "./store";

/** The request is refused. `status` is the HTTP code; the message is safe to show the caller. */
export class RelayRejected extends Error {
    constructor(message: string, readonly status = 400) {
        super(message);
    }
}

/** The push service cannot be reached right now. Not the caller's fault. */
export class RelayUnavailable extends Error {}

/** How long a signed request stays valid, seconds. */
export const SIGNATURE_WINDOW_SECONDS = 300;
export const MAX_RECIPIENTS = 100;
/** Expo receipts are ready about 15 minutes after sending and kept for a day. */
export const RECEIPT_AFTER_SECONDS = 15 * 60;
export const RECEIPT_KEEP_SECONDS = 24 * 60 * 60;

export type RelayerOptions = {
    store: Store;
    services: readonly Service[];
    /** Expo access key and fetch. The key lives only in this process. */
    expo?: PushClientOptions;
    /** Seconds. */
    now?: () => number;
    /** Phones not active for this many seconds are deleted by `purge()`. Default 365 days. */
    retentionSeconds?: number;
    log?: (entry: Record<string, unknown>) => void;
};

/** How long a phone is kept without any activity (a registration or an accepted push). */
export const DEFAULT_RETENTION_SECONDS = 365 * 24 * 60 * 60;

export type Stats = {
    registrations: number;
    devicesForgotten: number;
    devicesPurged: number;
    pushes: Map<string, Record<"accepted" | "noDevice" | "muted" | "limited" | "failed", number>>;
};

const ID = /^[a-z0-9][a-z0-9-]{0,31}$/;
const SIGNATURE = /^0x[0-9a-fA-F]{130}$/;

function object(value: unknown, what: string): Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value))
        throw new RelayRejected(`The ${what} is missing`);
    return value as Record<string, unknown>;
}

function address(value: unknown): string {
    if (typeof value !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value) || !isAddress(value, { strict: false })) {
        throw new RelayRejected("The address is not valid");
    }
    return value.toLowerCase();
}

/** The text of a message in the language of the device: its own, else English, else the first one given. */
export function textFor(text: LocalText, lang: PushLang): string {
    if (typeof text === "string") return text;
    const first = Object.values(text).find((v) => typeof v === "string" && v.trim() !== "");
    return text[lang] ?? text.en ?? first ?? "";
}

/**
 * Holds the Expo access key and the link from wallet addresses to phones. A service names a wallet address and
 * a text; the relayer finds the phones, applies the limits and the wallet's mutes, and sends.
 */
export class MessageRelayer {
    readonly stats: Stats = { registrations: 0, devicesForgotten: 0, devicesPurged: 0, pushes: new Map() };
    private readonly retentionSeconds: number;
    private readonly now: () => number;
    private readonly byService = new Map<string, SlidingCounter>();
    private readonly byWallet = new Map<string, SlidingCounter>();
    private readonly log: (entry: Record<string, unknown>) => void;
    private readonly store: Store;
    private readonly services: readonly Service[];
    private readonly expo: PushClientOptions;

    constructor(options: RelayerOptions) {
        this.store = options.store;
        this.services = options.services;
        this.expo = options.expo ?? {};
        this.now = options.now ?? (() => Math.floor(Date.now() / 1000));
        this.log = options.log ?? (() => undefined);
        this.retentionSeconds = options.retentionSeconds ?? DEFAULT_RETENTION_SECONDS;
        for (const s of options.services) {
            this.byService.set(s.id, new SlidingCounter(s.maxRequestsPerMinute, 60, this.now));
            this.byWallet.set(s.id, new SlidingCounter(s.perWalletPerDay, 24 * 60 * 60, this.now));
            this.stats.pushes.set(s.id, { accepted: 0, noDevice: 0, muted: 0, limited: 0, failed: 0 });
        }
    }

    /** The service a bearer key belongs to; throws 401 when there is none. */
    authenticate(bearer: string): Service {
        const service = serviceForKey(this.services, bearer);
        if (service === undefined) throw new RelayRejected("The service key is not valid", 401);
        return service;
    }

    private async checkSigned(message: string, who: string, signature: unknown, issuedAt: unknown): Promise<void> {
        if (typeof issuedAt !== "number" || !Number.isInteger(issuedAt))
            throw new RelayRejected("issuedAt must be whole seconds");
        if (Math.abs(this.now() - issuedAt) > SIGNATURE_WINDOW_SECONDS)
            throw new RelayRejected("The signed request is too old or too new");
        if (typeof signature !== "string" || !SIGNATURE.test(signature))
            throw new RelayRejected("The signature is not valid");
        let signer: string;
        try {
            signer = (await recoverMessageAddress({ message, signature: signature as `0x${string}` })).toLowerCase();
        } catch {
            throw new RelayRejected("The signature is not valid");
        }
        if (signer !== who) throw new RelayRejected("The signature is not from this wallet", 401);
    }

    /** A wallet registers (or removes) one of its phones. The wallet proves it owns the address by signing. */
    async device(
        input: unknown
    ): Promise<{ result: "registered" | "unregistered" | "status"; registered?: boolean; lang?: PushLang }> {
        const body = object(input, "request");
        const who = address(body.address);
        const action = body.action;
        if (action !== "register" && action !== "unregister" && action !== "status") {
            throw new RelayRejected("The action must be register, unregister or status");
        }
        const token = body.token;
        if (!isExpoPushToken(token)) throw new RelayRejected("The device token is not an Expo push token");
        if (!(PUSH_LANGS as readonly unknown[]).includes(body.lang))
            throw new RelayRejected("The language is not supported");
        if (!(PUSH_PLATFORMS as readonly unknown[]).includes(body.platform))
            throw new RelayRejected("The platform must be ios or android");
        const lang = body.lang as PushLang;
        const platform = body.platform as PushPlatform;
        const issuedAt = body.issuedAt;
        await this.checkSigned(
            deviceMessage({ action, address: who, token, lang, platform, issuedAt: issuedAt as number }),
            who,
            body.signature,
            issuedAt
        );
        if (action === "register") {
            this.store.register({ address: who, token, lang, platform, registeredAt: this.now() });
            this.stats.registrations += 1;
            return { result: "registered" };
        }
        if (action === "status") {
            // The app asks after it starts: is this phone registered for this wallet? A yes also counts as activity.
            const found = this.store.findDevice(who, token);
            if (found !== undefined) this.store.touch(who, token, this.now());
            return found === undefined
                ? { result: "status", registered: false }
                : { result: "status", registered: true, lang: found.lang as PushLang };
        }
        this.store.unregister(who, token);
        return { result: "unregistered" };
    }

    /** A wallet mutes or unmutes one service (mini-app). */
    async mute(input: unknown): Promise<void> {
        const body = object(input, "request");
        const who = address(body.address);
        if (typeof body.app !== "string" || !ID.test(body.app)) throw new RelayRejected("The app id is not valid");
        if (typeof body.muted !== "boolean") throw new RelayRejected("muted must be true or false");
        await this.checkSigned(
            muteMessage({ address: who, app: body.app, muted: body.muted, issuedAt: body.issuedAt as number }),
            who,
            body.signature,
            body.issuedAt
        );
        this.store.setMute(who, body.app, body.muted);
    }

    /**
     * A service sends a push to wallet addresses. Everything is checked before anything is sent, so a bad request
     * sends nothing. The answer is counts only: the service does not learn which address has a phone.
     */
    async push(service: Service, input: unknown): Promise<PushSummary> {
        const body = object(input, "request");
        if (!this.byService.get(service.id)!.hit("all"))
            throw new RelayRejected("The service rate limit is spent", 429);
        const to = body.to;
        if (!Array.isArray(to) || to.length === 0 || to.length > MAX_RECIPIENTS) {
            throw new RelayRejected(`to must list 1 to ${MAX_RECIPIENTS} wallet addresses`);
        }
        const wallets = [...new Set(to.map(address))];
        const title = body.title as LocalText;
        const text = body.body as LocalText;
        for (const field of [title, text]) {
            const ok =
                typeof field === "string" ||
                (typeof field === "object" &&
                    field !== null &&
                    Object.values(field).some((v) => typeof v === "string" && v.trim() !== ""));
            if (!ok) throw new RelayRejected("title and body must be a text or a text per language");
        }
        const route = { app: service.app, path: body.path as string | undefined, payload: body.payload };
        const priority = body.priority as "default" | "normal" | "high" | undefined;
        // Check every language's text once, with a placeholder token, so a bad request fails before any send.
        for (const lang of PUSH_LANGS) {
            try {
                buildPushMessage({
                    to: "ExponentPushToken[check]",
                    title: textFor(title, lang),
                    body: textFor(text, lang),
                    route,
                    priority,
                });
            } catch (error) {
                throw new RelayRejected(error instanceof PushError ? error.message : "The push is not valid");
            }
        }

        const summary: PushSummary = { accepted: 0, noDevice: 0, muted: 0, limited: 0, failed: 0 };
        const messages: PushMessage[] = [];
        const owner = new Map<string, string>();
        for (const who of wallets) {
            const devices = this.store.devicesOf(who);
            if (devices.length === 0) summary.noDevice += 1;
            else if (this.store.isMuted(who, service.app)) summary.muted += 1;
            else if (!this.byWallet.get(service.id)!.hit(who)) summary.limited += 1;
            else {
                for (const d of devices) {
                    messages.push(
                        buildPushMessage({
                            to: d.token,
                            title: textFor(title, d.lang as PushLang),
                            body: textFor(text, d.lang as PushLang),
                            route,
                            priority,
                        })
                    );
                    owner.set(d.token, who);
                }
            }
        }

        if (messages.length > 0) {
            let results;
            try {
                results = await sendPush(messages, this.expo);
            } catch (error) {
                this.log({ event: "push-unavailable", service: service.id, reason: String(error) });
                throw new RelayUnavailable("The push service is not reachable");
            }
            const now = this.now();
            const delivered = new Set<string>();
            const failedWallets = new Set<string>();
            const tickets: { id: string; token: string; at: number }[] = [];
            for (const r of results) {
                const who = owner.get(r.to)!;
                if (r.ok) {
                    delivered.add(who);
                    tickets.push({ id: r.ticketId, token: r.to, at: now });
                } else {
                    failedWallets.add(who);
                    if (r.invalidToken) {
                        this.store.forget(r.to);
                        this.stats.devicesForgotten += 1;
                    }
                }
            }
            this.store.addTickets(tickets);
            this.store.markPushed(
                tickets.map((t) => t.token),
                now
            );
            summary.accepted = delivered.size;
            summary.failed = [...failedWallets].filter((w) => !delivered.has(w)).length;
        }

        const counts = this.stats.pushes.get(service.id)!;
        for (const k of Object.keys(summary) as (keyof PushSummary)[]) counts[k] += summary[k];
        this.log({ event: "push", service: service.id, ...summary });
        return summary;
    }

    /**
     * A service asks which language each wallet registered, so it can write the message in that language.
     * A wallet with no phone, or one that muted this service, answers null. The latest phone's language wins.
     * It counts against the service's request limit.
     */
    languages(service: Service, input: unknown): Record<string, PushLang | null> {
        const body = object(input, "request");
        if (!this.byService.get(service.id)!.hit("all"))
            throw new RelayRejected("The service rate limit is spent", 429);
        const to = body.to;
        if (!Array.isArray(to) || to.length === 0 || to.length > MAX_RECIPIENTS) {
            throw new RelayRejected(`to must list 1 to ${MAX_RECIPIENTS} wallet addresses`);
        }
        const out: Record<string, PushLang | null> = {};
        for (const who of new Set(to.map(address))) {
            const lang = this.store.isMuted(who, service.app) ? null : this.store.languageOf(who);
            out[who] = (PUSH_LANGS as readonly string[]).includes(lang ?? "") ? (lang as PushLang) : null;
        }
        return out;
    }

    /**
     * The retention rule: deletes phones with no activity (no registration and no accepted push) for the
     * retention period, and the mutes of wallets left without a phone. Run it once a day.
     */
    purge(): number {
        const count = this.store.purgeInactive(this.now() - this.retentionSeconds);
        this.stats.devicesPurged += count;
        if (count > 0) this.log({ event: "purged", devices: count });
        return count;
    }

    /** Asks Expo what became of the pushes sent 15 minutes to a day ago and forgets phones that are gone. */
    async sweepReceipts(): Promise<{ checked: number; delivered: number; failed: number; forgotten: number }> {
        const now = this.now();
        this.store.expireTickets(now - RECEIPT_KEEP_SECONDS);
        const tickets = this.store.ticketsBetween(now - RECEIPT_KEEP_SECONDS, now - RECEIPT_AFTER_SECONDS);
        if (tickets.length === 0) return { checked: 0, delivered: 0, failed: 0, forgotten: 0 };
        const receipts = await getPushReceipts(
            tickets.map((t) => t.id),
            this.expo
        );
        const tokenOf = new Map(tickets.map((t) => [t.id, t.token]));
        let forgotten = 0;
        for (const f of receipts.failed) {
            if (f.error === "DeviceNotRegistered") {
                this.store.forget(tokenOf.get(f.ticketId)!);
                forgotten += 1;
            }
        }
        this.stats.devicesForgotten += forgotten;
        this.store.removeTickets([...receipts.delivered, ...receipts.failed.map((f) => f.ticketId)]);
        return {
            checked: tickets.length,
            delivered: receipts.delivered.length,
            failed: receipts.failed.length,
            forgotten,
        };
    }
}
