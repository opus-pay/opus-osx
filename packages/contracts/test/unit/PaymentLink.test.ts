import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers, network } from "hardhat";
import { createPublicClient, createWalletClient, custom, getAddress, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { fundingView, nextFundingAction, runFundingStep, type Draft } from "../../../../apps/pay/src/lib/funding";
import { localHardhat, Opus, tokenUnitsForUsd, type ProtocolAddresses } from "../../../sdk/src";
import { MockPermitToken, OptimisticEvaluator, OpusAgenticCommerce, OpusForwarder } from "../../typechain-types";
import { testWallets } from "../helpers/acp";

describe("Payment link funding (#27)", () => {
    const wallets = testWallets();
    const [deployer, , operator, , client, provider] = wallets;

    async function world() {
        const forwarder = (await (await ethers.getContractFactory("OpusForwarder")).deploy()) as OpusForwarder;
        await forwarder.deployed();
        const token = (await (
            await ethers.getContractFactory("MockPermitToken")
        ).deploy("USD Coin", "USDC", 6)) as MockPermitToken;
        await token.deployed();
        const core = (await (
            await ethers.getContractFactory("OpusAgenticCommerce")
        ).deploy(
            token.address,
            6,
            ethers.constants.AddressZero,
            0,
            forwarder.address,
            ethers.constants.AddressZero
        )) as OpusAgenticCommerce;
        await core.deployed();
        const evaluator = (await (
            await ethers.getContractFactory("OptimisticEvaluator")
        ).deploy(forwarder.address)) as OptimisticEvaluator;
        await evaluator.deployed();
        const addresses: ProtocolAddresses = {
            network: "hardhat",
            chainId: 31337,
            forwarder: getAddress(forwarder.address),
            factory: getAddress(deployer.address),
            usdc: getAddress(token.address),
            instance: getAddress(core.address),
            evaluator: getAddress(evaluator.address),
        };
        const publicClient = createPublicClient({ chain: localHardhat, transport: custom(network.provider) });
        const amount = tokenUnitsForUsd(25n, 6);
        await token.mint(client.address, amount);
        const wallet = (key: string) =>
            createWalletClient({
                account: privateKeyToAccount(key as Hex),
                chain: localHardhat,
                transport: custom(network.provider),
            });
        return {
            amount,
            clientOpus: new Opus(publicClient, addresses, wallet(client.privateKey)),
            providerOpus: new Opus(publicClient, addresses, wallet(provider.privateKey)),
        };
    }

    async function fundFromLink(lock: 1 | 2) {
        const env = await world();
        const draft: Draft = {
            v: 1,
            expiresAt: Number(await time.latest()) + 3600,
            from: getAddress(client.address),
            counterparty: getAddress(provider.address),
            amountUsd: 25,
            preset: "smallNoArbiter",
            agreement: "Film the station and send the file.",
            lock,
            drafter: "client",
        };
        let jobId: bigint | undefined;
        for (let guard = 0; guard < 6; guard++) {
            const view = await fundingView(env.clientOpus, jobId, lock);
            const step = nextFundingAction(view);
            if (step === "funded") break;
            const opus = step.signer === "client" ? env.clientOpus : env.providerOpus;
            jobId = await runFundingStep(opus, step.action, {
                draft,
                jobId,
                now: BigInt(await time.latest()),
                operator: getAddress(operator.address),
            });
        }
        const job = await env.clientOpus.job(jobId as bigint);
        expect(job.status).to.equal("Funded");
        expect(job.client).to.equal(getAddress(client.address));
        expect(job.provider).to.equal(getAddress(provider.address));
        expect(job.budget).to.equal(env.amount);
    }

    it("reaches Funded from one shared link when the client sets the amount", async () => {
        await fundFromLink(2);
    });

    it("reaches Funded from one shared link when the provider quotes", async () => {
        await fundFromLink(1);
    });
});
