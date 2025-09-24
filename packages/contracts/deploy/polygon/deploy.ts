import "@nomiclabs/hardhat-ethers";

import { Deployments } from "../../src/Deployments";

async function main() {
    const deployments = new Deployments("polygon");
    await deployments.initAccounts();
    await deployments.loadContractInfo();
    // #22 will add forwarder → factory → USDC instance → OptimisticEvaluator.
    deployments.saveContractInfo();
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
