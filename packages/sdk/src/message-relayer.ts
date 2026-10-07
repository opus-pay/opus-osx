/**
 * Shared pieces of the OPUS message relayer: what a wallet signs to register a phone, and a small client for a
 * service that wants to send a push. The relayer keeps the Expo access key and the link from a wallet address
 * to its devices; a service only ever names an address.
 */

export const PUSH_LANGS = ["en", "ko", "ja", "zh"] as const;
export type PushLang = (typeof PUSH_LANGS)[number];
export const PUSH_PLATFORMS = ["ios", "android"] as const;
export type PushPlatform = (typeof PUSH_PLATFORMS)[number];

/** A text in one language, or one text per language (the relayer picks the language the device registered). */
export type LocalText = string | Partial<Record<PushLang, string>>;

export type DeviceMessageFields = {
    action: "register" | "unregister";
    address: string;
    token: string;
    lang: PushLang;
    platform: PushPlatform;
    /** Seconds since the epoch. The relayer accepts it for five minutes. */
    issuedAt: number;
};

export type MuteMessageFields = {
    address: string;
    /** The mini-app id whose pushes the wallet wants to stop (or start again). */
    app: string;
    muted: boolean;
    issuedAt: number;
};

/** The text a wallet signs (EIP-191 `personal_sign`) to register or remove a device. One fixed layout, never free text. */
export function deviceMessage(f: DeviceMessageFields): string {
    return [
        "OPUS push",
        `action: ${f.action}`,
        `address: ${f.address.toLowerCase()}`,
        `token: ${f.token}`,
        `lang: ${f.lang}`,
        `platform: ${f.platform}`,
        `issuedAt: ${f.issuedAt}`,
    ].join("\n");
}

/** The text a wallet signs to mute or unmute one service. */
export function muteMessage(f: MuteMessageFields): string {
    return [
        "OPUS push",
        `action: ${f.muted ? "mute" : "unmute"}`,
        `address: ${f.address.toLowerCase()}`,
        `app: ${f.app}`,
        `issuedAt: ${f.issuedAt}`,
    ].join("\n");
}

export type LocalizedPush = {
    /** Wallet addresses (any number). */
    to: readonly string[];
    /** The text in one language. Called once per language that some wallet registered. */
    message: (lang: PushLang) => { title: string; body: string };
    path?: string;
    payload?: unknown;
    priority?: "default" | "normal" | "high";
};

export type ServicePush = {
    /** Wallet addresses, at most 100. */
    to: readonly string[];
    title: LocalText;
    body: LocalText;
    /** A path inside the service's own site, opened when the push is tapped. */
    path?: string;
    payload?: unknown;
    priority?: "default" | "normal" | "high";
};

/** Counts only: a service learns how many went out, not which address has a phone. */
export type PushSummary = {
    accepted: number;
    noDevice: number;
    muted: number;
    limited: number;
    failed: number;
};

export class MessageRelayerError extends Error {
    constructor(message: string, readonly status: number) {
        super(message);
    }
}

export type MessageRelayerClientOptions = {
    /** Base URL of the message relayer, e.g. `https://push.example.org`. */
    url: string;
    /** The service key the relayer's operator issued. Keep it on your server. */
    key: string;
    fetch?: typeof fetch;
    timeoutMs?: number;
};

/** Anything that can sign a message as a wallet: a viem account fits. */
export type MessageSigner = {
    address: string;
    signMessage(args: { message: string }): Promise<string>;
};

type WalletCall = { url: string; signer: MessageSigner; fetch?: typeof fetch; now?: () => number };

const clean = (url: string) => url.replace(/\/+$/, "");

