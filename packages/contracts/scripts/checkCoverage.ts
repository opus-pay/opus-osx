import { readFileSync } from "fs";
import { resolve } from "path";

type FileCoverage = {
    s?: Record<string, number>;
    l?: Record<string, number>;
    b?: Record<string, number[]>;
};

const FILES: { path: string; stmt: number; line: number; branch: number }[] = [
    { path: "contracts/acp/OpusAgenticCommerce.sol", stmt: 95, line: 95, branch: 88 },
    { path: "contracts/acp/OpusACPFactory.sol", stmt: 95, line: 95, branch: 95 },
    { path: "contracts/evaluators/OptimisticEvaluator.sol", stmt: 95, line: 95, branch: 82 },
];

function ratio(hit: number, total: number): number {
    return total === 0 ? 100 : (hit / total) * 100;
}

function stats(file: FileCoverage) {
    const stmtVals = Object.values(file.s ?? {});
    const lineVals = Object.values(file.l ?? {});
    const branches = Object.values(file.b ?? {}).flat();
    return {
        stmt: ratio(stmtVals.filter((n) => n > 0).length, stmtVals.length),
        line: ratio(lineVals.filter((n) => n > 0).length, lineVals.length),
        branch: ratio(branches.filter((n) => n > 0).length, branches.length),
    };
}

function main() {
    const report = JSON.parse(readFileSync(resolve(__dirname, "../coverage.json"), "utf8")) as Record<
        string,
        FileCoverage
    >;
    const keys = Object.keys(report);
    let failed = false;

    for (const required of FILES) {
        const key = keys.find((k) => k.replace(/\\/g, "/").endsWith(required.path));
        if (!key) {
            console.error(`missing coverage for ${required.path}`);
            failed = true;
            continue;
        }
        const got = stats(report[key]);
        const checks: [string, number, number][] = [
            ["stmts", got.stmt, required.stmt],
            ["lines", got.line, required.line],
            ["branches", got.branch, required.branch],
        ];
        for (const [label, value, min] of checks) {
            const line = `${required.path} ${label}: ${value.toFixed(2)}% (min ${min})`;
            if (value + 1e-9 < min) {
                console.error(`FAIL ${line}`);
                failed = true;
            } else {
                console.log(`OK   ${line}`);
            }
        }
    }

    if (failed) process.exit(1);
}

main();
