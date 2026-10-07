/**
 * Amoy acceptance for #23 and #24.
 * Client and provider are HD accounts. The deployer does not sign these jobs.
 *
 *   yarn contracts acceptance:amoy
 *   ACCEPTANCE_PHASE=finish yarn contracts acceptance:amoy
 *   ACCEPTANCE_PHASE=status yarn contracts acceptance:amoy
 *
 * setup completes the approve flow and leaves three jobs for later.
 * About one hour later, `yarn keeper start` finalizes the silent job and rejects the unsubmitted one.
 * About three hours after setup, finish runs claimRefund and sweep.
 */
import { readFileSync, writeFileSync } from "fs";

import { ethers, network } from "hardhat";
import {
    createPublicClient,
    createWalletClient,
    custom,
    getAddress,
    parseAbi,
    zeroHash,
    type Address,
    type Hash,
    type PublicClient,
} from "viem";

import {
    amoy,
    amoyGasPrice,
    evaluatorAbi,
    loadAddresses,
    minimumExpiredAt,
    Opus,
    presetAiToAi,
    type EvaluatorConfig,
} from "../../sdk/src";
import { flowFromHashes, writeFlow } from "./liveResults";

const CLIENT: Address = "0x7b88b2324289d42C5972957eC09bfb9C7a7ECda0";
const PROVIDER: Address = "0xC012a2ab8C2949eC870c0A923c2EE7120474F7Be";
const OUT = "deploy/amoy/acceptance.json";
const BUDGET = 1_000000n;
/** The evaluator caps the fee at 20% of the budget (since 2026-10-03), and two tips must fit in it. */
const FEE = 200_000n;
const TIP = 100_000n;
const FEE_CAP_BP = 2_000n;
/**
 * Seconds added to the job's deadline beyond the evaluator's minimum. Every step before `fund` waits
 * for a Ledger confirmation, and `fund` is refused once the deadline no longer fits its windows.
 * Ten minutes was not enough on 2026-10-08.
 */
const SLACK = 1800n;
/** Time allowed for the `fund` confirmation itself when checking that the deadline still fits. */
const FUND_SLACK = 300n;

const erc20Abi = parseAbi(["function balanceOf(address) view returns (uint256)"]);
const rejectAbi = parseAbi(["function reject(uint256 jobId, bytes32 reason, bytes optParams)"]);
const createdAbi = parseAbi([
    "event JobCreated(uint256 indexed jobId, address indexed client, address indexed provider, address evaluator, uint256 expiredAt, address hook)",
]);

type Hashes = Record<string, Hash>;
type JobRecord = {
    id?: string;
    expiredAt?: string;
    dueAt?: string;
    hashes: Hashes;
    /** Jobs given up because their deadline no longer fit before `fund`; rejected and swept. */
    abandoned?: { id: string; hashes: Hashes }[];
};
type RecordFile = {
    network: "amoy";
    client: Address;
    provider: Address;
    operator: Address;
    /** The escrow instance the jobs ran on. Missing in records from the first Amoy deployment. */
    instance?: Address;
    jobs: { approve: JobRecord; sweep: JobRecord; finalize: JobRecord; timeout: JobRecord };
};

async function main(): Promise<void> {
    const phase = process.env.ACCEPTANCE_PHASE?.trim() || "setup";
    const addresses = loadAddresses(readFileSync("deploy/amoy/addresses.json", "utf8"));
    const operator = getAddress(requiredEnv("OPERATOR_ADDRESS"));
    const transport = custom(network.provider);
    const publicClient = createPublicClient({ chain: amoy, transport });
    const client = getAddress(CLIENT);
    const provider = getAddress(PROVIDER);
    const clientOpus = opusFor(publicClient, addresses, client);
    const providerOpus = opusFor(publicClient, addresses, provider);
    const file = loadRecord(client, provider, operator, addresses.instance as Address);

    console.log(`client    ${client}`);
    console.log(`provider  ${provider}`);
    console.log(`operator  ${operator}`);
    console.log("Confirm each prompt on the Ledger for that HD account.");

    if (phase === "status") {
        await printStatus(publicClient, clientOpus, file);
        return;
    }
    if (phase === "finish") {
        await finishSweep(publicClient, clientOpus, file);
        return;
    }
    if (phase !== "setup") throw new Error("ACCEPTANCE_PHASE must be setup, finish, or status");

    await assertBalances(publicClient, addresses.usdc, client, provider);
    await runApprove(publicClient, clientOpus, providerOpus, file);
    await runHeld(publicClient, clientOpus, file.jobs.sweep, provider, operator, "ipfs://amoy/sweep", false);
    file.jobs.sweep.expiredAt = (await clientOpus.job(requiredId(file.jobs.sweep))).expiredAt.toString();
    save(file);
    await runHeld(
        publicClient,
        clientOpus,
        file.jobs.finalize,
        provider,
        operator,
        "ipfs://amoy/finalize",
        true,
        providerOpus
    );
    file.jobs.finalize.dueAt = (
        await clientOpus.status(requiredId(file.jobs.finalize), client)
    ).nextDeadline?.toString();
    save(file);
    await runHeld(publicClient, clientOpus, file.jobs.timeout, provider, operator, "ipfs://amoy/timeout", true);
    file.jobs.timeout.dueAt = (await clientOpus.status(requiredId(file.jobs.timeout), client)).nextDeadline?.toString();
    save(file);
    await printStatus(publicClient, clientOpus, file);
}

