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
import { type Address, type Hash } from "viem";

import { parties, type Draft } from "./draft";
import { translate, type Locale } from "./i18n";
import { sendAndConfirm, type TxPhase } from "./tx";

export type FundingAction = "create" | "quote" | "configure" | "fund";

export type FundingStep = { action: FundingAction; signer: "client" | "provider" };

/** Plain words for a funding step, shown before the wallet asks for a signature. */
export function stepLabel(action: FundingAction, locale: Locale = "en"): string {
    return translate(locale, `step.${action}`);
}

/** Every signature a link needs, in order. Lock 2 quotes before configure; lock 1 lets the provider quote after it. */
export function fundingPlan(lock: 1 | 2): FundingStep[] {
    return lock === 2
        ? [
              { action: "create", signer: "client" },
              { action: "quote", signer: "client" },
              { action: "configure", signer: "client" },
              { action: "fund", signer: "client" },
          ]
        : [
              { action: "create", signer: "client" },
              { action: "configure", signer: "client" },
              { action: "quote", signer: "provider" },
              { action: "fund", signer: "client" },
          ];
}

/** "Step 2 of 4", counted from the plan for this lock. */
export function stepPosition(lock: 1 | 2, action: FundingAction): { index: number; total: number } {
    const plan = fundingPlan(lock);
    return { index: plan.findIndex((step) => step.action === action) + 1, total: plan.length };
}

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

/**
 * One chain call in the funding plan. Waits until the call is in a block, so the next
 * step reads the new state. `create` returns the new job id and no hash.
 */
export async function runFundingStep(
    opus: Opus,
    action: FundingAction,
    input: { draft: Draft; jobId?: bigint; now: bigint; operator: Address },
    /** Told when the wallet is asked to sign and when the signed transaction waits for its block. */
    onPhase?: (phase: TxPhase, hash?: Hash) => void
): Promise<{ jobId: bigint; hash?: Hash }> {
    const config = configForDraft(input.draft, input.operator);
    const amount = amountForDraft(input.draft);
    if (action === "create") {
        const { provider } = parties(input.draft);
        onPhase?.("signing");
        const jobId = await opus.createJob(
            {
                provider,
                evaluator: opus.addresses.evaluator,
                expiredAt: minimumExpiredAt(input.now + 3600n, config),
                description: input.draft.agreement,
                hook: opus.addresses.evaluator,
            },
            (hash) => onPhase?.("confirming", hash)
        );
        return { jobId };
    }
    const jobId = input.jobId;
    if (jobId === undefined) throw new Error("The job has not been created");
    const send = (): Promise<Hash> => {
        if (action === "quote") return opus.quote(jobId, amount);
        if (action === "configure") {
            const pull = config.evaluationFee + (config.autoCompleteOnSilence ? 0n : config.disputeDeposit);
            return pull > 0n ? opus.configureWithPermit(jobId, config) : opus.configure(jobId, config);
        }
        return opus.fundWithPermit(jobId, amount);
    };
    return { jobId, hash: await sendAndConfirm(opus.publicClient, send, onPhase) };
}
