/**
 * The link a provider can share with the client so the client can open the deliverable. The chain stores only the
 * fingerprint of the file, so the way to the file itself travels outside it: in the part of the address after the `#`,
 * which a browser never sends to a server (the same way the payment link carries its terms).
 */

const MAX_URL_LENGTH = 2000;
const PARAM = "result";

/** A link to a deliverable: `https` only, no credentials in it, no spaces, not too long. Returns it cleaned, or undefined. */
export function parseResultUrl(value: string): string | undefined {
    const text = value.trim();
    if (text === "" || text.length > MAX_URL_LENGTH || /\s/.test(text)) return undefined;
    let url: URL;
    try {
        url = new URL(text);
    } catch {
        return undefined;
    }
    if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.hostname === "")
        return undefined;
    return url.toString();
}

/** The address the provider sends to the client: this job's page with the deliverable link after the `#`. */
export function resultLinkFor(origin: string, jobId: string | bigint, url: string): string {
    const clean = parseResultUrl(url);
    if (clean === undefined) throw new Error("The link must start with https://");
    return `${origin}/jobs/${jobId.toString()}#${PARAM}=${encodeURIComponent(clean)}`;
}

/** The deliverable link in an address's `#` part (`#result=…`), or undefined when there is none or it is not safe. */
export function resultFromHash(hash: string): string | undefined {
    const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
    const value = params.get(PARAM);
    return value === null ? undefined : parseResultUrl(value);
}

/** The site a link points to, to show next to it so the client sees where it goes. */
export function hostOf(url: string): string {
    try {
        return new URL(url).hostname;
    } catch {
        return "";
    }
}
