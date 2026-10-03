import { getAddress, isAddress, type Address } from "viem";

import { MAX_BUDGET_USD, MIN_BUDGET_USD } from "@opus/sdk";

export const PRESETS = ["aiToAi", "aiToPerson", "smallNoArbiter"] as const;
export type PresetName = (typeof PRESETS)[number];

/** Unsigned terms. The shareable link's fragment is this record, not a server row. */
export type Draft = {
    v: 1;
    expiresAt: number;
    from: Address;
    counterparty: Address;
    amountUsd: number;
    preset: PresetName;
    agreement: string;
    lock: 1 | 2;
    drafter: "client" | "provider";
};

/** Browser-safe base64url. The payment page has no Node Buffer. */
function encodeBase64Url(text: string): string {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).split("+").join("-").split("/").join("_").replace(/=+$/, "");
}

function decodeBase64Url(token: string): string {
    const padded = token.split("-").join("+").split("_").join("/") + "=".repeat((4 - (token.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
}

export function encodeDraft(draft: Draft): string {
    return encodeBase64Url(JSON.stringify(checked(draft)));
}

export function decodeDraft(token: string, nowSeconds: number): Draft {
    let parsed: unknown;
    try {
        parsed = JSON.parse(decodeBase64Url(token));
    } catch {
        throw new Error("The link is not a payment draft");
    }
    const draft = checked(parsed);
    if (draft.expiresAt <= nowSeconds) throw new Error("The link has expired");
    return draft;
}

export function linkFor(origin: string, draft: Draft): string {
    return `${origin.replace(/\/$/, "")}/open#${encodeDraft(draft)}`;
}

export function parties(draft: Draft): { client: Address; provider: Address } {
    if (draft.drafter === "client") return { client: draft.from, provider: draft.counterparty };
    return { client: draft.counterparty, provider: draft.from };
}

function checked(value: unknown): Draft {
    if (typeof value !== "object" || value === null) throw new Error("The link is not a payment draft");
    const row = value as Record<string, unknown>;
    if (row.v !== 1) throw new Error("The link is not a payment draft");
    if (typeof row.expiresAt !== "number" || !Number.isInteger(row.expiresAt)) {
        throw new Error("The link expiry is invalid");
    }
    if (typeof row.from !== "string" || !isAddress(row.from)) throw new Error("The drafter address is invalid");
    if (typeof row.counterparty !== "string" || !isAddress(row.counterparty)) {
        throw new Error("The counterparty address is invalid");
    }
    if (getAddress(row.from) === getAddress(row.counterparty)) {
        throw new Error("The counterparty must be a different wallet");
    }
    if (typeof row.amountUsd !== "number" || !Number.isInteger(row.amountUsd)) {
        throw new Error("The amount must be a whole number of USD");
    }
    if (row.amountUsd < MIN_BUDGET_USD || row.amountUsd > MAX_BUDGET_USD) {
        throw new Error("The amount must be from 1 to 100 USD");
    }
    if (row.preset !== "aiToAi" && row.preset !== "aiToPerson" && row.preset !== "smallNoArbiter") {
        throw new Error("The evaluator preset is invalid");
    }
    if (typeof row.agreement !== "string" || row.agreement.trim() === "") {
        throw new Error("The agreement is empty");
    }
    if (row.lock !== 1 && row.lock !== 2) throw new Error("The budget lock is invalid");
    if (row.drafter !== "client" && row.drafter !== "provider") throw new Error("The drafter role is invalid");
    return {
        v: 1,
        expiresAt: row.expiresAt,
        from: getAddress(row.from),
        counterparty: getAddress(row.counterparty),
        amountUsd: row.amountUsd,
        preset: row.preset,
        agreement: row.agreement.trim(),
        lock: row.lock,
        drafter: row.drafter,
    };
}