function opusFor(publicClient: PublicClient, addresses: ReturnType<typeof loadAddresses>, account: Address): Opus {
    return new Opus(
        publicClient,
        addresses,
        createWalletClient({ account, chain: amoy, transport: custom(network.provider) })
    );
}

async function runApprove(
    publicClient: PublicClient,
    clientOpus: Opus,
    providerOpus: Opus,
    file: RecordFile
): Promise<void> {
    const config = presetAiToAi({ operator: file.operator });
    const jobId = await ensureCreated(
        publicClient,
        clientOpus,
        file.jobs.approve,
        config,
        file.provider,
        "ipfs://amoy/approve"
    );
    await ensureConfigured(publicClient, clientOpus, file.jobs.approve, jobId, config, 0n);
    await ensureFunded(publicClient, clientOpus, file.jobs.approve, jobId, config);
    if ((await clientOpus.job(jobId)).status === "Funded") {
        await send(publicClient, file, file.jobs.approve, "submit", providerOpus.submit(jobId, zeroHash, BUDGET));
    }
    if ((await clientOpus.job(jobId)).status === "Submitted") {
        await send(publicClient, file, file.jobs.approve, "approve", clientOpus.approve(jobId));
    }
    console.log(`approve job ${jobId} ${(await clientOpus.job(jobId)).status}`);
}

async function runHeld(
    publicClient: PublicClient,
    clientOpus: Opus,
    record: JobRecord,
    provider: Address,
    operator: Address,
    description: string,
    withTip: boolean,
    providerOpus?: Opus
): Promise<void> {
    const config = presetAiToAi({
        operator,
        evaluationFee: FEE,
        keeperTip: withTip ? TIP : 0n,
    });
    let jobId = await ensureCreated(publicClient, clientOpus, record, config, provider, description);
    await ensureConfigured(publicClient, clientOpus, record, jobId, config, FEE);
    if (await abandonIfUnfundable(publicClient, clientOpus, record, jobId, config)) {
        jobId = await ensureCreated(publicClient, clientOpus, record, config, provider, description);
        await ensureConfigured(publicClient, clientOpus, record, jobId, config, FEE);
    }
    await ensureFunded(publicClient, clientOpus, record, jobId, config);
    if (providerOpus !== undefined && (await clientOpus.job(jobId)).status === "Funded") {
        await send(publicClient, currentFile(record), record, "submit", providerOpus.submit(jobId, zeroHash, BUDGET));
    }
}

async function ensureCreated(
    publicClient: PublicClient,
    opus: Opus,
    record: JobRecord,
    config: EvaluatorConfig,
    provider: Address,
    description: string
): Promise<bigint> {
    if (record.id !== undefined) return BigInt(record.id);
    const fromBlock = await publicClient.getBlockNumber();
    const now = (await publicClient.getBlock()).timestamp + SLACK;
    const jobId = await opus.createJob({
        provider,
        expiredAt: minimumExpiredAt(now, config),
        description,
    });
    const logs = await publicClient.getLogs({
        address: opus.addresses.instance,
        event: createdAbi[0],
        args: { jobId },
        fromBlock,
    });
    const hash = logs[0]?.transactionHash;
    if (hash === undefined) throw new Error("JobCreated receipt was not found");
    record.id = jobId.toString();
    record.hashes.createJob = hash;
    console.log(`createJob ${jobId} ${hash}`);
    remember(record);
    return jobId;
}

