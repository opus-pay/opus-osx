import { BaseError, decodeErrorResult, type Hex } from "viem";

import { opusAbi } from "./abi";

const TEXT: Record<string, string> = {
    DeadlineDoesNotFit: "The evaluator windows do not finish before the job expiry",
    ConfirmationNeedsArbiter: "Confirmation mode requires an arbiter",
    BudgetMismatch: "The funded amount does not match the agreed budget",
    BudgetBelowMinimum: "The budget is below 1 USD",
    BudgetAboveMaximum: "The budget is above 1,000 USD",
    HookFailed: "The evaluator hook rejected the call",
    NotConfigured: "The job has no evaluator configuration",
    WrongStatus: "The job is not in the required state",
    Unauthorized: "This wallet cannot call that function",
    TooEarly: "The deadline has not been reached",
    ReviewStillOpen: "The review window is still open",
    ReviewEnded: "The review or deposit window has ended",
    NothingToSweep: "There is nothing left to return",
    NothingToWithdraw: "There is no deferred payout",
    ProviderNotSet: "The job has no provider",
    ZeroBudget: "The job has no budget",
    InvalidJob: "Unknown job",
    ZeroAddress: "A required address is zero",
};

export function decodeOpusError(error: unknown): string {
    const data = revertData(error);
    if (data === undefined) return error instanceof Error ? error.message : String(error);
    try {
        const decoded = decodeErrorResult({ abi: opusAbi, data });
        return TEXT[decoded.errorName] ?? decoded.errorName;
    } catch {
        return error instanceof Error ? error.message : String(error);
    }
}

function revertData(error: unknown): Hex | undefined {
    if (!(error instanceof BaseError)) return undefined;
    const match = error.walk(
        (item) =>
            typeof item === "object" && item !== null && "data" in item && isHex((item as { data?: unknown }).data)
    );
    if (match && typeof match === "object" && "data" in match && isHex(match.data)) return match.data;
    return undefined;
}

function isHex(value: unknown): value is Hex {
    return typeof value === "string" && value.startsWith("0x");
}
