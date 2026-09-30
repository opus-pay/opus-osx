import { keccak256, stringToBytes, type Hex } from "viem";

/** Hash of an off-chain deliverable. The chain stores this, not the file. */
export function proofHash(bytes: Uint8Array): Hex {
    return keccak256(bytes);
}

export function textHash(text: string): Hex {
    return keccak256(stringToBytes(text));
}

export function countdown(deadline: bigint | null, now: bigint): string {
    if (deadline === null) return "No deadline";
    const left = deadline - now;
    if (left <= 0n) return "Due now";
    const seconds = Number(left);
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    return `${hours}h ${minutes}m`;
}
