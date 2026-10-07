/**
 * Mobile push for apps built on OPUS. It sends through the Expo push service, which reaches both iOS and Android
 * and is what the OPUS wallet app registers for. The package keeps no state and adds no dependency: it uses the
 * global `fetch`, and a test can pass its own.
 *
 * A message carries a *route* in its data, `{ app, path?, payload? }`. A wallet app that hosts several mini-apps
 * opens the mini-app named by `app` at `path` (a path inside that mini-app's own site) and hands it `payload`.
 *
 * Push travels through a third party (Expo, then Apple or Google). Keep personal details, addresses and amounts out
 * of the title, body and payload; send an id and let the app fetch the rest after it opens.
 */

export const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
export const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";

/** The Expo service takes at most this many messages in one request. */
export const MAX_PUSH_BATCH = 100;
/** Expo limits one message to about 4 KiB. Keep the route data well under it. */
export const MAX_PUSH_DATA_BYTES = 3_000;
export const MAX_PUSH_TITLE = 100;
export const MAX_PUSH_BODY = 400;

export type PushRoute = {
    /** A mini-app id the receiving app knows (lower case letters, digits, `-`). */
    app: string;
    /** A path inside that mini-app's site, e.g. `/errand/123`. */
    path?: string;
    /** Small JSON for the mini-app to read when it opens. */
    payload?: unknown;
};

export type PushInput = {
    /** The device's Expo push token, `ExponentPushToken[...]`. */
    to: string;
    title: string;
    body: string;
    route: PushRoute;
    /** `high` wakes the device now; `normal` may wait. Default `high`. */
    priority?: "default" | "normal" | "high";
    /** Seconds the service keeps trying if the device is offline. Default 86,400 (one day). */
    ttlSeconds?: number;
    /** A badge number on iOS. */
    badge?: number;
    /** Android channel. Default `default`. */
    channelId?: string;
};

export type PushMessage = {
    to: string;
    title: string;
    body: string;
    data: { app: string; path?: string; payload?: unknown };
    sound: "default";
    priority: "default" | "normal" | "high";
    ttl: number;
    channelId: string;
    badge?: number;
};

export class PushError extends Error {}

const TOKEN = /^(Exponent|Expo)PushToken\[[^\]\s]+\]$/;
const APP_ID = /^[a-z0-9][a-z0-9-]{0,31}$/;

export function isExpoPushToken(value: unknown): value is string {
    return typeof value === "string" && TOKEN.test(value);
}

/** A path that stays inside the mini-app's site: starts with one `/`, no scheme, no `//`, no backslash. */
export function isInsidePath(path: string): boolean {
    return (
        path.startsWith("/") &&
        !path.startsWith("//") &&
        !path.includes("\\") &&
        !path.includes("://") &&
        !/[\u0000-\u001f\u007f]/.test(path)
    );
}

/** Checks a push and returns the message the Expo service takes. Throws `PushError` with the reason. */
export function buildPushMessage(input: PushInput): PushMessage {
    if (!isExpoPushToken(input.to)) throw new PushError("The device token is not an Expo push token");
    const title = input.title.trim();
    const body = input.body.trim();
    if (title === "" || title.length > MAX_PUSH_TITLE) {
        throw new PushError(`The title must be 1 to ${MAX_PUSH_TITLE} characters`);
    }
    if (body === "" || body.length > MAX_PUSH_BODY) {
        throw new PushError(`The body must be 1 to ${MAX_PUSH_BODY} characters`);
    }
    const { app, path, payload } = input.route;
    if (!APP_ID.test(app)) throw new PushError("The mini-app id must be lower case letters, digits and '-' (max 32)");
    if (path !== undefined && !isInsidePath(path)) {
        throw new PushError("The path must be a path inside the mini-app, such as /errand/123");
    }
    const data: PushMessage["data"] = { app };
    if (path !== undefined) data.path = path;
    if (payload !== undefined) {
        let text: string | undefined;
        try {
            text = JSON.stringify(payload);
        } catch {
            throw new PushError("The payload cannot be turned into JSON");
        }
        if (text === undefined) throw new PushError("The payload cannot be turned into JSON");
        data.payload = JSON.parse(text) as unknown;
    }
    if (new TextEncoder().encode(JSON.stringify(data)).length > MAX_PUSH_DATA_BYTES) {
        throw new PushError(`The route data is larger than ${MAX_PUSH_DATA_BYTES} bytes`);
    }
    const ttl = input.ttlSeconds ?? 86_400;
    if (!Number.isInteger(ttl) || ttl < 0) throw new PushError("ttlSeconds must be a whole number of seconds");
    const message: PushMessage = {
        to: input.to,
        title,
        body,
        data,
        sound: "default",
        priority: input.priority ?? "high",
        ttl,
        channelId: input.channelId ?? "default",
    };
    if (input.badge !== undefined) message.badge = input.badge;
    return message;
}

export function chunkMessages<T>(items: readonly T[], size = MAX_PUSH_BATCH): T[][] {
    if (!Number.isInteger(size) || size < 1) throw new PushError("The batch size must be at least 1");
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
}

