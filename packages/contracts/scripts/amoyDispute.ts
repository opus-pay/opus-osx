/**
 * Amoy acceptance for a dispute (AMOY_LIVE_ACCEPTANCE.md, section 7).
 * Client, provider and arbiter are three Ledger HD accounts. The deployer does not sign.
 *
 *   DISPUTE_ARBITER=0x... yarn contracts dispute:amoy
 *   DISPUTE_ARBITER=0x... DISPUTE_PHASE=status yarn contracts dispute:amoy
 *
 * The run takes a few minutes and needs no waiting: the client objects right after the
 * provider submits, the provider posts its deposit, and the arbiter rules, all inside
 * the one-hour windows of presetPersonToAny.
 *
 * In confirmation mode `configure` already takes the client's dispute deposit, so
 * `object` takes nothing more. The provider's deposit makes the case go to the arbiter.
 * DISPUTE_RULING=reject (default) refunds the client and pays the provider's deposit to
 * the arbiter. DISPUTE_RULING=complete pays the provider and the client's deposit to the arbiter.
 *
 * Every transaction is saved to deploy/amoy/dispute.json as soon as it is mined,
 * so a run that stops halfway continues from where it stopped.
 */
import { readFileSync, writeFileSync } from "fs";

import { network } from "hardhat";
import {
    createPublicClient,
    createWalletClient,
    custom,
    getAddress,
    keccak256,
    parseAbi,
    stringToHex,
    type Address,
    type Hash,
    type PublicClient,
    zeroAddress,
} from "viem";

import { amoy, loadAddresses, minimumExpiredAt, Opus, presetPersonToAny } from "../../sdk/src";
import { flowFromHashes, writeFlow } from "./liveResults";

const CLIENT: Address = "0x7b88b2324289d42C5972957eC09bfb9C7a7ECda0";
const PROVIDER: Address = "0xC012a2ab8C2949eC870c0A923c2EE7120474F7Be";
const OUT = "deploy/amoy/dispute.json";
const BUDGET = 1_000000n;
const DEPOSIT = 100_000n;
const SLACK = 600n;
const DELIVERABLE = keccak256(stringToHex("Amoy dispute deliverable."));
const EVIDENCE = keccak256(stringToHex("Amoy dispute: the client says the file is wrong."));

const erc20Abi = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const ruleAbi = parseAbi(["function rule(address instance, uint256 jobId, bool completed, bytes32 reasonHash)"]);
const createdAbi = parseAbi([
    "event JobCreated(uint256 indexed jobId, address indexed client, address indexed provider, address evaluator, uint256 expiredAt, address hook)",
]);

type Hashes = Record<string, Hash>;
type RecordFile = {
    network: "amoy";
    client: Address;
    provider: Address;
    arbiter: Address;
    /** The escrow instance the job ran on. Missing in records from the first Amoy deployment. */
    instance?: Address;
    ruling: "reject" | "complete";
    id?: string;
    hashes: Hashes;
};

