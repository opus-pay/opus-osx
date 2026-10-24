import { fallback, http, type Transport } from "viem";

/**
 * The node(s) of a service, from a comma-separated setting such as `RELAYER_RPC_URL=https://a,https://b`. With more
 * than one, a call that fails on one node (a rate limit, a timeout) is tried on the next, so one provider that
 * refuses for a moment does not stop the service. Each node also retries a failed call a few times with backoff.
 */
export function rpcUrlsFrom(value: string | undefined, fallbackUrl: string): string[] {
    const urls = (value ?? "")
        .split(",")
        .map((u) => u.trim())
        .filter((u) => u !== "");
    return urls.length > 0 ? urls : [fallbackUrl];
}

export function rpcTransport(urls: readonly string[]): Transport {
    const one = (url: string) => http(url, { retryCount: 3, retryDelay: 400 });
    return urls.length === 1 ? one(urls[0]) : fallback(urls.map(one), { rank: false, retryCount: 1 });
}
