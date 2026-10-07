import { newServiceKey, parseServices } from "./services";
import { MessageRelayer } from "./relay";
import { createMessageRelayerServer } from "./server";
import { Store } from "./store";

const number = (name: string, fallback: number): number => {
    const raw = process.env[name]?.trim();
    if (raw === undefined || raw === "") return fallback;
    if (!/^\d+$/.test(raw)) throw new Error(`${name} must be a whole number`);
    return Number(raw);
};

/** `keys new <id> <app>`: makes a service key. The key is shown once; put the printed row in MESSAGE_RELAYER_SERVICES. */
function issueKey(args: string[]): void {
    const [id, app] = args;
    if (id === undefined || app === undefined) throw new Error("usage: keys new <service-id> <app-id>");
    const { key, service } = newServiceKey(id, app);
    console.log(`Service key (give it to the service; it is not stored here, show it once):\n${key}\n`);
    console.log(`Add this row to MESSAGE_RELAYER_SERVICES:\n${JSON.stringify(service)}`);
}

async function start(): Promise<void> {
    const servicesJson = process.env.MESSAGE_RELAYER_SERVICES?.trim();
    if (servicesJson === undefined || servicesJson === "") throw new Error("MESSAGE_RELAYER_SERVICES is required");
    const services = parseServices(servicesJson);
    const store = await Store.open(process.env.MESSAGE_RELAYER_DB?.trim() || "data/message-relayer.db");
    const log = (entry: Record<string, unknown>) =>
        console.log(JSON.stringify({ t: new Date().toISOString(), ...entry }));
    const relayer = new MessageRelayer({
        store,
        services,
        retentionSeconds: number("MESSAGE_RELAYER_RETENTION_DAYS", 365) * 24 * 60 * 60,
        expo: { accessToken: process.env.EXPO_ACCESS_TOKEN?.trim() || undefined },
        log,
    });
    const server = createMessageRelayerServer(relayer, store, {
        publicPerMinute: number("MESSAGE_RELAYER_PUBLIC_PER_MINUTE", 30),
        trustProxy: process.env.MESSAGE_RELAYER_TRUST_PROXY === "1",
    });
    const host = process.env.MESSAGE_RELAYER_HOST?.trim() || "127.0.0.1";
    const port = number("MESSAGE_RELAYER_PORT", 8788);
    await new Promise<void>((resolve) => server.listen(port, host, resolve));
    log({ event: "listening", host, port, services: services.map((s) => `${s.id}:${s.app}`) });

    const sweep = setInterval(() => {
        relayer.sweepReceipts().then(
            (r) => r.checked > 0 && log({ event: "receipts", ...r }),
            (error: unknown) => log({ event: "receipts-failed", reason: String(error) })
        );
    }, 20 * 60 * 1000);
    sweep.unref();

    // The retention rule runs at start and then every day.
    relayer.purge();
    const retention = setInterval(() => relayer.purge(), 24 * 60 * 60 * 1000);
    retention.unref();

    const stop = () => {
        clearInterval(retention);
        clearInterval(sweep);
        server.close(() => {
            store.close();
            process.exit(0);
        });
        setTimeout(() => process.exit(0), 10_000).unref();
    };
    process.on("SIGTERM", stop);
    process.on("SIGINT", stop);
}

const [command, sub, ...rest] = process.argv.slice(2);
const run = command === "keys" && sub === "new" ? Promise.resolve(issueKey(rest)) : start();
run.catch((error: unknown) => {
    console.error(String(error instanceof Error ? error.message : error));
    process.exit(1);
});
