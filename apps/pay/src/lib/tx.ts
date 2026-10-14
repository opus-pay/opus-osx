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

/** Where a transaction is: the wallet is asking for a signature, or the network has the signed transaction. */
export type TxPhase = "idle" | "signing" | "confirming";

/**
 * Sends a transaction and waits for its block, telling the screen which of the two waits it is in: `signing` while the
 * wallet is asked (and until it returns the hash), `confirming` once there is a hash and the network has to confirm it.
 */
export async function sendAndConfirm(
    publicClient: PublicClient,
    send: () => Promise<Hash>,
    onPhase?: (phase: TxPhase, hash?: Hash) => void
): Promise<Hash> {
    onPhase?.("signing");
    const hash = await send();
    onPhase?.("confirming", hash);
    return confirmed(publicClient, hash);
}

/** Whether an error means the person cancelled in the wallet (wallets word it differently). */
export function isRejection(error: unknown): boolean {
    const code = (error as { code?: unknown } | undefined)?.code;
    const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
    return (
        code === 4001 ||
        /user (rejected|denied|cancel)|rejected the request|denied transaction|request rejected/i.test(message)
    );
}
