import { zeroAddress, type Address } from "viem";

import {
    PLACEHOLDER_DISPUTE_DEPOSIT,
    PLACEHOLDER_EVALUATION_FEE,
    PLACEHOLDER_KEEPER_TIP,
    PLACEHOLDER_MIN_WINDOW,
} from "./constants";
import type { EvaluatorConfig } from "./types";

export type PresetAmounts = {
    operator: Address;
    arbiter?: Address;
    evaluationFee?: bigint;
    keeperTip?: bigint;
    disputeDeposit?: bigint;
};

function base(input: PresetAmounts, autoComplete: boolean, arbiter: Address): EvaluatorConfig {
    const hour = PLACEHOLDER_MIN_WINDOW;
    return {
        submitWindow: hour,
        reviewWindow: hour,
        maxExtension: autoComplete ? 0 : hour,
        depositWindow: autoComplete ? 0 : hour,
        disputeWindow: autoComplete ? 0 : hour,
        autoCompleteOnSilence: autoComplete,
        defaultComplete: true,
        budgetLock: 0,
        arbiter,
        operator: input.operator,
        evaluationFee: input.evaluationFee ?? PLACEHOLDER_EVALUATION_FEE,
        keeperTip: input.keeperTip ?? PLACEHOLDER_KEEPER_TIP,
        disputeDeposit: autoComplete ? 0n : input.disputeDeposit ?? PLACEHOLDER_DISPUTE_DEPOSIT,
    };
}

/** Silence completes the job. No arbiter and no dispute deposit. */
export function presetAiToAi(input: PresetAmounts): EvaluatorConfig {
    return base(input, true, zeroAddress);
}

/** Silence completes the job, protecting the person who did the work. */
export function presetAiToPerson(input: PresetAmounts): EvaluatorConfig {
    return base(input, true, zeroAddress);
}

/** Confirmation mode. An arbiter is required or the contract reverts `ConfirmationNeedsArbiter`. */
export function presetPersonToAny(input: PresetAmounts): EvaluatorConfig {
    if (input.arbiter === undefined || input.arbiter === zeroAddress) {
        throw new Error("Confirmation mode requires an arbiter");
    }
    return base(input, false, input.arbiter);
}

/** Small jobs with no arbiter stay in auto-complete mode. An objection resolves to the default. */
export function presetSmallNoArbiter(input: PresetAmounts): EvaluatorConfig {
    return base(input, true, zeroAddress);
}
