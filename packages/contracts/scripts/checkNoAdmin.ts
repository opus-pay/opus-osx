import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const ROOT = join(__dirname, "..");
const SOURCE_DIRS = ["contracts/acp", "contracts/evaluators", "contracts/forwarder"];
const SOURCE_FORBIDDEN = [
    "Ownable",
    "AccessControl",
    "Pausable",
    "delegatecall",
    "selfdestruct",
    "upgradeTo",
    "UUPSUpgradeable",
    "TransparentUpgradeableProxy",
    "ERC1967Proxy",
];
const ABI_FORBIDDEN = [
    "transferOwnership",
    "grantRole",
    "revokeRole",
    "renounceRole",
    "pause",
    "unpause",
    "setOwner",
    "setAdmin",
    "setPlatformFee",
    "setEvaluatorFee",
    "setTrustedForwarder",
    "upgradeTo",
    "upgradeToAndCall",
];
const ARTIFACTS = [
    "artifacts/contracts/acp/OpusAgenticCommerce.sol/OpusAgenticCommerce.json",
    "artifacts/contracts/acp/OpusACPFactory.sol/OpusACPFactory.json",
    "artifacts/contracts/evaluators/OptimisticEvaluator.sol/OptimisticEvaluator.json",
    "artifacts/contracts/forwarder/OpusForwarder.sol/OpusForwarder.json",
];

function walk(dir: string): string[] {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) out.push(...walk(full));
        else if (name.endsWith(".sol")) out.push(full);
    }
    return out;
}

function main() {
    let failed = false;

    for (const dir of SOURCE_DIRS) {
        for (const file of walk(join(ROOT, dir))) {
            const text = readFileSync(file, "utf8");
            const rel = relative(ROOT, file);
            for (const needle of SOURCE_FORBIDDEN) {
                if (text.includes(needle)) {
                    console.error(`FAIL ${rel} contains ${needle}`);
                    failed = true;
                }
            }
        }
    }

    for (const artifact of ARTIFACTS) {
        const path = join(ROOT, artifact);
        if (!existsSync(path)) {
            console.error(`FAIL missing artifact ${artifact} — compile first`);
            failed = true;
            continue;
        }
        const json = JSON.parse(readFileSync(path, "utf8")) as { abi: { type: string; name?: string }[] };
        const names = new Set(json.abi.filter((item) => item.type === "function").map((item) => item.name ?? ""));
        for (const banned of ABI_FORBIDDEN) {
            if (names.has(banned)) {
                console.error(`FAIL ${artifact} ABI exposes ${banned}`);
                failed = true;
            }
        }
    }

    if (failed) process.exit(1);
    console.log("OK   no-admin source and ABI check (I-6)");
}

main();
