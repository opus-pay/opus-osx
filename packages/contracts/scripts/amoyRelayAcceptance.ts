/**
 * Amoy acceptance for #25 and #12.
 * The client and provider sign only. The relayer at RELAY_URL pays the gas.
 * Keys stay in env/.amoy.relay.env. This file does not print them.
 *
 *   cp env/.amoy.relay.env.sample env/.amoy.relay.env
 *   yarn contracts acceptance:relay
 */
import { config as loadEnv } from "dotenv";
import { readFileSync } from "fs";

import {
    createPublicClient,
    createWalletClient,
    encodeFunctionData,
    getAddress,
    http,
    parseAbi,
    parseSignature,
    zeroHash,
    type Address,
    type Hash,
    type Hex,
    type PublicClient,
    type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
    amoy,
    coreAbi,
    descriptionOf,
    erc20Abi,
    evaluatorAbi,
    jobIdFromReceipt,
    loadAddresses,
    minimumExpiredAt,
    presetAiToAi,
    signForwardRequest,
    type EvaluatorConfig,
    type ForwardRequest,
} from "../../sdk/src";
import { readResults, txUrl, writeFlow, type LiveTx } from "./liveResults";

const balanceAbi = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const BUDGET = 1_000000n;
const GAS = 2_000_000n;
const FLOW = "gasless";
const PERMIT_TYPES = {
    Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
    ],
} as const;

loadEnv({ path: "env/.amoy.env" });
loadEnv({ path: "env/.amoy.relay.env", override: true });

async function main(): Promise<void> {
    const clientKey = requiredKey("RELAY_CLIENT_PRIVATE_KEY");
    const providerKey = requiredKey("RELAY_PROVIDER_PRIVATE_KEY");
    const token = requiredEnv("RELAY_INTEGRATOR_TOKEN");
    const integratorId = process.env.RELAY_INTEGRATOR_ID?.trim() || "errands";
    const relayUrl = process.env.RELAY_URL?.trim() || "http://127.0.0.1:8787/relay";
    const operator = getAddress(requiredEnv("OPERATOR_ADDRESS"));
    const rpc = process.env.AMOY_URL?.trim() || amoy.rpcUrls.default.http[0];
    const addresses = loadAddresses(readFileSync("deploy/amoy/addresses.json", "utf8"));
    const publicClient = createPublicClient({ chain: amoy, transport: http(rpc) });
    const client = walletFor(clientKey, rpc);
    const provider = walletFor(providerKey, rpc);
    const clientAddress = getAddress(client.account!.address);
    const providerAddress = getAddress(provider.account!.address);
    if (clientAddress === providerAddress) throw new Error("The client and provider must be different wallets");

    console.log(`client    ${clientAddress}`);
    console.log(`provider  ${providerAddress}`);
    console.log(`operator  ${operator}`);
    console.log(`relayer   ${relayUrl}`);
    await assertPol(publicClient, clientAddress, "client");
    await assertPol(publicClient, providerAddress, "provider");
    const usdc = await publicClient.readContract({
        address: addresses.usdc,
        abi: balanceAbi,
        functionName: "balanceOf",
        args: [clientAddress],
    });
    if (usdc < BUDGET) {
        throw new Error(
            `Client has ${Number(usdc) / 1e6} USDC and needs 1. Send Circle Amoy USDC to ${clientAddress}.`
        );
    }

    const config = presetAiToAi({ operator });
    const txs = new Map(readResults().flows[FLOW]?.transactions.map((row) => [row.name, row]) ?? []);
    let jobId = readResults().flows[FLOW]?.jobId;

    if (jobId === undefined) {
        const now = (await publicClient.getBlock()).timestamp + 300n;
        const hash = await relay(
            relayUrl,
            integratorId,
            token,
            publicClient,
            client,
            addresses.instance,
            encodeFunctionData({
                abi: coreAbi,
                functionName: "createJob",
                args: [
                    providerAddress,
                    addresses.evaluator,
                    minimumExpiredAt(now, config),
                    descriptionOf("ipfs://amoy/gasless"),
                    addresses.evaluator,
                ],
            })
        );
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error(`createJob reverted ${hash}`);
        jobId = jobIdFromReceipt(receipt.logs).toString();
        txs.set("createJob", { name: "createJob", hash, url: txUrl(hash) });
        persist(jobId, txs);
        console.log(`createJob ${jobId} ${hash}`);
    }

    const id = BigInt(jobId);
    await step(
        "configure",
        txs,
        jobId,
        relayUrl,
        integratorId,
        token,
        publicClient,
        client,
        addresses.evaluator,
        encodeFunctionData({
            abi: evaluatorAbi,
            functionName: "configure",
            args: [addresses.instance, id, configTuple(config)],
        })
    );
    await step(
        "setBudget",
        txs,
        jobId,
        relayUrl,
        integratorId,
        token,
        publicClient,
        client,
        addresses.instance,
        encodeFunctionData({
            abi: coreAbi,
            functionName: "setBudget",
            args: [id, BUDGET, "0x"],
        })
    );
    if (!txs.has("fundWithPermit")) {
        const permit = await signPermit(
            publicClient,
            client,
            addresses.usdc,
            addresses.instance,
            addresses.chainId,
            BUDGET
        );
        await step(
            "fundWithPermit",
            txs,
            jobId,
            relayUrl,
            integratorId,
            token,
            publicClient,
            client,
            addresses.instance,
            encodeFunctionData({
                abi: coreAbi,
                functionName: "fundWithPermit",
                args: [id, BUDGET, "0x", permit.deadline, permit.v, permit.r, permit.s],
            })
        );
    }
    await step(
        "submit",
        txs,
        jobId,
        relayUrl,
        integratorId,
        token,
        publicClient,
        provider,
        addresses.instance,
        encodeFunctionData({
            abi: coreAbi,
            functionName: "submit",
            args: [id, zeroHash, "0x"],
        })
    );
    await step(
        "approve",
        txs,
        jobId,
        relayUrl,
        integratorId,
        token,
        publicClient,
        client,
        addresses.evaluator,
        encodeFunctionData({
            abi: evaluatorAbi,
            functionName: "approve",
            args: [addresses.instance, id],
        })
    );

    const job = await publicClient.readContract({
        address: addresses.instance,
        abi: coreAbi,
        functionName: "getJob",
        args: [id],
    });
    const status =
        ["Open", "Funded", "Submitted", "Completed", "Rejected", "Expired"][Number(job.status)] ?? String(job.status);
    const paid = await publicClient.readContract({
        address: addresses.usdc,
        abi: balanceAbi,
        functionName: "balanceOf",
        args: [providerAddress],
    });
    await assertPol(publicClient, clientAddress, "client");
    await assertPol(publicClient, providerAddress, "provider");
    if (status !== "Completed") throw new Error(`Job ${jobId} is ${status}`);
    if (paid < BUDGET) throw new Error(`Provider has ${Number(paid) / 1e6} USDC`);
    persist(jobId, txs, status);
    console.log(`gasless job ${jobId} ${status}`);
    console.log(`provider USDC ${Number(paid) / 1e6}`);
}

