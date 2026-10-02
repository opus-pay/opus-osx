import { keccak256, stringToBytes, type Hex } from "viem";

import { translate, type Locale } from "./i18n";

/** Hash of an off-chain deliverable. The chain stores this, not the file. */
export function proofHash(bytes: Uint8Array): Hex {
    return keccak256(bytes);
}

export function textHash(text: string): Hex {
    return keccak256(stringToBytes(text));
}

export function countdown(deadline: bigint | null, now: bigint, locale: Locale = "en"): string {
    if (deadline === null) return translate(locale, "time.none");
    const left = deadline - now;
    if (left <= 0n) return translate(locale, "time.now");
    const seconds = Number(left);
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (days > 0) return translate(locale, "time.days", { d: days, h: hours });
    return translate(locale, "time.hours", { h: hours, m: minutes });
}
