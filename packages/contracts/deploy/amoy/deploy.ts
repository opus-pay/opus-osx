import "@nomiclabs/hardhat-ethers";

import { addProtocolDeployers } from "../../src/deploy/protocol";
import { Deployments } from "../../src/Deployments";

async function main() {
    const deployments = new Deployments("amoy");
    await deployments.initAccounts();
    await deployments.loadContractInfo();
    await addProtocolDeployers(deployments, "amoy");
    await deployments.doDeploy();
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
