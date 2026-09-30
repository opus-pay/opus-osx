import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers, network } from "hardhat";
import {
    createPublicClient,
    createWalletClient,
    custom,
    encodeFunctionData,
    getAddress,
    parseSignature,
    zeroHash,
    type Address,
    type Hex,
    type PublicClient,
    type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { Relayer, RelayRejected } from "../../../relayer/src";
import {
    coreAbi,
    descriptionOf,
    erc20Abi,
    evaluatorAbi,
    jobIdFromReceipt,
    localHardhat,
    minimumExpiredAt,
    presetAiToAi,
    signForwardRequest,
    tokenUnitsForUsd,
    type EvaluatorConfig,
    type ForwardRequest,
    type ProtocolAddresses,
} from "../../../sdk/src";
import { MockPermitToken, OptimisticEvaluator, OpusAgenticCommerce, OpusForwarder } from "../../typechain-types";
import { testWallets } from "../helpers/acp";

const BUDGET = tokenUnitsForUsd(100n, 6);
const PERMIT_TYPES = {
    Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
    ],
} as const;

describe("Relayer on a local Hardhat node (#25)", () => {
    const wallets = testWallets();
    const [deployer, gasPayer, operator, , client, provider] = wallets;

    async function zero(address: string) {
        await network.provider.send("hardhat_setBalance", [address, "0x0"]);
    }

    function walletFor(key: string): WalletClient {
        return createWalletClient({
            account: privateKeyToAccount(key as Hex),
            chain: localHardhat,
            transport: custom(network.provider),
        });
    }

    async function world(budgetWei: bigint = 10n ** 18n) {
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
        await token.mint(client.address, BUDGET);
        await zero(client.address);
        await zero(provider.address);
        const relayer = new Relayer(publicClient, walletFor(gasPayer.privateKey), addresses, {
            integrators: [{ id: "errands", token: "secret", budgetWei, maxRequests: 20, windowSeconds: 3600 }],
            blocked: new Set([getAddress(operator.address)]),
        });
        return { token, core, publicClient, addresses, relayer };
    }

    async function relay(
        relayer: Relayer,
        publicClient: PublicClient,
        addresses: ProtocolAddresses,
        wallet: WalletClient,
        to: Address,
        data: Hex
    ) {
        const deadline = Number(await time.latest()) + 3600;
        const signed: ForwardRequest = await signForwardRequest(publicClient, wallet, addresses.forwarder, {
            from: getAddress(wallet.account!.address),
            to,
            value: 0n,
            gas: 2_000_000n,
            deadline,
            data,
        });
        return relayer.submit(signed, "errands", "secret");
    }

    it("completes a job for wallets that hold no POL", async () => {
        const env = await world();
        const config = presetAiToAi({ operator: getAddress(operator.address) });
        const clientWallet = walletFor(client.privateKey);
        const providerWallet = walletFor(provider.privateKey);
        const now = BigInt(await time.latest()) + 300n;
        const created = await env.publicClient.waitForTransactionReceipt({
            hash: await relay(
                env.relayer,
                env.publicClient,
                env.addresses,
                clientWallet,
                env.addresses.instance,
                encodeFunctionData({
                    abi: coreAbi,
                    functionName: "createJob",
                    args: [
                        getAddress(provider.address),
                        env.addresses.evaluator,
                        minimumExpiredAt(now, config),
                        descriptionOf("ipfs://parcel"),
                        env.addresses.evaluator,
                    ],
                })
            ),
        });
        const jobId = jobIdFromReceipt(created.logs);
        await env.publicClient.waitForTransactionReceipt({
            hash: await relay(
                env.relayer,
                env.publicClient,
                env.addresses,
                clientWallet,
                env.addresses.evaluator,
                encodeFunctionData({
                    abi: evaluatorAbi,
                    functionName: "configure",
                    args: [env.addresses.instance, jobId, configTuple(config)],
                })
            ),
        });
        await env.publicClient.waitForTransactionReceipt({
            hash: await relay(
                env.relayer,
                env.publicClient,
                env.addresses,
                clientWallet,
                env.addresses.instance,
                encodeFunctionData({
                    abi: coreAbi,
                    functionName: "setBudget",
                    args: [jobId, BUDGET, "0x"],
                })
            ),
        });
        const permit = await signPermit(env.publicClient, clientWallet, env.addresses, BUDGET);
        await env.publicClient.waitForTransactionReceipt({
            hash: await relay(
                env.relayer,
                env.publicClient,
                env.addresses,
                clientWallet,
                env.addresses.instance,
                encodeFunctionData({
                    abi: coreAbi,
                    functionName: "fundWithPermit",
                    args: [jobId, BUDGET, "0x", permit.deadline, permit.v, permit.r, permit.s],
                })
            ),
        });
        await env.publicClient.waitForTransactionReceipt({
            hash: await relay(
                env.relayer,
                env.publicClient,
                env.addresses,
                providerWallet,
                env.addresses.instance,
                encodeFunctionData({
                    abi: coreAbi,
                    functionName: "submit",
                    args: [jobId, zeroHash, "0x"],
                })
            ),
        });
        await env.publicClient.waitForTransactionReceipt({
            hash: await relay(
                env.relayer,
                env.publicClient,
                env.addresses,
                clientWallet,
                env.addresses.evaluator,
                encodeFunctionData({
                    abi: evaluatorAbi,
                    functionName: "approve",
                    args: [env.addresses.instance, jobId],
                })
            ),
        });
        expect(await env.token.balanceOf(provider.address)).to.equal(BUDGET);
        expect(await ethers.provider.getBalance(client.address)).to.equal(0);
        expect(await ethers.provider.getBalance(provider.address)).to.equal(0);
        expect((await env.core.getJob(jobId)).status).to.equal(3);
    });

    it("refuses native value, unknown targets, sanctioned signers, and a spent budget", async () => {
        const env = await world(1n);
        const clientWallet = walletFor(client.privateKey);
        const deadline = Number(await time.latest()) + 3600;
        const base: ForwardRequest = {
            from: getAddress(client.address),
            to: env.addresses.instance,
            value: 0n,
            gas: 100_000n,
            deadline,
            data: "0x",
            signature: "0x",
        };
        await expectReject(env.relayer.submit({ ...base, value: 1n }, "errands", "secret"), "native value");
        await expectReject(
            env.relayer.submit({ ...base, to: env.addresses.usdc }, "errands", "secret"),
            "not a known OPUS contract"
        );
        await expectReject(
            env.relayer.submit({ ...base, from: getAddress(operator.address) }, "errands", "secret"),
            "sanctions"
        );
        const config = presetAiToAi({ operator: getAddress(operator.address) });
        const signed = await signForwardRequest(env.publicClient, clientWallet, env.addresses.forwarder, {
            from: getAddress(client.address),
            to: env.addresses.instance,
            value: 0n,
            gas: 500_000n,
            deadline,
            data: encodeFunctionData({
                abi: coreAbi,
                functionName: "createJob",
                args: [
                    getAddress(provider.address),
                    env.addresses.evaluator,
                    minimumExpiredAt(BigInt(deadline), config),
                    descriptionOf("ipfs://parcel"),
                    env.addresses.evaluator,
                ],
            }),
        });
        await expectReject(env.relayer.submit(signed, "errands", "secret"), "budget");
    });
});

