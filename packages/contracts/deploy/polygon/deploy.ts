import "@nomiclabs/hardhat-ethers";

import { deployBootstrapProbe } from "../../src/deploy/bootstrapProbe";
import { Deployments } from "../../src/Deployments";

async function main() {
    const deployments = new Deployments("polygon");
    await deployments.initAccounts();
    await deployments.loadContractInfo();
    deployments.addDeployer(deployBootstrapProbe);
    await deployments.doDeploy();
    deployments.saveContractInfo();
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
