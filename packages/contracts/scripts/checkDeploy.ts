import { existsSync, readFileSync } from "fs";
import { join } from "path";
import hre, { ethers } from "hardhat";

type Addresses = {
    network: string;
    chainId: number;
    forwarder: string;
    factory: string;
    usdc: string;
    instance: string;
    evaluator: string;
};

const ROOT = join(__dirname, "..");
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

function loadAddresses(file: string): Addresses {
    const path = file.startsWith("/") ? file : join(ROOT, file);
    if (!existsSync(path)) throw new Error(`missing ${path}`);
    return JSON.parse(readFileSync(path, "utf8")) as Addresses;
}

function assertNoAdmin(name: string, iface: { functions: Record<string, unknown> }) {
    for (const banned of ABI_FORBIDDEN) {
        if (
            iface.functions[`${banned}()`] !== undefined ||
            Object.keys(iface.functions).some((k) => k.startsWith(`${banned}(`))
        ) {
            throw new Error(`${name} ABI exposes ${banned}`);
        }
    }
}

async function main() {
    const file = process.env.ADDRESSES_FILE ?? `deploy/${hre.network.name}/addresses.json`;
    const addresses = loadAddresses(file);
    const forwarder = await ethers.getContractAt("OpusForwarder", addresses.forwarder);
    const factory = await ethers.getContractAt("OpusACPFactory", addresses.factory);
    const instance = await ethers.getContractAt("OpusAgenticCommerce", addresses.instance);
    const evaluator = await ethers.getContractAt("OptimisticEvaluator", addresses.evaluator);

    if ((await factory.trustedForwarder()) !== addresses.forwarder) throw new Error("factory forwarder mismatch");
    if (!(await instance.isTrustedForwarder(addresses.forwarder))) throw new Error("instance does not trust forwarder");
    if (!(await evaluator.isTrustedForwarder(addresses.forwarder)))
        throw new Error("evaluator does not trust forwarder");
    if ((await instance.factory()) !== addresses.factory) throw new Error("instance factory mismatch");
    if ((await instance.token()) !== addresses.usdc) throw new Error("instance token mismatch");
    if ((await instance.platformTreasury()) !== ethers.constants.AddressZero)
        throw new Error("reference treasury must be 0");
    if (!(await instance.platformFeeBP()).eq(0)) throw new Error("reference fee must be 0");
    if (!(await instance.EVALUATOR_FEE_BP()).eq(0)) throw new Error("evaluatorFeeBP must be 0");
    if ((await factory.instanceOf(addresses.usdc, ethers.constants.AddressZero, 0)) !== addresses.instance) {
        throw new Error("factory instanceOf mismatch");
    }

    assertNoAdmin("OpusAgenticCommerce", instance.interface);
    assertNoAdmin("OpusACPFactory", factory.interface);
    assertNoAdmin("OptimisticEvaluator", evaluator.interface);
    assertNoAdmin("OpusForwarder", forwarder.interface);

    console.log(`OK   post-deploy check ${addresses.network} ${addresses.instance}`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
