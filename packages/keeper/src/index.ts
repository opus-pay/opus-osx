export const KEEPER_PACKAGE = "@opus/keeper";

export { AlertGate, alertKey, isLowBalance, isNearExpiry } from "./alerts";
export type { Alert } from "./alerts";
export { alertText, createNotifier } from "./notify";
export type { NotifierOptions } from "./notify";
export { createHealthServer, judge } from "./health";
export type { HealthView, KeeperStatus } from "./health";
export { CallPending, DEFAULT_LOW_BALANCE_WEI, describe, Keeper } from "./keeper";
export type { KeeperCall, KeeperOptions, TickResult } from "./keeper";
export { isPermanent, PermanentError, withBackoff } from "./retry";
export { dueTriggers, KEEPER_TRIGGERS } from "./triggers";
export type { KeeperTrigger } from "./triggers";
export { keeperAccountFromEnv } from "./wallet";
