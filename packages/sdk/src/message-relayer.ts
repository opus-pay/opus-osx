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

/** For a service's server: sends a push to wallet addresses through the message relayer. */
export class MessageRelayerClient {
    private readonly run: typeof fetch;

    constructor(private readonly options: MessageRelayerClientOptions) {
        this.run = options.fetch ?? fetch;
    }

    async push(input: ServicePush): Promise<PushSummary> {
        const response = await this.run(`${this.options.url.replace(/\/+$/, "")}/v1/push`, {
            method: "POST",
            headers: { "content-type": "application/json", authorization: `Bearer ${this.options.key}` },
            body: JSON.stringify(input),
            signal: AbortSignal.timeout(this.options.timeoutMs ?? 10_000),
        });
        const answer = (await response.json().catch(() => ({}))) as Partial<PushSummary> & { error?: string };
        if (!response.ok)
            throw new MessageRelayerError(
                answer.error ?? `The message relayer answered ${response.status}`,
                response.status
            );
        return {
            accepted: answer.accepted ?? 0,
            noDevice: answer.noDevice ?? 0,
            muted: answer.muted ?? 0,
            limited: answer.limited ?? 0,
            failed: answer.failed ?? 0,
        };
    }
}