async function ensureConfigured(
    publicClient: PublicClient,
    opus: Opus,
    record: JobRecord,
    jobId: bigint,
    config: EvaluatorConfig,
    fee: bigint
): Promise<void> {
    const job = await opus.job(jobId);
    if (job.status !== "Open") return;
    const status = await opus.status(jobId, getAddress(CLIENT));
    if (!status.actions.includes("configure")) return;
    const file = currentFile(record);
    if (fee > 0n) await send(publicClient, file, record, "approveEvaluation", opus.approveEvaluation(fee));
    await send(publicClient, file, record, "configure", opus.configure(jobId, config));
}

/**
 * A job still `Open` can never be funded when its deadline no longer leaves room for the
 * evaluator's windows, or when its evaluation fee is above the cap (a record made with the old
 * fee). The client rejects it, the evaluation fee is swept back, and the record starts a new job.
 */
async function abandonIfUnfundable(
    publicClient: PublicClient,
    opus: Opus,
    record: JobRecord,
    jobId: bigint,
    config: EvaluatorConfig
): Promise<boolean> {
    const job = await opus.job(jobId);
    if (job.status !== "Open") return false;
    const now = (await publicClient.getBlock()).timestamp;
    const configured = await publicClient.readContract({
        address: opus.addresses.evaluator,
        abi: evaluatorAbi,
        functionName: "getConfig",
        args: [opus.addresses.instance, jobId],
    });
    const feeTooHigh = configured.evaluationFee > (BUDGET * FEE_CAP_BP) / 10_000n;
    const late = minimumExpiredAt(now + FUND_SLACK, config) > job.expiredAt;
    if (!feeTooHigh && !late) return false;
    const why = feeTooHigh ? "its evaluation fee is above 20% of the budget" : "its deadline no longer fits";
    console.log(`job ${jobId} can never be funded (${why}); rejecting it and starting a new one`);
    const hashes: Hashes = {};
    const wallet = createWalletClient({
        account: getAddress(CLIENT),
        chain: amoy,
        transport: custom(network.provider),
    });
    console.log("Ledger: confirm reject");
    const rejected = await wallet.writeContract({
        address: opus.addresses.instance,
        abi: rejectAbi,
        functionName: "reject",
        args: [jobId, zeroHash, "0x"],
        gasPrice: await amoyGasPrice(publicClient),
    });
    if ((await publicClient.waitForTransactionReceipt({ hash: rejected })).status !== "success") {
        throw new Error(`reject reverted ${rejected}`);
    }
    hashes.reject = rejected;
    if ((await opus.status(jobId, getAddress(CLIENT))).actions.includes("sweep")) {
        console.log("Ledger: confirm sweep");
        const swept = await opus.sweep(jobId);
        if ((await publicClient.waitForTransactionReceipt({ hash: swept })).status !== "success") {
            throw new Error(`sweep reverted ${swept}`);
        }
        hashes.sweep = swept;
    }
    record.abandoned = [...(record.abandoned ?? []), { id: jobId.toString(), hashes: { ...record.hashes, ...hashes } }];
    record.id = undefined;
    record.hashes = {};
    remember(record);
    return true;
}

async function ensureFunded(
    publicClient: PublicClient,
    opus: Opus,
    record: JobRecord,
    jobId: bigint,
    config: EvaluatorConfig
): Promise<void> {
    const job = await opus.job(jobId);
    if (job.status !== "Open") return;
    const now = (await publicClient.getBlock()).timestamp;
    if (minimumExpiredAt(now + FUND_SLACK, config) > job.expiredAt) {
        throw new Error(`job ${jobId}'s deadline no longer fits before fund; run again to replace it`);
    }
    const file = currentFile(record);
    if (job.budget === 0n) await send(publicClient, file, record, "quote", opus.quote(jobId, BUDGET));
    await send(publicClient, file, record, "approveBudget", opus.approveBudget(BUDGET));
    await send(publicClient, file, record, "fund", opus.fund(jobId, BUDGET));
}

async function finishSweep(publicClient: PublicClient, opus: Opus, file: RecordFile): Promise<void> {
    const id = requiredId(file.jobs.sweep);
    const now = (await publicClient.getBlock()).timestamp;
    const expiredAt = BigInt(file.jobs.sweep.expiredAt ?? "0");
    if (now < expiredAt) {
        console.log(`sweep job ${id} waits until ${stamp(expiredAt)}.`);
        return;
    }
    const job = await opus.job(id);
    if (job.status === "Funded" || job.status === "Submitted") {
        await send(publicClient, file, file.jobs.sweep, "claimRefund", opus.claimRefund(id));
    }
    if ((await opus.status(id, file.client)).actions.includes("sweep")) {
        await send(publicClient, file, file.jobs.sweep, "sweep", opus.sweep(id));
    }
    console.log(`sweep job ${id} ${(await opus.job(id)).status}`);
}