async function main(): Promise<void> {
    const phase = process.env.DISPUTE_PHASE?.trim() || "run";
    const ruling = readRuling();
    const addresses = loadAddresses(readFileSync("deploy/amoy/addresses.json", "utf8"));
    const arbiter = getAddress(requiredEnv("DISPUTE_ARBITER"));
    const client = getAddress(CLIENT);
    const provider = getAddress(PROVIDER);
    if (arbiter === client || arbiter === provider)
        throw new Error("The arbiter must be neither the client nor the provider");

    const publicClient = createPublicClient({ chain: amoy, transport: custom(network.provider) });
    const clientOpus = opusFor(publicClient, addresses, client);
    const providerOpus = opusFor(publicClient, addresses, provider);
    const arbiterWallet = createWalletClient({ account: arbiter, chain: amoy, transport: custom(network.provider) });
    const file = loadRecord(client, provider, arbiter, ruling, addresses.instance as Address);
    if (file.arbiter !== arbiter) throw new Error(`${OUT} was started with arbiter ${file.arbiter}`);

    console.log(`client    ${client}`);
    console.log(`provider  ${provider}`);
    console.log(`arbiter   ${arbiter}`);
    console.log(`ruling    ${file.ruling}`);

    if (phase === "status") {
        await printStatus(clientOpus, file);
        return;
    }
    if (phase !== "run") throw new Error("DISPUTE_PHASE must be run or status");

    const config = presetPersonToAny({ operator: zeroAddress, arbiter, disputeDeposit: DEPOSIT });
    if (file.id === undefined) await assertBalances(publicClient, addresses.usdc, client, provider, arbiter);

    // 1. The client creates and configures the job. configure takes the client's deposit.
    let jobId: bigint;
    if (file.id === undefined) {
        const fromBlock = await publicClient.getBlockNumber();
        const now = (await publicClient.getBlock()).timestamp + SLACK;
        console.log("Ledger (client): confirm createJob");
        jobId = await clientOpus.createJob({
            provider,
            expiredAt: minimumExpiredAt(now, config),
            description: "ipfs://amoy/dispute",
        });
        const logs = await publicClient.getLogs({
            address: addresses.instance,
            event: createdAbi[0],
            args: { jobId },
            fromBlock,
        });
        const hash = logs[0]?.transactionHash;
        if (hash === undefined) throw new Error("JobCreated receipt was not found");
        file.id = jobId.toString();
        file.hashes.createJob = hash;
        console.log(`createJob ${jobId} ${hash}`);
        save(file);
    } else {
        jobId = BigInt(file.id);
    }

    let job = await clientOpus.job(jobId);
    if (job.status === "Open") {
        if (job.budget === 0n)
            await send(publicClient, file, "client", "setBudget", () => clientOpus.quote(jobId, BUDGET));
        await send(publicClient, file, "client", "approveDeposit", () => clientOpus.approveEvaluation(DEPOSIT));
        await send(publicClient, file, "client", "configure", () => clientOpus.configure(jobId, config));
        // 2. The client funds 1 USDC.
        await send(publicClient, file, "client", "approveBudget", () => clientOpus.approveBudget(BUDGET));
        await send(publicClient, file, "client", "fund", () => clientOpus.fund(jobId, BUDGET));
        job = await clientOpus.job(jobId);
    }

    // 3. The provider submits.
    if (job.status === "Funded") {
        await send(publicClient, file, "provider", "submit", () => providerOpus.submit(jobId, DELIVERABLE, BUDGET));
    }

    // 4. The client objects during the review window.
    await send(publicClient, file, "client", "object", () => clientOpus.object(jobId, EVIDENCE));

    // 5. The provider posts its deposit. The case goes to the arbiter.
    await send(publicClient, file, "provider", "approveDeposit_provider", () =>
        providerOpus.approveEvaluation(DEPOSIT)
    );
    await send(publicClient, file, "provider", "postDeposit", () => providerOpus.postDeposit(jobId));

    // 6. The arbiter rules.
    const completed = file.ruling === "complete";
    const reason = keccak256(stringToHex(`Amoy dispute ruling: ${file.ruling}.`));
    await send(publicClient, file, "arbiter", "rule", () =>
        arbiterWallet.writeContract({
            address: addresses.evaluator,
            abi: ruleAbi,
            functionName: "rule",
            args: [addresses.instance, jobId, completed, reason],
        })
    );

    await printStatus(clientOpus, file);
    await printBalances(publicClient, addresses.usdc, file);
}

function opusFor(publicClient: PublicClient, addresses: ReturnType<typeof loadAddresses>, account: Address): Opus {
    return new Opus(
        publicClient,
        addresses,
        createWalletClient({ account, chain: amoy, transport: custom(network.provider) })
    );
}

async function send(
    publicClient: PublicClient,
    file: RecordFile,
    signer: "client" | "provider" | "arbiter",
    label: string,
    start: () => Promise<Hash>
): Promise<void> {
    if (file.hashes[label] !== undefined) return;
    console.log(`Ledger (${signer}): confirm ${label}`);
    const hash = await start();
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`${label} reverted ${hash}`);
    file.hashes[label] = hash;
    console.log(`${label} ${hash}`);
    save(file);
}

