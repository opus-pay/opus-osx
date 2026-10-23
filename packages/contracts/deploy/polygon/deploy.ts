import "@nomiclabs/hardhat-ethers";
import hre from "hardhat";

import { addProtocolDeployers } from "../../src/deploy/protocol";
import { Deployments } from "../../src/Deployments";

async function main() {
    if (hre.network.name !== "polygon") {
        throw new Error(
            `This script deploys to Polygon mainnet: run it with --network polygon, not ${hre.network.name}.`
        );
    }
    // Real money: the person running it says so, so a copied command cannot deploy to mainnet by accident.
    if (process.env.CONFIRM_MAINNET !== "yes") {
        throw new Error("This deploys to Polygon mainnet (real money). Set CONFIRM_MAINNET=yes to go on.");
    }
    const deployments = new Deployments("polygon");
    await deployments.initAccounts();
    await deployments.loadContractInfo();
    await addProtocolDeployers(deployments, "polygon");
    await deployments.doDeploy();
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