export type PushClientOptions = {
    /** An Expo access token, if the project enforces one. Never put it in an app. */
    accessToken?: string;
    fetch?: typeof fetch;
    /** How many times to retry a 429 or 5xx answer. Default 3. */
    retries?: number;
    /** Wait before a retry, ms. Default `500 * 2^attempt`. */
    sleep?: (ms: number) => Promise<void>;
    sendUrl?: string;
    receiptsUrl?: string;
};

/** What happened to one message when it was handed to the service. */
export type PushResult =
    | { to: string; ok: true; ticketId: string }
    | { to: string; ok: false; error: string; message: string; invalidToken: boolean };

type Ticket = { status: "ok"; id: string } | { status: "error"; message?: string; details?: { error?: string } };

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function post(url: string, body: unknown, options: PushClientOptions): Promise<unknown> {
    const run = options.fetch ?? fetch;
    const sleep = options.sleep ?? wait;
    const retries = options.retries ?? 3;
    const headers: Record<string, string> = { accept: "application/json", "content-type": "application/json" };
    if (options.accessToken !== undefined && options.accessToken !== "") {
        headers.authorization = `Bearer ${options.accessToken}`;
    }
    for (let attempt = 0; ; attempt += 1) {
        let response: Response;
        try {
            response = await run(url, { method: "POST", headers, body: JSON.stringify(body) });
        } catch (error) {
            if (attempt >= retries) throw new PushError(`The push service could not be reached: ${String(error)}`);
            await sleep(500 * 2 ** attempt);
            continue;
        }
        if (response.status === 429 || response.status >= 500) {
            if (attempt >= retries) throw new PushError(`The push service answered ${response.status}`);
            await sleep(500 * 2 ** attempt);
            continue;
        }
        if (!response.ok) throw new PushError(`The push service answered ${response.status}`);
        return response.json() as Promise<unknown>;
    }
}

/**
 * Sends messages (in batches of 100) and says what happened to each, in the same order. A token the service says
 * is no longer registered comes back with `invalidToken: true`: delete it from your list.
 * Throws `PushError` only when the service cannot be reached or refuses a whole batch.
 */
export async function sendPush(
    messages: readonly PushMessage[],
    options: PushClientOptions = {}
): Promise<PushResult[]> {
    const results: PushResult[] = [];
    for (const batch of chunkMessages(messages)) {
        const answer = (await post(options.sendUrl ?? EXPO_PUSH_URL, batch, options)) as {
            data?: Ticket[];
            errors?: { message?: string }[];
        };
        if (!Array.isArray(answer.data) || answer.data.length !== batch.length) {
            const reason = answer.errors?.[0]?.message ?? "unexpected answer";
            throw new PushError(`The push service refused the batch: ${reason}`);
        }
        batch.forEach((message, i) => {
            const ticket = answer.data![i];
            if (ticket.status === "ok") {
                results.push({ to: message.to, ok: true, ticketId: ticket.id });
            } else {
                const error = ticket.details?.error ?? "Error";
                results.push({
                    to: message.to,
                    ok: false,
                    error,
                    message: ticket.message ?? error,
                    invalidToken: error === "DeviceNotRegistered",
                });
            }
        });
    }
    return results;
}

export type PushReceipts = {
    delivered: string[];
    /** Tickets the service has not settled yet; ask again in a few minutes. */
    pending: string[];
    failed: { ticketId: string; error: string; message: string }[];
};

/**
 * Asks, 15 minutes or more after sending, whether the messages reached Apple or Google. A `DeviceNotRegistered`
 * failure here also means the token is dead. `ticketIds` come from the `ok` results of `sendPush`.
 */
export async function getPushReceipts(
    ticketIds: readonly string[],
    options: PushClientOptions = {}
): Promise<PushReceipts> {
    const out: PushReceipts = { delivered: [], pending: [], failed: [] };
    for (const ids of chunkMessages(ticketIds, 1000)) {
        const answer = (await post(options.receiptsUrl ?? EXPO_RECEIPTS_URL, { ids }, options)) as {
            data?: Record<
                string,
                { status: "ok" } | { status: "error"; message?: string; details?: { error?: string } }
            >;
        };
        const data = answer.data ?? {};
        for (const id of ids) {
            const receipt = data[id];
            if (receipt === undefined) out.pending.push(id);
            else if (receipt.status === "ok") out.delivered.push(id);
            else {
                const error = receipt.details?.error ?? "Error";
                out.failed.push({ ticketId: id, error, message: receipt.message ?? error });
            }
        }
    }
    return out;
}

/** Builds and sends one push to several devices, and returns the tokens to forget. */
export async function pushToDevices(
    tokens: readonly string[],
    content: Omit<PushInput, "to">,
    options: PushClientOptions = {}
): Promise<{ results: PushResult[]; invalidTokens: string[] }> {
    const unique = [...new Set(tokens)];
    const results = await sendPush(
        unique.map((to) => buildPushMessage({ ...content, to })),
        options
    );
    return { results, invalidTokens: results.filter((r) => !r.ok && r.invalidToken).map((r) => r.to) };
}