async function send(
    publicClient: PublicClient,
    file: RecordFile,
    record: JobRecord,
    label: string,
    pending: Promise<Hash>
): Promise<void> {
    if (record.hashes[label] !== undefined) return;
    console.log(`Ledger: confirm ${label}`);
    const hash = await pending;
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`${label} reverted ${hash}`);
    record.hashes[label] = hash;
    console.log(`${label} ${hash}`);
    save(file);
}

function requiredId(record: JobRecord): bigint {
    if (record.id === undefined) throw new Error("Run setup first");
    return BigInt(record.id);
}

async function assertBalances(
    publicClient: PublicClient,
    usdc: Address,
    client: Address,
    provider: Address
): Promise<void> {
    const needed = BUDGET * 4n + FEE * 3n;
    const balance = await publicClient.readContract({
        address: usdc,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [client],
    });
    const clientPol = await publicClient.getBalance({ address: client });
    const providerPol = await publicClient.getBalance({ address: provider });
    if (balance < needed) {
        throw new Error(
            `Client has ${usdcOf(balance)} USDC and needs ${usdcOf(needed)}. Send Circle Amoy USDC to ${client}.`
        );
    }
    if (clientPol < 150_000_000_000_000_000n) {
        throw new Error(`Client has ${polOf(clientPol)} POL. Send at least 0.15 POL to ${client}.`);
    }
    if (providerPol < 30_000_000_000_000_000n) {
        throw new Error(`Provider has ${polOf(providerPol)} POL. Send at least 0.03 POL to ${provider}.`);
    }
}

async function printStatus(publicClient: PublicClient, opus: Opus, file: RecordFile): Promise<void> {
    const now = (await publicClient.getBlock()).timestamp;
    for (const [name, job] of Object.entries(file.jobs) as Array<[string, JobRecord]>) {
        if (job.id === undefined) {
            console.log(`${name}: not created`);
            continue;
        }
        const chain = await opus.job(BigInt(job.id));
        const due = job.dueAt ?? job.expiredAt;
        console.log(`${name} job ${job.id} ${chain.status} due ${due === undefined ? "-" : stamp(BigInt(due))}`);
    }
    console.log(`chain time ${stamp(now)}`);
    console.log("When finalize and timeout are due, run yarn keeper start with a hot wallet that is not the deployer.");
    console.log("When the sweep job is past expiry, run ACCEPTANCE_PHASE=finish yarn contracts acceptance:amoy");
}

function loadRecord(client: Address, provider: Address, operator: Address, instance: Address): RecordFile {
    let parsed: RecordFile | undefined;
    try {
        parsed = JSON.parse(readFileSync(OUT, "utf8")) as RecordFile;
    } catch {
        parsed = undefined;
    }
    if (parsed !== undefined) {
        // A record from another deployment would make this run skip steps and read the wrong jobs.
        if (parsed.instance?.toLowerCase() !== instance.toLowerCase()) {
            throw new Error(
                `${OUT} belongs to ${
                    parsed.instance ?? "the first Amoy deployment"
                }, not ${instance}. Rename it to keep it, then run again.`
            );
        }
        active = parsed;
        return parsed;
    }
    const created: RecordFile = {
        network: "amoy",
        client,
        provider,
        operator,
        instance,
        jobs: {
            approve: { hashes: {} },
            sweep: { hashes: {} },
            finalize: { hashes: {} },
            timeout: { hashes: {} },
        },
    };
    active = created;
    return created;
}

let active: RecordFile;

function currentFile(record: JobRecord): RecordFile {
    void record;
    return active;
}

function remember(record: JobRecord): void {
    void record;
    save(active);
}

const FLOW_ISSUES: Record<string, string[]> = {
    approve: ["#23"],
    sweep: ["#23"],
    finalize: ["#24", "#16"],
    timeout: ["#24", "#16"],
};

function save(file: RecordFile): void {
    active = file;
    writeFileSync(OUT, `${JSON.stringify(file, null, 4)}\n`);
    for (const [name, job] of Object.entries(file.jobs)) {
        writeFlow(name, flowFromHashes(FLOW_ISSUES[name] ?? [], job.hashes, job.id));
    }
}

function requiredEnv(name: string): string {
    const value = process.env[name]?.trim();
    if (value === undefined || value === "") throw new Error(`${name} is required`);
    return value;
}

function stamp(unix: bigint): string {
    return new Date(Number(unix) * 1000).toISOString();
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
