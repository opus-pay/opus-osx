/**
 * Clears transactions from the deployer that wait forever because their gas price is below
 * what Amoy mines (base fee + a 25 gwei tip). Each waiting nonce is replaced by a 0 POL
 * transfer to the deployer itself at the network's configured gas price, which the Ledger
 * signs. Run it, then run the deploy again.
 *
 *   yarn unstick:amoy                              # uses AMOY_GAS_PRICE_GWEI or 70 gwei
 *   AMOY_GAS_PRICE_GWEI=90 yarn unstick:amoy
 *
 * A replacement must pay at least 10% more than the transaction it replaces.
 */
import { ethers, network } from "hardhat";

import { Deployments } from "../src/Deployments";

async function main() {
    const deployments = new Deployments(network.name);
    await deployments.initAccounts();
    const signer = deployments.accounts!.deployer;
    const address = await signer.getAddress();

    const latest = await ethers.provider.getTransactionCount(address, "latest");
    const pending = await ethers.provider.getTransactionCount(address, "pending");
    const block = await ethers.provider.getBlock("latest");
    const gasPrice = network.config.gasPrice;
    const gwei = (value: unknown) => (Number(value) / 1e9).toFixed(2);
    console.log(`Deployer ${address}`);
    console.log(`Mined nonce ${latest}, pending nonce ${pending}`);
    console.log(`Base fee ${gwei(block.baseFeePerGas)} gwei, configured gas price ${gwei(gasPrice)} gwei`);
    if (typeof gasPrice !== "number") throw new Error(`Set a fixed gasPrice for ${network.name} in hardhat.config.ts`);
    if (block.baseFeePerGas !== null && block.baseFeePerGas !== undefined) {
        const needed = Number(block.baseFeePerGas) + 25e9;
        if (gasPrice < needed) {
            console.warn(
                `The gas price is below base fee + 25 gwei (${gwei(needed)}); set AMOY_GAS_PRICE_GWEI higher.`
            );
        }
    }
    if (pending <= latest) {
        console.log("Nothing is waiting. If the deploy still stops, the node dropped the transaction: run it again.");
        return;
    }
    for (let nonce = latest; nonce < pending; nonce++) {
        console.log(`Replacing nonce ${nonce}: confirm the 0 POL transfer to yourself on the Ledger.`);
        const tx = await signer.sendTransaction({ to: address, value: 0, nonce, gasPrice, gasLimit: 21_000 });
        console.log(`  sent ${tx.hash}`);
        await tx.wait();
        console.log(`  mined`);
    }
    console.log("Done. Run the deploy again.");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
