/**
 * Prometheus text format (version 0.0.4) without a library: the services only need gauges and counters, and
 * every value is read from state that already exists when `/metrics` is scraped, so there is nothing to
 * register and nothing to keep in step. Counters are monotonic totals the caller keeps; names follow the
 * Prometheus conventions (`_total` for counters, base units such as seconds, and POL as a plain number).
 */
export type Labels = Record<string, string>;
export type Sample = {
    name: string;
    help: string;
    type: "gauge" | "counter";
    value: number | bigint;
    labels?: Labels;
};

export const METRICS_CONTENT_TYPE = "text/plain; version=0.0.4; charset=utf-8";

const NAME = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/;
const LABEL = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

const escapeHelp = (text: string) => text.replace(/\\/g, "\\\\").replace(/\n/g, "\\n");
const escapeLabel = (text: string) => text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");

function format(value: number | bigint): string {
    const number = typeof value === "bigint" ? Number(value) : value;
    if (Number.isNaN(number)) return "NaN";
    if (number === Infinity) return "+Inf";
    if (number === -Infinity) return "-Inf";
    return String(number);
}

/** A wei amount as a plain number of coins (18 decimals), for balance gauges. */
export const coins = (wei: bigint): number => Number(wei) / 1e18;

/** The samples as one scrape answer. Samples of one name are grouped under a single HELP and TYPE. */
export function renderMetrics(samples: readonly Sample[]): string {
    const groups = new Map<string, Sample[]>();
    for (const sample of samples) {
        if (!NAME.test(sample.name)) throw new Error(`invalid metric name ${sample.name}`);
        const group = groups.get(sample.name);
        if (group === undefined) groups.set(sample.name, [sample]);
        else group.push(sample);
    }
    const lines: string[] = [];
    for (const [name, group] of groups) {
        lines.push(`# HELP ${name} ${escapeHelp(group[0].help)}`, `# TYPE ${name} ${group[0].type}`);
        for (const sample of group) {
            const labels = Object.entries(sample.labels ?? {});
            for (const [label] of labels) if (!LABEL.test(label)) throw new Error(`invalid label name ${label}`);
            const text = labels.map(([label, value]) => `${label}="${escapeLabel(value)}"`).join(",");
            lines.push(`${name}${text === "" ? "" : `{${text}}`} ${format(sample.value)}`);
        }
    }
    return `${lines.join("\n")}\n`;
}
