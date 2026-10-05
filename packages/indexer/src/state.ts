import { readFileSync, renameSync, writeFileSync } from "fs";

import type { StoreData } from "./store";

/** What is saved between runs: how far the scan got, and the ledger up to there. */
export type SavedState = {
    version: 1;
    /** Identifies the chain and contracts the ledger belongs to; a different one means start fresh. */
    key: string;
    /** The next block to read. */
    cursor: bigint;
    store: StoreData;
};

// Big numbers go through JSON as "123n" strings. No address, hash or name in the ledger looks like that.
const BIG = /^\d+n$/;
const encode = (_key: string, value: unknown) => (typeof value === "bigint" ? `${value}n` : value);
const decode = (_key: string, value: unknown) =>
    typeof value === "string" && BIG.test(value) ? BigInt(value.slice(0, -1)) : value;

/** Writes to a temporary file and renames it, so a crash never leaves half a file. */
export function saveState(file: string, state: SavedState): void {
    writeFileSync(`${file}.tmp`, JSON.stringify(state, encode));
    renameSync(`${file}.tmp`, file);
}

/** The saved state if it exists, is readable and belongs to `key`; otherwise nothing, and the scan starts over. */
export function loadState(file: string, key: string): SavedState | undefined {
    try {
        const state = JSON.parse(readFileSync(file, "utf8"), decode) as SavedState;
        if (state.version !== 1 || state.key !== key || typeof state.cursor !== "bigint") return undefined;
        if (!Array.isArray(state.store?.jobs) || !Array.isArray(state.store?.instances)) return undefined;
        return state;
    } catch {
        return undefined;
    }
}
