import { createHash, randomBytes, timingSafeEqual } from "crypto";

/** A service allowed to send push. Its key only works for its own mini-app id. */
export type Service = {
    id: string;
    /** The mini-app id every push of this service carries. A service cannot send as another app. */
    app: string;
    /** SHA-256 of the key, in hex. The key itself is never stored. */
    keyHash: string;
    /** Requests per minute from this service. */
    maxRequestsPerMinute: number;
    /** Pushes one wallet may get from this service in 24 hours. */
    perWalletPerDay: number;
};

const ID = /^[a-z0-9][a-z0-9-]{0,31}$/;

export const hashKey = (key: string): string => createHash("sha256").update(key).digest("hex");

/** A new key and the config row to put in `MESSAGE_RELAYER_SERVICES`. Show the key once; keep only the hash. */
export function newServiceKey(
    id: string,
    app: string,
    limits: Partial<Pick<Service, "maxRequestsPerMinute" | "perWalletPerDay">> = {}
) {
    const key = `opus_msg_${randomBytes(32).toString("base64url")}`;
    const service: Service = {
        id,
        app,
        keyHash: hashKey(key),
        maxRequestsPerMinute: limits.maxRequestsPerMinute ?? 60,
        perWalletPerDay: limits.perWalletPerDay ?? 20,
    };
    parseServices(JSON.stringify([service]));
    return { key, service };
}

export function parseServices(json: string): Service[] {
    const rows: unknown = JSON.parse(json);
    if (!Array.isArray(rows) || rows.length === 0)
        throw new Error("MESSAGE_RELAYER_SERVICES must list at least one service");
    const seen = new Set<string>();
    return rows.map((row) => {
        if (typeof row !== "object" || row === null) throw new Error("A service entry is not an object");
        const item = row as Record<string, unknown>;
        const id = String(item.id ?? "");
        const app = String(item.app ?? "");
        const keyHash = String(item.keyHash ?? "");
        const maxRequestsPerMinute = Number(item.maxRequestsPerMinute);
        const perWalletPerDay = Number(item.perWalletPerDay);
        if (!ID.test(id) || !ID.test(app))
            throw new Error("A service needs an id and an app of lower case letters, digits and '-'");
        if (!/^[0-9a-f]{64}$/.test(keyHash))
            throw new Error("A service keyHash must be the SHA-256 of its key, in hex");
        if (!Number.isInteger(maxRequestsPerMinute) || maxRequestsPerMinute < 1)
            throw new Error("A service request limit is invalid");
        if (!Number.isInteger(perWalletPerDay) || perWalletPerDay < 1)
            throw new Error("A service per-wallet limit is invalid");
        if (seen.has(id)) throw new Error(`Service ${id} is listed twice`);
        seen.add(id);
        return { id, app, keyHash, maxRequestsPerMinute, perWalletPerDay };
    });
}

/** The service a bearer key belongs to, or undefined. Compares hashes in constant time. */
export function serviceForKey(services: readonly Service[], bearer: string): Service | undefined {
    if (bearer === "") return undefined;
    const presented = Buffer.from(hashKey(bearer), "hex");
    let found: Service | undefined;
    for (const service of services) {
        if (timingSafeEqual(presented, Buffer.from(service.keyHash, "hex"))) found = service;
    }
    return found;
}

/** A count inside a sliding window of seconds, per key. */
export class SlidingCounter {
    private readonly stamps = new Map<string, number[]>();

    constructor(
        private readonly max: number,
        private readonly windowSeconds: number,
        private readonly now: () => number
    ) {}

    /** Counts one hit and says whether it is within the limit. */
    hit(key: string): boolean {
        const now = this.now();
        const rows = (this.stamps.get(key) ?? []).filter((s) => now - s < this.windowSeconds);
        if (rows.length >= this.max) {
            this.stamps.set(key, rows);
            return false;
        }
        rows.push(now);
        this.stamps.set(key, rows);
        if (this.stamps.size > 50_000) this.prune();
        return true;
    }

    private prune(): void {
        const now = this.now();
        for (const [key, rows] of this.stamps) {
            if (rows.every((s) => now - s >= this.windowSeconds)) this.stamps.delete(key);
        }
    }
}
