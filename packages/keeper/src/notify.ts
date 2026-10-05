import { AlertGate, type Alert } from "./alerts";

const plain = (_key: string, value: unknown) => (typeof value === "bigint" ? value.toString() : value);

/** One readable line for a person (also what a Slack-style webhook shows). */
export function alertText(alert: Alert): string {
    switch (alert.kind) {
        case "low-balance":
            return `Keeper wallet is low: ${alert.balance} wei, minimum ${alert.minimum}`;
        case "near-expiry":
            return `Job ${alert.jobId} is near its chain expiry (${alert.expiredAt}, now ${alert.now})`;
        case "job-error":
            return `Job ${alert.jobId} could not be handled: ${alert.message}`;
        case "tick-failing":
            return `Keeper passes have failed ${alert.failures} times in a row: ${alert.message}`;
        case "call-pending":
            return `Call ${alert.action} for job ${alert.jobId} was sent (${alert.hash}) but is not in a block yet`;
    }
}

export type NotifierOptions = {
    /** Where alerts are POSTed as JSON `{ service, text, alert }`. Empty: log only. */
    webhookUrl?: string;
    /** The same alert for the same job repeats only after this long. Default 1 hour. */
    cooldownMs?: number;
    fetch?: typeof fetch;
    now?: () => number;
    /** Where the JSON line goes. Default stderr. */
    log?: (line: string) => void;
};

/**
 * Turns alerts into a log line and, if a webhook is set, a POST. An alert goes out once per cooldown per job, so
 * a loop that runs every 30 s does not send the same message all day. A failing webhook never stops the keeper.
 */
export function createNotifier(options: NotifierOptions = {}): (alert: Alert) => void {
    const gate = new AlertGate(options.cooldownMs ?? 3_600_000, options.now);
    const run = options.fetch ?? fetch;
    const log = options.log ?? ((line: string) => console.error(line));
    return (alert) => {
        if (!gate.allow(alert)) return;
        log(JSON.stringify({ t: new Date().toISOString(), event: "alert", ...alert }, plain));
        if (options.webhookUrl === undefined || options.webhookUrl === "") return;
        const body = JSON.stringify({ service: "opus-keeper", text: alertText(alert), alert }, plain);
        void run(options.webhookUrl, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body,
            signal: AbortSignal.timeout(5_000),
        }).catch((error: unknown) => log(JSON.stringify({ event: "webhook-failed", reason: String(error) })));
    };
}