async function expectReject(pending: Promise<unknown>, message: string) {
    try {
        await pending;
        expect.fail(`expected a rejection containing "${message}"`);
    } catch (error) {
        expect(error).to.be.instanceOf(RelayRejected);
        expect((error as Error).message).to.include(message);
    }
}

function configTuple(config: EvaluatorConfig) {
    return {
        submitWindow: config.submitWindow,
        reviewWindow: config.reviewWindow,
        maxExtension: config.maxExtension,
        depositWindow: config.depositWindow,
        disputeWindow: config.disputeWindow,
        autoCompleteOnSilence: config.autoCompleteOnSilence,
        defaultComplete: config.defaultComplete,
        budgetLock: config.budgetLock,
        arbiter: config.arbiter,
        operator: config.operator,
        evaluationFee: config.evaluationFee,
        keeperTip: config.keeperTip,
        disputeDeposit: config.disputeDeposit,
    };
}

async function signPermit(
    publicClient: PublicClient,
    wallet: WalletClient,
    addresses: ProtocolAddresses,
    value: bigint
) {
    const owner = getAddress(wallet.account!.address);
    const [nonce, name, block] = await Promise.all([
        publicClient.readContract({ address: addresses.usdc, abi: erc20Abi, functionName: "nonces", args: [owner] }),
        publicClient.readContract({ address: addresses.usdc, abi: erc20Abi, functionName: "name" }),
        publicClient.getBlock(),
    ]);
    const deadline = block.timestamp + 3600n;
    const signature = await wallet.signTypedData({
        account: wallet.account!,
        domain: { name, version: "1", chainId: addresses.chainId, verifyingContract: addresses.usdc },
        types: PERMIT_TYPES,
        primaryType: "Permit",
        message: { owner, spender: addresses.instance, value, nonce, deadline },
    });
    const parsed = parseSignature(signature);
    const v = parsed.v ?? (parsed.yParity === 0 ? 27 : 28);
    return { deadline, v: Number(v), r: parsed.r, s: parsed.s };
}