async function postSigned(options: WalletCall, path: string, body: Record<string, unknown>): Promise<void> {
    const run = options.fetch ?? fetch;
    const response = await run(`${clean(options.url)}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
        const answer = (await response.json().catch(() => ({}))) as { error?: string };
        throw new MessageRelayerError(
            answer.error ?? `The message relayer answered ${response.status}`,
            response.status
        );
    }
}

const secondsNow = (options: WalletCall) => (options.now ?? (() => Math.floor(Date.now() / 1000)))();

export type DeviceCall = WalletCall & { token: string; lang: PushLang; platform: PushPlatform };

/**
 * For the wallet app: tells the relayer "this phone belongs to this wallet, in this language". The wallet signs
 * a fixed message, so nobody can register a phone for an address they do not control. Call it again when the
 * language or the push token changes.
 */
export async function registerDevice(options: DeviceCall): Promise<void> {
    const fields = {
        action: "register",
        address: options.signer.address,
        token: options.token,
        lang: options.lang,
        platform: options.platform,
        issuedAt: secondsNow(options),
    } as const;
    const signature = await options.signer.signMessage({ message: deviceMessage(fields) });
    await postSigned(options, "/v1/devices", { ...fields, signature });
}

/** For the wallet app: removes this phone (for example when the wallet is erased or the user turns push off). */
export async function unregisterDevice(options: DeviceCall): Promise<void> {
    const fields = {
        action: "unregister",
        address: options.signer.address,
        token: options.token,
        lang: options.lang,
        platform: options.platform,
        issuedAt: secondsNow(options),
    } as const;
    const signature = await options.signer.signMessage({ message: deviceMessage(fields) });
    await postSigned(options, "/v1/devices", { ...fields, signature });
}

/** For the wallet app: stops (or restarts) push from one service for this wallet. */
export async function setServiceMuted(options: WalletCall & { app: string; muted: boolean }): Promise<void> {
    const fields = {
        address: options.signer.address,
        app: options.app,
        muted: options.muted,
        issuedAt: secondsNow(options),
    };
    const signature = await options.signer.signMessage({ message: muteMessage(fields) });
    await postSigned(options, "/v1/mutes", { ...fields, signature });
}

/** For a service's server: sends a push to wallet addresses through the message relayer. */
export class MessageRelayerClient {
    private readonly run: typeof fetch;

    constructor(private readonly options: MessageRelayerClientOptions) {
        this.run = options.fetch ?? fetch;
    }

    private async call(path: string, body: unknown): Promise<Record<string, unknown>> {
        const response = await this.run(`${clean(this.options.url)}${path}`, {
            method: "POST",
            headers: { "content-type": "application/json", authorization: `Bearer ${this.options.key}` },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(this.options.timeoutMs ?? 10_000),
        });
        const answer = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        if (!response.ok) {
            throw new MessageRelayerError(
                String(answer.error ?? `The message relayer answered ${response.status}`),
                response.status
            );
        }
        return answer;
    }

    /**
     * The language each wallet registered, by lower-case address; `null` when the wallet has no phone registered
     * or has muted this service. At most 100 addresses per call (more are split into several calls).
     */
    async languages(addresses: readonly string[]): Promise<Record<string, PushLang | null>> {
        const out: Record<string, PushLang | null> = {};
        const unique = [...new Set(addresses.map((a) => a.toLowerCase()))];
        for (let i = 0; i < unique.length; i += 100) {
            const answer = await this.call("/v1/languages", { to: unique.slice(i, i + 100) });
            Object.assign(out, (answer.languages ?? {}) as Record<string, PushLang | null>);
        }
        return out;
    }

    /**
     * Writes the message in each wallet's own language, then sends. It asks for the languages first, groups the
     * wallets by language, and sends one push per language with a plain text. A wallet with no phone or a mute is
     * left out (counted in `noLanguage`). `fallback` is used if the relayer answers with a language you do not write.
     */
    async pushLocalized(input: LocalizedPush): Promise<PushSummary & { noLanguage: number }> {
        const languages = await this.languages(input.to);
        const groups = new Map<PushLang, string[]>();
        let noLanguage = 0;
        for (const address of new Set(input.to.map((a) => a.toLowerCase()))) {
            const lang = languages[address];
            if (lang === null || lang === undefined) {
                noLanguage += 1;
                continue;
            }
            const list = groups.get(lang) ?? [];
            list.push(address);
            groups.set(lang, list);
        }
        const total: PushSummary & { noLanguage: number } = {
            accepted: 0,
            noDevice: 0,
            muted: 0,
            limited: 0,
            failed: 0,
            noLanguage,
        };
        for (const [lang, to] of groups) {
            const text = input.message(lang);
            for (let i = 0; i < to.length; i += 100) {
                const part = await this.push({
                    to: to.slice(i, i + 100),
                    title: text.title,
                    body: text.body,
                    path: input.path,
                    payload: input.payload,
                    priority: input.priority,
                });
                total.accepted += part.accepted;
                total.noDevice += part.noDevice;
                total.muted += part.muted;
                total.limited += part.limited;
                total.failed += part.failed;
            }
        }
        return total;
    }

    async push(input: ServicePush): Promise<PushSummary> {
        const answer = (await this.call("/v1/push", input)) as Partial<PushSummary>;
        return {
            accepted: answer.accepted ?? 0,
            noDevice: answer.noDevice ?? 0,
            muted: answer.muted ?? 0,
            limited: answer.limited ?? 0,
            failed: answer.failed ?? 0,
        };
    }
}
