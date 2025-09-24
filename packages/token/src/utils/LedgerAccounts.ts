/**
 * Hardhat 2 cannot mix `accounts` (private keys) and `ledgerAccounts` on an HTTP
 * network. Live networks therefore pick exactly one signer source.
 *
 * @see https://github.com/NomicFoundation/hardhat/issues/4059
 */

import fs from "fs";

import { LIVE_NETWORKS } from "./NetworkEnv";

const ADDRESS = /^(0x)[0-9a-f]{40}$/i;
const PRIVATE_KEY = /^(0x)[0-9a-f]{64}$/i;

export type LiveNetworkSignerConfig = { ledgerAccounts: string[] } | { accounts: string[] };

/**
 * Reads `{KEY}_ADDRESS` for each named account. All must be set, or none.
 * A partial list would shift signer indexes (treasury becoming deployer).
 */
export function readLedgerAddresses(env: NodeJS.Dict<string>, namedKeys: readonly string[]): string[] {
    const addresses: string[] = [];
    const missing: string[] = [];

    for (const key of namedKeys) {
        const name = `${key}_ADDRESS`;
        const value = env[name];
        if (value === undefined || value.trim() === "") {
            missing.push(name);
            continue;
        }
        const address = value.trim();
        if (!ADDRESS.test(address)) {
            throw new Error(`${name} is not a valid address`);
        }
        addresses.push(address);
    }

    if (addresses.length === 0) return [];
    if (missing.length > 0) {
        throw new Error(`Ledger deploy requires every named address. Missing: ${missing.join(", ")}`);
    }
    return addresses;
}

export function liveNetworkSignerConfig(ledgerAddresses: string[], privateKeys: string[]): LiveNetworkSignerConfig {
    if (ledgerAddresses.length > 0) {
        return { ledgerAccounts: ledgerAddresses };
    }
    return { accounts: privateKeys };
}

export function hasNamedPrivateKeys(env: NodeJS.Dict<string>, namedKeys: readonly string[]): boolean {
    return namedKeys.every((key) => {
        const value = env[key];
        return value !== undefined && PRIVATE_KEY.test(value.trim());
    });
}

/**
 * Tests and localhost may run without `env/.env`. Amoy/Polygon must not silently
 * invent keys, so the file and a complete signer set are required there.
 */
export function assertLiveNetworkSigners(
    network: string,
    env: NodeJS.Dict<string>,
    namedKeys: readonly string[],
    envFile: string
): void {
    if (!LIVE_NETWORKS.has(network)) return;
    if (!fs.existsSync(envFile)) {
        throw new Error(
            `${envFile} is required to deploy to ${network}. Copy the matching env/.${network}.env.sample.`
        );
    }
    if (readLedgerAddresses(env, namedKeys).length > 0) return;
    if (hasNamedPrivateKeys(env, namedKeys)) return;
    throw new Error(`${envFile} must set every named private key or every *_ADDRESS before deploying to ${network}.`);
}
