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
    localHardhat,
} from "./constants";
export { minimumExpiredAt } from "./deadlines";
export { assertDescription, descriptionOf } from "./description";
export { decodeOpusError } from "./errors";
export { decodeOpusLog, jobIdFromReceipt } from "./events";
export { encodeForwarderExecute, signForwardRequest } from "./forwarder";
export { Opus } from "./opus";
export {
    EXPO_PUSH_URL,
    EXPO_RECEIPTS_URL,
    MAX_PUSH_BATCH,
    MAX_PUSH_BODY,
    MAX_PUSH_DATA_BYTES,
    MAX_PUSH_TITLE,
    PushError,
    buildPushMessage,
    chunkMessages,
    getPushReceipts,
    isExpoPushToken,
    isInsidePath,
    pushToDevices,
    sendPush,
} from "./push";
export { presetAiToAi, presetAiToPerson, presetPersonToAny, presetSmallNoArbiter } from "./presets";
export { statusFor, warnings } from "./status";

export type { ForwardRequest } from "./forwarder";
export type { PresetAmounts } from "./presets";
export type { PushClientOptions, PushInput, PushMessage, PushReceipts, PushResult, PushRoute } from "./push";
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
