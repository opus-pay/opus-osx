import { BaseContract } from "ethers";
import { ethers } from "hardhat";

import { BootstrapProbe } from "../../typechain-types";
import { FnDeployer } from "../Deployments";

export async function runBootstrapProbeSmoke(probe: BootstrapProbe, caller: string): Promise<void> {
    const resolved = await probe.openzeppelinModulesResolve();
    if (!resolved) {
        throw new Error("BootstrapProbe: OpenZeppelin modules failed to resolve");
    }

    const domain = await probe.eip712Domain();
    if (domain.name !== "BootstrapProbe" || domain.version !== "1") {
        throw new Error(`BootstrapProbe: EIP-712 domain mismatch (${domain.name} ${domain.version})`);
    }
    if (domain.verifyingContract.toLowerCase() !== probe.address.toLowerCase()) {
        throw new Error("BootstrapProbe: EIP-712 verifyingContract mismatch");
    }

    const copied = await probe.memoryCopy("0xabcd");
    if (copied !== "0xabcd") {
        throw new Error("BootstrapProbe: MCOPY round-trip failed");
    }

    const transient = await probe.callStatic.transientRoundtrip(42);
    if (!transient.eq(42)) {
        throw new Error("BootstrapProbe: transient storage round-trip failed");
    }

    const before = await probe.nonces(caller);
    const tx = await probe.consumeNonce(caller);
    await tx.wait();
    const after = await probe.nonces(caller);
    if (!after.eq(before.add(1))) {
        throw new Error("BootstrapProbe: nonce did not increment");
    }
}

export const deployBootstrapProbe: FnDeployer = async (accounts, deployment) => {
    const existing = deployment.getContractAddress("BootstrapProbe");
    let probe: BootstrapProbe;
    if (existing !== undefined) {
        probe = (await ethers.getContractAt("BootstrapProbe", existing, accounts.deployer)) as BootstrapProbe;
        console.log(`BootstrapProbe already at ${existing}`);
    } else {
        const factory = await ethers.getContractFactory("BootstrapProbe", accounts.deployer);
        const deployed = await factory.deploy();
        await deployed.deployed();
        probe = deployed as BootstrapProbe;
        deployment.addContract("BootstrapProbe", probe.address, probe as BaseContract);
        console.log(`BootstrapProbe deployed at ${probe.address}`);
    }

    const caller = await accounts.deployer.getAddress();
    await runBootstrapProbeSmoke(probe, caller);
    console.log("BootstrapProbe smoke passed");
};
