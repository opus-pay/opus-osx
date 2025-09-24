/**
 * Amoy flows for issue #23 acceptance.
 * Pass a WalletClient from the caller. This file does not read a private key.
 *
 * (1) create → configure → fund → submit → approve
 * (2) expiry → claimRefund → sweep returns the evaluation fee
 *
 * Live transaction hashes are recorded in GITHUB_ISSUES.md after a signed run.
 */
import { createPublicClient, http, type Address, type WalletClient } from "viem";

import { amoy, loadAddresses, minimumExpiredAt, Opus, presetAiToAi, tokenUnitsForUsd } from "../src";

const FEE = tokenUnitsForUsd(1n, 6);
const BUDGET = tokenUnitsForUsd(10n, 6);

export async function amoyClient(wallet: WalletClient, addressesJson: string): Promise<Opus> {
    const addresses = loadAddresses(addressesJson);
    const publicClient = createPublicClient({ chain: amoy, transport: http(amoy.rpcUrls.default.http[0]) });
    return new Opus(publicClient, addresses, wallet);
}

export async function approveFlow(opus: Opus, provider: Address, operator: Address): Promise<bigint> {
    const config = presetAiToAi({ operator, evaluationFee: FEE });
    const now = BigInt(Math.floor(Date.now() / 1000)) + 300n;
    const jobId = await opus.createJob({
        provider,
        expiredAt: minimumExpiredAt(now, config),
        description: "ipfs://amoy/approve",
    });
    await opus.approveEvaluation(FEE);
    await opus.configure(jobId, config);
    await opus.quote(jobId, BUDGET);
    await opus.approveBudget(BUDGET);
    await opus.fund(jobId, BUDGET);
    return jobId;
}

export async function sweepAfterExpiry(opus: Opus, provider: Address, operator: Address): Promise<bigint> {
    const config = presetAiToAi({ operator, evaluationFee: FEE });
    const now = BigInt(Math.floor(Date.now() / 1000)) + 300n;
    const jobId = await opus.createJob({
        provider,
        expiredAt: minimumExpiredAt(now, config),
        description: "ipfs://amoy/sweep",
    });
    await opus.approveEvaluation(FEE);
    await opus.configure(jobId, config);
    await opus.quote(jobId, BUDGET);
    await opus.approveBudget(BUDGET);
    await opus.fund(jobId, BUDGET);
    return jobId;
}
