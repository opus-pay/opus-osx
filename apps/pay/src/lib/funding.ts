import {
    evaluatorAbi,
    minimumExpiredAt,
    presetAiToAi,
    presetAiToPerson,
    presetSmallNoArbiter,
    tokenUnitsForUsd,
    type EvaluatorConfig,
    type Opus,
} from "@opus/sdk";
import { type Address } from "viem";

import { parties, type Draft } from "./draft";

export type FundingAction = "create" | "quote" | "configure" | "fund";

export type FundingStep = { action: FundingAction; signer: "client" | "provider" };

export function configForDraft(draft: Draft, operator: Address): EvaluatorConfig {
    const input = { operator };
    const config =
        draft.preset === "aiToAi"
            ? presetAiToAi(input)
            : draft.preset === "aiToPerson"
            ? presetAiToPerson(input)
            : presetSmallNoArbiter(input);
    return { ...config, budgetLock: draft.lock };
}

export function amountForDraft(draft: Draft): bigint {
    return tokenUnitsForUsd(BigInt(draft.amountUsd), 6);
}

/** The next signature the two wallets still owe, read from the chain view. */
export function nextFundingAction(view: {
    lock: 1 | 2;
    exists: boolean;
    budget: bigint;
    configured: boolean;
    funded: boolean;
}): FundingStep | "funded" {
    if (view.funded) return "funded";
    if (!view.exists) return { action: "create", signer: "client" };
    if (view.lock === 2) {
        if (view.budget === 0n) return { action: "quote", signer: "client" };
        if (!view.configured) return { action: "configure", signer: "client" };
        return { action: "fund", signer: "client" };
    }
    if (!view.configured) return { action: "configure", signer: "client" };
    if (view.budget === 0n) return { action: "quote", signer: "provider" };
    return { action: "fund", signer: "client" };
}

export async function fundingView(
    opus: Opus,
    jobId: bigint | undefined,
    lock: 1 | 2
): Promise<{ exists: boolean; budget: bigint; configured: boolean; funded: boolean; lock: 1 | 2 }> {
    if (jobId === undefined) return { exists: false, budget: 0n, configured: false, funded: false, lock };
    const job = await opus.job(jobId);
    const row = await opus.publicClient.readContract({
        address: opus.addresses.evaluator,
        abi: evaluatorAbi,
        functionName: "getConfig",
        args: [opus.addresses.instance, jobId],
    });
    return {
        exists: true,
        budget: job.budget,
        configured: row.submitWindow > 0,
        funded: job.status === "Funded" || job.status === "Submitted" || job.status === "Completed",
        lock,
    };
}

/** One chain call in the funding plan. `create` returns the new job id. */
export async function runFundingStep(
    opus: Opus,
    action: FundingAction,
    input: { draft: Draft; jobId?: bigint; now: bigint; operator: Address }
): Promise<bigint | undefined> {
    const config = configForDraft(input.draft, input.operator);
    const amount = amountForDraft(input.draft);
    if (action === "create") {
        const { provider } = parties(input.draft);
        return opus.createJob({
            provider,
            evaluator: opus.addresses.evaluator,
            expiredAt: minimumExpiredAt(input.now + 3600n, config),
            description: input.draft.agreement,
            hook: opus.addresses.evaluator,
        });
    }
    if (input.jobId === undefined) throw new Error("The job has not been created");
    if (action === "quote") {
        await opus.quote(input.jobId, amount);
        return input.jobId;
    }
    if (action === "configure") {
        const pull = config.evaluationFee + (config.autoCompleteOnSilence ? 0n : config.disputeDeposit);
        if (pull > 0n) await opus.configureWithPermit(input.jobId, config);
        else await opus.configure(input.jobId, config);
        return input.jobId;
    }
    await opus.fundWithPermit(input.jobId, amount);
    return input.jobId;
}
