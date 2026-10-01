import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";

const EXPLORER = "https://amoy.polygonscan.com/tx/";

export type LiveTx = { name: string; hash: string; url: string };
export type LiveFlow = { issues: string[]; jobId?: string; status?: string; transactions: LiveTx[] };
export type LiveResults = { network: "amoy"; flows: Record<string, LiveFlow> };

export function txUrl(hash: string): string {
    return `${EXPLORER}${hash}`;
}

export function resultsPath(): string {
    return join(__dirname, "../../../docs/runbooks/amoy-live-results.json");
}

export function readResults(): LiveResults {
    try {
        return JSON.parse(readFileSync(resultsPath(), "utf8")) as LiveResults;
    } catch {
        return { network: "amoy", flows: {} };
    }
}

/** Replace one flow and keep every other flow already in the file. */
export function writeFlow(name: string, flow: LiveFlow): void {
    const doc = readResults();
    const previous = doc.flows[name];
    doc.network = "amoy";
    doc.flows[name] = {
        ...flow,
        status: flow.status ?? previous?.status,
        jobId: flow.jobId ?? previous?.jobId,
        transactions: mergeTransactions(previous?.transactions, flow.transactions),
    };
    const path = resultsPath();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(doc, null, 2)}\n`);
}

function mergeTransactions(previous: LiveTx[] | undefined, next: LiveTx[]): LiveTx[] {
    const byName = new Map<string, LiveTx>();
    const order: string[] = [];
    for (const tx of previous ?? []) {
        byName.set(tx.name, tx);
        order.push(tx.name);
    }
    for (const tx of next) {
        byName.set(tx.name, tx);
        if (!order.includes(tx.name)) order.push(tx.name);
    }
    return order.map((name) => byName.get(name) as LiveTx);
}

export function flowFromHashes(
    issues: string[],
    hashes: Record<string, string>,
    jobId?: string,
    status?: string
): LiveFlow {
    return {
        issues,
        ...(jobId === undefined ? {} : { jobId }),
        ...(status === undefined ? {} : { status }),
        transactions: Object.entries(hashes).map(([name, hash]) => ({ name, hash, url: txUrl(hash) })),
    };
}
