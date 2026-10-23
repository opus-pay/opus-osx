import type { PublicClient } from "viem";

/** Amoy (and Polygon mainnet) mine a transaction only when its tip is at least 25 gwei above the base fee. */
export const AMOY_MIN_TIP = 25_000_000_000n;

/** Tip added on top of the minimum, so a price read a block ago still clears. */
const AMOY_TIP_MARGIN = 5_000_000_000n;

/**
 * A legacy gas price Amoy will mine now: the latest base fee with 25% headroom (it can rise
 * 12.5% a block) plus a 30 gwei tip. RPC price quotes are not used; dRPC once quoted ~400 gwei.
 *
 * A fixed 25 gwei worked only while the base fee was near zero. With a base fee of 31 gwei
 * (2026-10-08) such a transaction is refused or waits forever.
 */
export async function amoyGasPrice(client: Pick<PublicClient, "getBlock">): Promise<bigint> {
    const block = await client.getBlock({ blockTag: "latest" });
    const base = block.baseFeePerGas ?? 0n;
    return base + base / 4n + AMOY_MIN_TIP + AMOY_TIP_MARGIN;
}

/**
 * Whether a chain needs `amoyGasPrice`: Amoy and Polygon mainnet both refuse a tip under 25 gwei, and an RPC's own
 * quote can be far off. Other chains (a local Hardhat node) use the node's quote.
 */
export function usesTipFloor(chainId: number): boolean {
    return chainId === 80002 || chainId === 137;
}
