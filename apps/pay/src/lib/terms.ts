import { translate, type Locale, type MessageKey } from "./i18n";

/**
 * The sentence the counterparty reads. The duration is the preset review window.
 * Only the client can object, so the provider, and a reader with no wallet yet, read "the client".
 */
export function plainTerms(
    reviewWindowSeconds: number,
    reader: "client" | "provider" | "anyone" = "client",
    locale: Locale = "en"
): string {
    return translate(locale, reader === "client" ? "terms.you" : "terms.client", {
        span: span(reviewWindowSeconds, locale),
    });
}

const PRESET: Record<string, MessageKey> = {
    smallNoArbiter: "preset.smallNoArbiter",
    aiToPerson: "preset.aiToPerson",
    aiToAi: "preset.aiToAi",
};

/** A preset's name in plain words; unknown names pass through. */
export function presetLabel(name: string, locale: Locale = "en"): string {
    const key = PRESET[name];
    return key === undefined ? name : translate(locale, key);
}

/** USDC with at least two decimals, and more only when the amount has them: "6.00", "0.505". */
export function usdcText(units: bigint): string {
    const negative = units < 0n;
    const abs = negative ? -units : units;
    const whole = abs / 1_000_000n;
    const fraction = (abs % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "").padEnd(2, "0");
    return `${negative ? "-" : ""}${whole.toString()}.${fraction}`;
}

function span(seconds: number, locale: Locale): string {
    if (seconds % 86400 === 0 && seconds >= 86400) {
        const days = seconds / 86400;
        return days === 1 ? translate(locale, "span.day") : translate(locale, "span.days", { n: days });
    }
    const hours = seconds / 3600;
    return hours === 1 ? translate(locale, "span.hour") : translate(locale, "span.hours", { n: hours });
}

const pad = (value: number) => String(value).padStart(2, "0");

/**
 * "2026-10-03 19:49:07 UTC+9": the same digits in every browser language, on a 24-hour clock,
 * with the offset so two people in different countries read the same moment.
 * `offsetMinutes` is east of UTC; it defaults to the viewer's time zone at that moment.
 */
export function dateTime(epochSeconds: number, offsetMinutes?: number): string {
    const offset = offsetMinutes ?? -new Date(epochSeconds * 1000).getTimezoneOffset();
    const shifted = new Date((epochSeconds + offset * 60) * 1000);
    const date = `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
    const time = `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}`;
    const sign = offset < 0 ? "-" : "+";
    const hours = Math.floor(Math.abs(offset) / 60);
    const minutes = Math.abs(offset) % 60;
    return `${date} ${time} UTC${sign}${hours}${minutes === 0 ? "" : `:${pad(minutes)}`}`;
}
