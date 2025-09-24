import { defineChain, zeroAddress, type Address } from "viem";

/** D3 placeholders. Match `OptimisticEvaluator` / `OpusAgenticCommerce`. */
export const PLACEHOLDER_MIN_WINDOW = 3600;
export const PLACEHOLDER_MAX_WINDOW = 180 * 24 * 60 * 60;
export const PLACEHOLDER_SAFETY_MARGIN = 3600;
export const PLACEHOLDER_MIN_JOB_DURATION = 3600;
export const PLACEHOLDER_MAX_JOB_DURATION = 180 * 24 * 60 * 60;

/**
 * D18 — fee, tip, and dispute deposit amounts are not decided.
 * Zero passes validation and must be replaced when D18 is set.
 */
export const PLACEHOLDER_EVALUATION_FEE = 0n;
export const PLACEHOLDER_KEEPER_TIP = 0n;
export const PLACEHOLDER_DISPUTE_DEPOSIT = 0n;

/** D10 — no default arbiter until that decision. Callers pass one when a preset needs it. */
export const PLACEHOLDER_ARBITER: Address = zeroAddress;

export const MIN_BUDGET_USD = 1n;
export const MAX_BUDGET_USD = 1_000n;

/** Amoy rejects a tip below 25 gwei. dRPC's quoted price is not usable. */
export const AMOY_MIN_GAS_PRICE = 25_000_000_000n;

export const amoy = defineChain({
    id: 80002,
    name: "Polygon Amoy",
    nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
    rpcUrls: { default: { http: ["https://polygon-amoy.drpc.org"] } },
    blockExplorers: { default: { name: "Polygonscan", url: "https://amoy.polygonscan.com" } },
});

export const localHardhat = defineChain({
    id: 31337,
    name: "Hardhat",
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
});
