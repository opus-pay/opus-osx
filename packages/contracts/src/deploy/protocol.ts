import { BaseContract } from "ethers";
import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

import { OptimisticEvaluator, OpusACPFactory, OpusAgenticCommerce, OpusForwarder } from "../../typechain-types";
import { Deployments, FnDeployer, IAccount } from "../Deployments";

export type ProtocolAddresses = {
    network: string;
    chainId: number;
    forwarder: string;
    factory: string;
    usdc: string;
    instance: string;
    evaluator: string;
};

export function listedUsdcAddress(network: string): string | undefined {
    if (network === "amoy") {
        const value = process.env.AMOY_USDC?.trim();
        return value === "" ? undefined : value;
    }
    if (network === "polygon") {
        const value = process.env.POLYGON_USDC?.trim();
        return value === "" ? undefined : value;
    }
    const value = process.env.LISTED_USDC?.trim();
    return value === "" ? undefined : value;
}

export function addressesPath(network: string): string {
    return path.join("deploy", network, "addresses.json");
}

export function writeAddressesJson(network: string, addresses: ProtocolAddresses) {
    const file = addressesPath(network);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(addresses, null, 2)}\n`, "utf-8");
}

async function attachOrDeploy(
    accounts: IAccount,
    deployment: Deployments,
    name: string,
    deploy: () => Promise<{ address: string; contract: BaseContract }>
): Promise<BaseContract> {
    const existing = deployment.getContractAddress(name);
    if (existing !== undefined) {
        const contract = await ethers.getContractAt(name, existing, accounts.deployer);
        console.log(`${name} already at ${existing}`);
        return contract;
    }
    const deployed = await deploy();
    deployment.addContract(name, deployed.address, deployed.contract);
    console.log(`${name} deployed at ${deployed.address}`);
    return deployed.contract;
}

export const deployForwarder: FnDeployer = async (accounts, deployment) => {
    await attachOrDeploy(accounts, deployment, "OpusForwarder", async () => {
        const factory = await ethers.getContractFactory("OpusForwarder", accounts.deployer);
        const contract = (await factory.deploy()) as OpusForwarder;
        await contract.deployed();
        return { address: contract.address, contract };
    });
};

export function deployFactory(usdc: string): FnDeployer {
    return async (accounts, deployment) => {
        const forwarder = deployment.getContractAddress("OpusForwarder");
        if (forwarder === undefined) throw new Error("Deploy OpusForwarder first");
        await attachOrDeploy(accounts, deployment, "OpusACPFactory", async () => {
            const factory = await ethers.getContractFactory("OpusACPFactory", accounts.deployer);
            const contract = (await factory.deploy([usdc], forwarder)) as OpusACPFactory;
            await contract.deployed();
            return { address: contract.address, contract };
        });
    };
}

export function createReferenceInstance(usdc: string): FnDeployer {
    return async (accounts, deployment) => {
        const factoryAddr = deployment.getContractAddress("OpusACPFactory");
        if (factoryAddr === undefined) throw new Error("Deploy OpusACPFactory first");
        const factory = (await ethers.getContractAt(
            "OpusACPFactory",
            factoryAddr,
            accounts.deployer
        )) as OpusACPFactory;
        const existing = await factory.instanceOf(usdc, ethers.constants.AddressZero, 0);
        if (existing !== ethers.constants.AddressZero) {
            const instance = (await ethers.getContractAt(
                "OpusAgenticCommerce",
                existing,
                accounts.deployer
            )) as OpusAgenticCommerce;
            deployment.addContract("OpusAgenticCommerce", existing, instance);
            console.log(`OpusAgenticCommerce already at ${existing}`);
            return;
        }
        const tx = await factory.createInstance(usdc, ethers.constants.AddressZero, 0);
        const receipt = await tx.wait();
        const created = receipt.events?.find((e) => e.event === "InstanceCreated")?.args?.instance as string;
        const instance = (await ethers.getContractAt(
            "OpusAgenticCommerce",
            created,
            accounts.deployer
        )) as OpusAgenticCommerce;
        deployment.addContract("OpusAgenticCommerce", created, instance);
        console.log(`OpusAgenticCommerce created at ${created}`);
    };
}

export const deployEvaluator: FnDeployer = async (accounts, deployment) => {
    const forwarder = deployment.getContractAddress("OpusForwarder");
    if (forwarder === undefined) throw new Error("Deploy OpusForwarder first");
    await attachOrDeploy(accounts, deployment, "OptimisticEvaluator", async () => {
        const factory = await ethers.getContractFactory("OptimisticEvaluator", accounts.deployer);
        const contract = (await factory.deploy(forwarder)) as OptimisticEvaluator;
        await contract.deployed();
        return { address: contract.address, contract };
    });
};

export function writeProtocolAddresses(network: string, usdc: string): FnDeployer {
    return async (_accounts, deployment) => {
        const { chainId } = await ethers.provider.getNetwork();
        const addresses: ProtocolAddresses = {
            network,
            chainId,
            forwarder: required(deployment, "OpusForwarder"),
            factory: required(deployment, "OpusACPFactory"),
            usdc,
            instance: required(deployment, "OpusAgenticCommerce"),
            evaluator: required(deployment, "OptimisticEvaluator"),
        };
        writeAddressesJson(network, addresses);
        console.log(`Wrote ${addressesPath(network)}`);
    };
}

function required(deployment: Deployments, name: string): string {
    const address = deployment.getContractAddress(name);
    if (address === undefined) throw new Error(`Missing ${name}`);
    return address;
}

export async function addProtocolDeployers(deployment: Deployments, network: string): Promise<string> {
    let usdc = listedUsdcAddress(network);
    if (usdc === undefined) {
        if (network === "amoy" || network === "polygon") {
            throw new Error(`${network.toUpperCase()}_USDC must be set in env/.${network}.env (D8: inject at deploy)`);
        }
        const existing = deployment.getContractAddress("MockPermitToken");
        if (existing !== undefined) {
            usdc = existing;
        } else {
            const [deployer] = deployment.accounts !== undefined ? [deployment.accounts.deployer] : [];
            const factory = await ethers.getContractFactory("MockPermitToken", deployer);
            const token = await factory.deploy("USD Coin", "USDC", 6);
            await token.deployed();
            deployment.addContract("MockPermitToken", token.address, token);
            usdc = token.address;
            console.log(`MockPermitToken deployed at ${usdc}`);
        }
    }
    deployment.addDeployer(deployForwarder);
    deployment.addDeployer(deployFactory(usdc));
    deployment.addDeployer(createReferenceInstance(usdc));
    deployment.addDeployer(deployEvaluator);
    deployment.addDeployer(writeProtocolAddresses(network, usdc));
    return usdc;
}
