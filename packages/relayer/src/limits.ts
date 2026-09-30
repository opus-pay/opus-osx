import { timingSafeEqual } from "crypto";

export type Integrator = {
    id: string;
    token: string;
    budgetWei: bigint;
    maxRequests: number;
    windowSeconds: number;
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
        const token = String(item.token ?? "");
        const budgetWei = BigInt(String(item.budgetWei ?? ""));
        const maxRequests = Number(item.maxRequests);
        const windowSeconds = Number(item.windowSeconds);
        if (id === "" || token === "") throw new Error("An integrator needs an id and a token");
        if (budgetWei < 0n || !Number.isInteger(maxRequests) || maxRequests < 1) {
            throw new Error("An integrator budget or rate limit is invalid");
        }
        if (!Number.isInteger(windowSeconds) || windowSeconds < 1) {
            throw new Error("An integrator window is invalid");
        }
        return { id, token, budgetWei, maxRequests, windowSeconds };
    });
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
