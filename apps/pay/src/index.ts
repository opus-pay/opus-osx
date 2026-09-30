export const PAY_PACKAGE = "@opus/pay";

export { decodeDraft, encodeDraft, linkFor, parties, PRESETS } from "./lib/draft";
export type { Draft, PresetName } from "./lib/draft";
export { amountForDraft, configForDraft, fundingView, nextFundingAction, runFundingStep } from "./lib/funding";
export type { FundingAction, FundingStep } from "./lib/funding";
export { plainTerms } from "./lib/terms";
