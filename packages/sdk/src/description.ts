import { keccak256, stringToBytes } from "viem";

const URI = /^(ipfs|https|http):\/\//i;
const HASH = /^0x[0-9a-fA-F]{64}$/;

/** Store a hash or URI. Plain text is hashed so the chain never keeps the request body. */
export function descriptionOf(document: string): string {
    const value = document.trim();
    if (value === "") throw new Error("Description is empty");
    if (URI.test(value) || HASH.test(value)) return value;
    return keccak256(stringToBytes(value));
}

export function assertDescription(description: string): void {
    if (!URI.test(description) && !HASH.test(description)) {
        throw new Error("Description must be a hash or URI");
    }
}
