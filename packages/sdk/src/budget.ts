import { MAX_BUDGET_USD, MIN_BUDGET_USD } from "./constants";

export { MAX_BUDGET_USD as MAX_BUDGET_USD_WHOLE, MIN_BUDGET_USD as MIN_BUDGET_USD_WHOLE };

/** Whole USD amounts used by the payment link. Token units are `usd * 10^decimals`. */
export function tokenUnitsForUsd(usd: bigint, decimals: number): bigint {
    if (decimals < 0 || decimals > 18) throw new Error("Unsupported token decimals");
    return usd * 10n ** BigInt(decimals);
}

export function assertBudgetInRange(amount: bigint, decimals: number): void {
    const min = tokenUnitsForUsd(MIN_BUDGET_USD, decimals);
    const max = tokenUnitsForUsd(MAX_BUDGET_USD, decimals);
    if (amount < min) throw new Error(`Budget ${amount} is below 1 USD`);
    if (amount > max) throw new Error(`Budget ${amount} is above ${MAX_BUDGET_USD} USD`);
}

/** Split work above the per-job cap (MAX_BUDGET_USD) into several jobs. */
export function splitBudgetUsd(amountUsd: number): number[] {
    if (!(amountUsd > 0)) return [];
    const parts: number[] = [];
    let remaining = amountUsd;
    while (remaining > Number(MAX_BUDGET_USD)) {
        parts.push(Number(MAX_BUDGET_USD));
        remaining -= Number(MAX_BUDGET_USD);
    }
    parts.push(remaining);
    return parts;
}
