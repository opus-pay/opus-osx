import { timingSafeEqual } from "crypto";

/** What one signer address may use inside a window, within an integrator's totals. */
export type SignerLimit = {
    maxRequests: number;
    windowSeconds: number;
    /** Gas (in wei of the gas token) one signer may spend inside the window. */
    gasWei: bigint;
};

export type Integrator = {
    id: string;
    /** Empty only for a public integrator (a mobile app that cannot keep a secret). */
    token: string;
    budgetWei: bigint;
    maxRequests: number;
    windowSeconds: number;
    /** A public integrator takes requests without a token. It must have a per-signer limit. */
    public?: boolean;
    signer?: SignerLimit | undefined;
};

export function parseIntegrators(json: string): Integrator[] {
    const rows: unknown = JSON.parse(json);
    if (!Array.isArray(rows) || rows.length === 0) {
        throw new Error("RELAYER_INTEGRATORS must list at least one integrator");
    }
    return rows.map((row) => {
        if (typeof row !== "object" || row === null) throw new Error("An integrator entry is not an object");
        const item = row as Record<string, unknown>;
        const id = String(item.id ?? "");
        const isPublic = item.public === true;
        const token = String(item.token ?? "");
        const budgetWei = BigInt(String(item.budgetWei ?? ""));
        const maxRequests = Number(item.maxRequests);
        const windowSeconds = Number(item.windowSeconds);
        if (id === "" || (token === "" && !isPublic)) throw new Error("An integrator needs an id and a token");
        if (isPublic && token !== "") throw new Error("A public integrator takes no token");
        if (budgetWei < 0n || !Number.isInteger(maxRequests) || maxRequests < 1) {
            throw new Error("An integrator budget or rate limit is invalid");
        }
        if (!Number.isInteger(windowSeconds) || windowSeconds < 1) {
            throw new Error("An integrator window is invalid");
        }
        const signer = parseSignerLimit(item.signer);
        if (isPublic && signer === undefined) {
            throw new Error("A public integrator needs per-signer limits (signer.maxRequests, windowSeconds, gasWei)");
        }
        return { id, token, budgetWei, maxRequests, windowSeconds, public: isPublic, signer };
    });
}

function parseSignerLimit(value: unknown): SignerLimit | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== "object" || value === null) throw new Error("An integrator signer limit is not an object");
    const item = value as Record<string, unknown>;
    const maxRequests = Number(item.maxRequests);
    const windowSeconds = Number(item.windowSeconds);
    const gasWei = BigInt(String(item.gasWei ?? ""));
    if (!Number.isInteger(maxRequests) || maxRequests < 1 || !Number.isInteger(windowSeconds) || windowSeconds < 1) {
        throw new Error("An integrator signer limit is invalid");
    }
    if (gasWei < 0n) throw new Error("An integrator signer gas limit is invalid");
    return { maxRequests, windowSeconds, gasWei };
}

export function tokenMatches(expected: string, presented: string): boolean {
    const left = Buffer.from(expected);
    const right = Buffer.from(presented);
    if (left.length !== right.length || left.length === 0) return false;
    return timingSafeEqual(left, right);
}

/** How many requests an integrator may send inside one window. */
export class RequestWindow {
    private stamps: number[] = [];

    constructor(
        private readonly max: number,
        private readonly windowSeconds: number,
        private readonly now: () => number
    ) {}

    allow(): boolean {
        const now = this.now();
        this.stamps = this.stamps.filter((stamp) => now - stamp < this.windowSeconds);
        if (this.stamps.length >= this.max) return false;
        this.stamps.push(now);
        return true;
    }
}

/** Gas the integrator has left. A hold is settled to the amount the transaction actually used. */
export class GasBudget {
    constructor(public remaining: bigint) {}

    hold(cost: bigint): boolean {
        if (cost < 0n || this.remaining < cost) return false;
        this.remaining -= cost;
        return true;
    }

    settle(held: bigint, actual: bigint): void {
        this.remaining += held - actual;
        if (this.remaining < 0n) this.remaining = 0n;
    }
}

/**
 * Per-signer limits. The signer is the address that signed the request, so it is only counted after the
 * forwarder has verified the signature: a forged `from` cannot use up someone else's allowance.
 * A person can still make many addresses; the integrator's total budget is what caps the loss.
 */
export class SignerLimits {
    private readonly seen = new Map<string, { at: number; gas: bigint }[]>();

    constructor(private readonly limit: SignerLimit, private readonly now: () => number) {}

    private live(signer: string): { at: number; gas: bigint }[] {
        const now = this.now();
        const rows = (this.seen.get(signer) ?? []).filter((row) => now - row.at < this.limit.windowSeconds);
        if (rows.length === 0) this.seen.delete(signer);
        else this.seen.set(signer, rows);
        return rows;
    }

    /** Counts one request for the signer. False when the signer is out of requests in this window. */
    admit(signer: string): boolean {
        const rows = this.live(signer);
        if (rows.length >= this.limit.maxRequests) return false;
        rows.push({ at: this.now(), gas: 0n });
        this.seen.set(signer, rows);
        this.prune();
        return true;
    }

    /** Holds gas against the signer's allowance on the request just admitted. */
    holdGas(signer: string, cost: bigint): boolean {
        const rows = this.live(signer);
        const spent = rows.reduce((sum, row) => sum + row.gas, 0n);
        if (cost < 0n || spent + cost > this.limit.gasWei) return false;
        const last = rows[rows.length - 1];
        if (last !== undefined) last.gas += cost;
        return true;
    }

    /** Settles the held gas to what the transaction actually used (a change of `actual - held` on the latest row). */
    settleGas(signer: string, held: bigint, actual: bigint): void {
        const last = this.seen.get(signer)?.at(-1);
        if (last === undefined) return;
        last.gas += actual - held;
        if (last.gas < 0n) last.gas = 0n;
    }

    private prune(): void {
        if (this.seen.size < 10_000) return;
        for (const signer of [...this.seen.keys()]) this.live(signer);
    }
}
