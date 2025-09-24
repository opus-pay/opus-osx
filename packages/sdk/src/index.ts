/** SDK surface is added in issue #23. Types will come from `@opus/contracts` typechain only. */
export const SDK_PACKAGE = "@opus/sdk";

export const MIN_BUDGET_USD = 1;
export const MAX_BUDGET_USD = 1_000;

/** Split work above 1,000 USD into several jobs of at most `MAX_BUDGET_USD`. */
export function splitBudgetUsd(amountUsd: number): number[] {
    if (!(amountUsd > 0)) {
        return [];
    }
    const parts: number[] = [];
    let remaining = amountUsd;
    while (remaining > MAX_BUDGET_USD) {
        parts.push(MAX_BUDGET_USD);
        remaining -= MAX_BUDGET_USD;
    }
    parts.push(remaining);
    return parts;
}
