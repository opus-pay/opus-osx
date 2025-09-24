const PERMANENT = [
    "not in the required state",
    "deadline has not been reached",
    "review window is still open",
    "review or deposit window has ended",
    "This wallet cannot call",
    "transaction reverted",
];

export class PermanentError extends Error {}

export function isPermanent(error: unknown): boolean {
    if (error instanceof PermanentError) return true;
    const message = error instanceof Error ? error.message : String(error);
    return PERMANENT.some((part) => message.includes(part));
}

/** Retry a call. A contract rejection is not retried; a transport failure waits and tries again. */
export async function withBackoff<T>(
    run: () => Promise<T>,
    options: { attempts: number; baseDelayMs: number; sleep?: (ms: number) => Promise<void> }
): Promise<T> {
    const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
    let last: unknown;
    for (let attempt = 0; attempt < options.attempts; attempt++) {
        try {
            return await run();
        } catch (error) {
            last = error;
            if (isPermanent(error) || attempt === options.attempts - 1) throw error;
            await sleep(options.baseDelayMs * 2 ** attempt);
        }
    }
    throw last;
}
