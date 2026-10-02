import type { Hash, PublicClient } from "viem";

const EXPLORERS: Record<number, string> = {
    137: "https://polygonscan.com",
    80002: "https://amoy.polygonscan.com",
};

/** Block explorer page for a transaction, or undefined on a chain without a known explorer. */
export function explorerTx(chainId: number, hash: Hash): string | undefined {
    const base = EXPLORERS[chainId];
    return base === undefined ? undefined : `${base}/tx/${hash}`;
}

/**
 * Wait until the transaction is in a block. The next step reads chain state,
 * so it must not start before this one lands, or the app asks for the same step twice.
 */
export async function confirmed(publicClient: PublicClient, hash: Hash): Promise<Hash> {
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error("The transaction was reverted");
    return hash;
}
