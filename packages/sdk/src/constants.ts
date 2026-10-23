import { defineChain, zeroAddress, type Address, type Chain } from "viem";

/** D3 placeholders. Match `OptimisticEvaluator` / `OpusAgenticCommerce`. */
export const PLACEHOLDER_MIN_WINDOW = 3600;
export const PLACEHOLDER_MAX_WINDOW = 180 * 24 * 60 * 60;
/** One day, matching OptimisticEvaluator.PLACEHOLDER_SAFETY_MARGIN. */
export const PLACEHOLDER_SAFETY_MARGIN = 86400;
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
/** 100 USD per job until the external audit, matching OpusAgenticCommerce.MAX_BUDGET_USD. */
export const MAX_BUDGET_USD = 100n;

/**
 * @deprecated This is Amoy's minimum tip, not a gas price that gets mined once the base fee is
 * above zero. Use `amoyGasPrice(publicClient)`.
 */
export const AMOY_MIN_GAS_PRICE = 25_000_000_000n;

export const amoy = defineChain({
    id: 80002,
    name: "Polygon Amoy",
    nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
    rpcUrls: { default: { http: ["https://polygon-amoy-bor-rpc.publicnode.com"] } },
    blockExplorers: { default: { name: "Polygonscan", url: "https://amoy.polygonscan.com" } },
});

export const polygon = defineChain({
    id: 137,
    name: "Polygon",
    nativeCurrency: { name: "POL", symbol: "POL", decimals: 18 },
    // polygon-rpc.com answers 403 since 2026-10. Mainnet services should set their own paid node anyway.
    rpcUrls: { default: { http: ["https://polygon-bor-rpc.publicnode.com"] } },
    blockExplorers: { default: { name: "Polygonscan", url: "https://polygonscan.com" } },
});

export const localHardhat = defineChain({
    id: 31337,
    name: "Hardhat",
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } },
});

/**
 * The chain of an addresses file: Polygon (137), Amoy (80002) or a local Hardhat node (31337). Any other id is an
 * error, so a service never signs for one chain while talking to another.
 */
export function chainForId(chainId: number): Chain {
    if (chainId === polygon.id) return polygon;
    if (chainId === amoy.id) return amoy;
    if (chainId === localHardhat.id) return localHardhat;
    throw new Error(`Unknown chain id ${chainId}: expected 137 (Polygon), 80002 (Amoy) or 31337 (local Hardhat)`);
}
