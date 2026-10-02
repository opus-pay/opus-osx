/** The sentence the counterparty reads. The duration is the preset review window. */
export function plainTerms(reviewWindowSeconds: number): string {
    return `Paid automatically ${span(reviewWindowSeconds)} after submission unless you object.`;
}

function span(seconds: number): string {
    if (seconds % 86400 === 0 && seconds >= 86400) {
        const days = seconds / 86400;
        return days === 1 ? "1 day" : `${days} days`;
    }
    const hours = seconds / 3600;
    if (hours === 1) return "1 hour";
    return `${hours} hours`;
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