async function assertBalances(
    publicClient: PublicClient,
    usdc: Address,
    client: Address,
    provider: Address,
    arbiter: Address
): Promise<void> {
    const usdcOfAccount = (account: Address) =>
        publicClient.readContract({ address: usdc, abi: erc20Abi, functionName: "balanceOf", args: [account] });
    const clientUsdc = await usdcOfAccount(client);
    const providerUsdc = await usdcOfAccount(provider);
    if (clientUsdc < BUDGET + DEPOSIT) {
        throw new Error(`Client has ${usdcOf(clientUsdc)} USDC and needs ${usdcOf(BUDGET + DEPOSIT)}.`);
    }
    if (providerUsdc < DEPOSIT) {
        throw new Error(`Provider has ${usdcOf(providerUsdc)} USDC and needs ${usdcOf(DEPOSIT)} for its deposit.`);
    }
    const needs: Array<[string, Address, bigint]> = [
        ["Client", client, 100_000_000_000_000_000n],
        ["Provider", provider, 30_000_000_000_000_000n],
        ["Arbiter", arbiter, 20_000_000_000_000_000n],
    ];
    for (const [name, account, minimum] of needs) {
        const pol = await publicClient.getBalance({ address: account });
        if (pol < minimum)
            throw new Error(`${name} has ${polOf(pol)} POL. Send at least ${polOf(minimum)} POL to ${account}.`);
    }
}

async function printStatus(opus: Opus, file: RecordFile): Promise<void> {
    if (file.id === undefined) {
        console.log("dispute job: not created");
        return;
    }
    const job = await opus.job(BigInt(file.id));
    console.log(`dispute job ${file.id} ${job.status}`);
    for (const [label, hash] of Object.entries(file.hashes)) console.log(`  ${label.padEnd(15)} ${hash}`);
}

async function printBalances(publicClient: PublicClient, usdc: Address, file: RecordFile): Promise<void> {
    for (const [name, account] of [
        ["client", file.client],
        ["provider", file.provider],
        ["arbiter", file.arbiter],
    ] as const) {
        const balance = await publicClient.readContract({
            address: usdc,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [account],
        });
        console.log(`${name.padEnd(9)} ${usdcOf(balance)} USDC`);
    }
}

function loadRecord(
    client: Address,
    provider: Address,
    arbiter: Address,
    ruling: RecordFile["ruling"],
    instance: Address
): RecordFile {
    let parsed: RecordFile;
    try {
        parsed = JSON.parse(readFileSync(OUT, "utf8")) as RecordFile;
    } catch {
        return { network: "amoy", client, provider, arbiter, ruling, instance, hashes: {} };
    }
    // A record from another deployment would make this run skip steps and read the wrong job.
    if (parsed.instance?.toLowerCase() !== instance.toLowerCase()) {
        throw new Error(
            `${OUT} belongs to ${
                parsed.instance ?? "the first Amoy deployment"
            }, not ${instance}. Rename it to keep it, then run again.`
        );
    }
    return parsed;
}

function save(file: RecordFile): void {
    writeFileSync(OUT, `${JSON.stringify(file, null, 4)}\n`);
    writeFlow("dispute", flowFromHashes([], file.hashes, file.id));
}

function readRuling(): RecordFile["ruling"] {
    const value = process.env.DISPUTE_RULING?.trim() || "reject";
    if (value !== "reject" && value !== "complete") throw new Error("DISPUTE_RULING must be reject or complete");
    return value;
}

function requiredEnv(name: string): string {
    const value = process.env[name]?.trim();
    if (value === undefined || value === "") throw new Error(`${name} is required`);
    return value;
}

function usdcOf(amount: bigint): string {
    return (Number(amount) / 1e6).toString();
}

function polOf(amount: bigint): string {
    return (Number(amount) / 1e18).toString();
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
