/**
 * Node provider URLs usually carry the API key in the path or the query. Nothing that is logged, sent to an
 * alert channel or shown by `/health` may hold one, so addresses are cut down to scheme and host.
 */
export function redactUrls(text: string): string {
    return text.replace(/https?:\/\/[^\s"'<>)\]]+/gi, (found) => {
        try {
            const url = new URL(found);
            return `${url.protocol}//${url.host}/…`;
        } catch {
            return "[url]";
        }
    });
}

/** The host of a provider URL, for the start-up log. */
export function rpcHost(url: string): string {
    try {
        return new URL(url).host;
    } catch {
        return "[invalid url]";
    }
}