async function step(
    name: string,
    txs: Map<string, LiveTx>,
    jobId: string,
    relayUrl: string,
    integratorId: string,
    token: string,
    publicClient: PublicClient,
    wallet: WalletClient,
    to: Address,
    data: Hex
): Promise<void> {
    if (txs.has(name)) return;
    const hash = await relay(relayUrl, integratorId, token, publicClient, wallet, to, data);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`${name} reverted ${hash}`);
    txs.set(name, { name, hash, url: txUrl(hash) });
    persist(jobId, txs);
    console.log(`${name} ${hash}`);
}

async function relay(
    relayUrl: string,
    integratorId: string,
    token: string,
    publicClient: PublicClient,
    wallet: WalletClient,
    to: Address,
    data: Hex
): Promise<Hash> {
    const deadline = Number((await publicClient.getBlock()).timestamp) + 3600;
    const signed: ForwardRequest = await signForwardRequest(publicClient, wallet, loadForwarder(), {
        from: getAddress(wallet.account!.address),
        to,
        value: 0n,
        gas: GAS,
        deadline,
        data,
    });
    const response = await fetch(relayUrl, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
            integratorId,
            request: {
                from: signed.from,
                to: signed.to,
                value: signed.value.toString(),
                gas: signed.gas.toString(),
                deadline: signed.deadline,
                data: signed.data,
                signature: signed.signature,
            },
        }),
    });
    const body = (await response.json()) as { hash?: string; error?: string };
    if (!response.ok || body.hash === undefined) {
        throw new Error(body.error ?? `Relayer returned ${response.status}`);
    }
    return body.hash as Hash;
}

function loadForwarder(): Address {
    return loadAddresses(readFileSync("deploy/amoy/addresses.json", "utf8")).forwarder;
}

function persist(jobId: string, txs: Map<string, LiveTx>, status?: string): void {
    writeFlow(FLOW, {
        issues: ["#25", "#12"],
        jobId,
        ...(status === undefined ? {} : { status }),
        transactions: [...txs.values()],
    });
}

async function signPermit(
    publicClient: PublicClient,
    wallet: WalletClient,
    usdc: Address,
    spender: Address,
    chainId: number,
    value: bigint
) {
    const owner = getAddress(wallet.account!.address);
    const versionAbi = parseAbi(["function version() view returns (string)"]);
    const [nonce, name, version, block] = await Promise.all([
        publicClient.readContract({ address: usdc, abi: erc20Abi, functionName: "nonces", args: [owner] }),
        publicClient.readContract({ address: usdc, abi: erc20Abi, functionName: "name" }),
        publicClient.readContract({ address: usdc, abi: versionAbi, functionName: "version" }),
        publicClient.getBlock(),
    ]);
    const deadline = block.timestamp + 3600n;
    const signature = await wallet.signTypedData({
        account: wallet.account!,
        domain: { name, version, chainId, verifyingContract: usdc },
        types: PERMIT_TYPES,
        primaryType: "Permit",
        message: { owner, spender, value, nonce, deadline },
    });
    const parsed = parseSignature(signature);
    const v = parsed.v ?? (parsed.yParity === 0 ? 27 : 28);
    return { deadline, v: Number(v), r: parsed.r, s: parsed.s };
}

function walletFor(key: Hex, rpc: string): WalletClient {
    return createWalletClient({
        account: privateKeyToAccount(key),
        chain: amoy,
        transport: http(rpc),
    });
}

async function assertPol(publicClient: PublicClient, address: Address, label: string): Promise<void> {
    const balance = await publicClient.getBalance({ address });
    if (balance !== 0n) {
        throw new Error(`${label} ${address} has ${Number(balance) / 1e18} POL. #25 needs a wallet with 0 POL.`);
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

function requiredEnv(name: string): string {
    const value = process.env[name]?.trim();
    if (value === undefined || value === "") throw new Error(`${name} is required`);
    return value;
}

function requiredKey(name: string): Hex {
    const value = requiredEnv(name);
    if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error(`${name} must be a 32-byte hex string`);
    return value as Hex;
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
