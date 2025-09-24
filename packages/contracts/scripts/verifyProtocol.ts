import { readFileSync } from "fs";
import { join } from "path";
import hre, { ethers } from "hardhat";

import { addressesPath } from "../src/deploy/protocol";

async function main() {
    const file = process.env.ADDRESSES_FILE ?? addressesPath(hre.network.name);
    const addresses = JSON.parse(readFileSync(join(__dirname, "..", file), "utf8")) as {
        forwarder: string;
        factory: string;
        usdc: string;
        instance: string;
        evaluator: string;
    };
    const token = new ethers.Contract(addresses.usdc, ["function decimals() view returns (uint8)"], ethers.provider);
    const decimals: number = await token.decimals();

    const jobs: { address: string; contract: string; constructorArguments: unknown[] }[] = [
        {
            address: addresses.forwarder,
            contract: "contracts/forwarder/OpusForwarder.sol:OpusForwarder",
            constructorArguments: [],
        },
        {
            address: addresses.factory,
            contract: "contracts/acp/OpusACPFactory.sol:OpusACPFactory",
            constructorArguments: [[addresses.usdc], addresses.forwarder],
        },
        {
            address: addresses.instance,
            contract: "contracts/acp/OpusAgenticCommerce.sol:OpusAgenticCommerce",
            constructorArguments: [
                addresses.usdc,
                decimals,
                ethers.constants.AddressZero,
                0,
                addresses.forwarder,
                addresses.factory,
            ],
        },
        {
            address: addresses.evaluator,
            contract: "contracts/evaluators/OptimisticEvaluator.sol:OptimisticEvaluator",
            constructorArguments: [addresses.forwarder],
        },
    ];

    for (const job of jobs) {
        try {
            await hre.run("verify:verify", job);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (message.toLowerCase().includes("already verified")) {
                console.log(`already verified ${job.address}`);
                continue;
            }
            throw error;
        }
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
