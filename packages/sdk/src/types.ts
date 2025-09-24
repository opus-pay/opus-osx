import type { Address, PublicClient, WalletClient } from "viem";

export type ProtocolAddresses = {
    network: string;
    chainId: number;
    forwarder: Address;
    factory: Address;
    usdc: Address;
    instance: Address;
    evaluator: Address;
};

export type JobStatusName = "Open" | "Funded" | "Submitted" | "Completed" | "Rejected" | "Expired";
export type PhaseName = "None" | "Funded" | "Submitted" | "Escalated" | "ArbiterPending" | "Resolved";

export type EvaluatorConfig = {
    submitWindow: number;
    reviewWindow: number;
    maxExtension: number;
    depositWindow: number;
    disputeWindow: number;
    autoCompleteOnSilence: boolean;
    defaultComplete: boolean;
    budgetLock: number;
    arbiter: Address;
    operator: Address;
    evaluationFee: bigint;
    keeperTip: bigint;
    disputeDeposit: bigint;
};

export type Job = {
    client: Address;
    provider: Address;
    evaluator: Address;
    description: string;
    budget: bigint;
    expiredAt: bigint;
    status: JobStatusName;
    hook: Address;
};

export type JobAction =
    | "setProvider"
    | "setBudget"
    | "configure"
    | "fund"
    | "submit"
    | "approve"
    | "object"
    | "extendReview"
    | "withdrawAsProvider"
    | "postDeposit"
    | "timeoutNoSubmission"
    | "finalize"
    | "escalateOnSilence"
    | "resolveMissingDeposit"
    | "resolveByDefault"
    | "claimRefund"
    | "sweep"
    | "withdraw";

export type JobSnapshot = {
    job: Job;
    phase: PhaseName;
    now: bigint;
    reviewEnd: bigint;
    depositDeadline: bigint;
    disputeDeadline: bigint;
    fundedAt: bigint;
    submitWindow: number;
    autoCompleteOnSilence: boolean;
    arbiter: Address;
    disputeDeposit: bigint;
    maxExtension: number;
    clientDeposit: bigint;
    providerDeposit: bigint;
    feeHeld: bigint;
    instanceClaimable: bigint;
    evaluatorClaimable: bigint;
    configured: boolean;
    evaluatorAddress: Address;
};

export type WalletStatus = {
    phase: PhaseName;
    status: JobStatusName;
    nextDeadline: bigint | null;
    actions: JobAction[];
    warnings: string[];
};

export type OpusConnection = {
    publicClient: PublicClient;
    walletClient?: WalletClient;
    addresses: ProtocolAddresses;
};
