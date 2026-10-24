export const SDK_PACKAGE = "@opus/sdk";

/** Whole-dollar bounds. Token helpers use the bigint constants. */
export const MIN_BUDGET_USD = 1;
export const MAX_BUDGET_USD = 100;

export { coreAbi, erc20Abi, evaluatorAbi, forwarderAbi, opusAbi } from "./abi";
export { loadAddresses, parseAddresses } from "./addresses";
export { assertBudgetInRange, splitBudgetUsd, tokenUnitsForUsd } from "./budget";
export {
    AMOY_MIN_GAS_PRICE,
    PLACEHOLDER_ARBITER,
    PLACEHOLDER_DISPUTE_DEPOSIT,
    PLACEHOLDER_EVALUATION_FEE,
    PLACEHOLDER_KEEPER_TIP,
    PLACEHOLDER_MAX_JOB_DURATION,
    PLACEHOLDER_MAX_WINDOW,
    PLACEHOLDER_MIN_JOB_DURATION,
    PLACEHOLDER_MIN_WINDOW,
    PLACEHOLDER_SAFETY_MARGIN,
    amoy,
    chainForId,
    localHardhat,
    polygon,
} from "./constants";
export { minimumExpiredAt } from "./deadlines";
export { rpcTransport, rpcUrlsFrom } from "./transport";
export { AMOY_MIN_TIP, amoyGasPrice, usesTipFloor } from "./gas";
export { assertDescription, descriptionOf } from "./description";
export { decodeOpusError } from "./errors";
export { decodeOpusLog, jobIdFromReceipt } from "./events";
export { encodeForwarderExecute, signForwardRequest } from "./forwarder";
export { Opus } from "./opus";
export { presetAiToAi, presetAiToPerson, presetPersonToAny, presetSmallNoArbiter } from "./presets";
export { statusFor, warnings } from "./status";

export type { ForwardRequest } from "./forwarder";
export type { PresetAmounts } from "./presets";
export type {
    EvaluatorConfig,
    Job,
    JobAction,
    JobSnapshot,
    JobStatusName,
    PhaseName,
    ProtocolAddresses,
    WalletStatus,
} from "./types";
