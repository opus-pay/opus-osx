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
