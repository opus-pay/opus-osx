import { readFileSync, renameSync, writeFileSync } from "fs";

/** Budgets left per integrator, as decimal strings, so a restart does not hand every integrator a full budget again. */
export function readBudgets(file: string): Record<string, bigint> {
    try {
        const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
        if (typeof raw !== "object" || raw === null) return {};
        const out: Record<string, bigint> = {};
        for (const [id, value] of Object.entries(raw)) {
            if (typeof value === "string" && /^\d+$/.test(value)) out[id] = BigInt(value);
        }
        return out;
    } catch {
        return {};
    }
}

/** Writes to a temporary file and renames it, so a crash never leaves half a file. */
export function writeBudgets(file: string, budgets: Record<string, bigint>): void {
    const text = JSON.stringify(Object.fromEntries(Object.entries(budgets).map(([id, v]) => [id, v.toString()])));
    writeFileSync(`${file}.tmp`, text);
    renameSync(`${file}.tmp`, file);
}
