import fs from "fs";
import * as dotenv from "dotenv";

export const LIVE_NETWORKS = new Set(["amoy", "polygon"]);

export function resolveNetworkEnvFile(envNetwork: string): string {
    return envNetwork !== "" ? `env/.${envNetwork}.env` : `env/.env`;
}

/**
 * `ENV_NETWORK=amoy` loads `env/.amoy.env`. Tests leave `ENV_NETWORK` unset and
 * may run without any env file. A named network with a missing file is an error.
 */
export function assertNetworkEnvFile(
    envNetwork: string,
    exists: (path: string) => boolean = (path) => fs.existsSync(path)
): string {
    const envFile = resolveNetworkEnvFile(envNetwork);
    if (envNetwork !== "" && !exists(envFile)) {
        throw new Error(
            `ENV_NETWORK=${envNetwork} requires ${envFile}. Copy env/.${envNetwork}.env.sample to ${envFile}.`
        );
    }
    return envFile;
}

export function loadNetworkEnv(): string {
    dotenv.config({});
    const envNetwork = process.env.ENV_NETWORK || "";
    const envFile = assertNetworkEnvFile(envNetwork);
    dotenv.config({ path: envFile });
    return envFile;
}

export function assertLiveDeployEnv(network: string): string {
    if (!LIVE_NETWORKS.has(network)) {
        return resolveNetworkEnvFile(process.env.ENV_NETWORK || "");
    }
    const envNetwork = process.env.ENV_NETWORK || "";
    if (envNetwork !== network) {
        throw new Error(`Deploying to ${network} requires ENV_NETWORK=${network} so env/.${network}.env is loaded.`);
    }
    return assertNetworkEnvFile(envNetwork);
}
