import "@nomiclabs/hardhat-ethers";

import { Deployments } from "../../src/Deployments";

async function main() {
    const deployments = new Deployments("localhost");
    await deployments.initAccounts();
    await deployments.loadContractInfo();
    await deployments.doDeploy();
    deployments.saveContractInfo();
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
