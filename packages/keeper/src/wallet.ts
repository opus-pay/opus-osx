import { getAddress, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const KEY = /^0x[0-9a-fA-F]{64}$/;

/** The keeper's own hot wallet. The key stays in the environment and is never written to the repo. */
export function keeperAccountFromEnv(env: NodeJS.ProcessEnv): { address: Address; privateKey: Hex } {
    const raw = env.KEEPER_PRIVATE_KEY?.trim() ?? "";
    if (raw === "") throw new Error("KEEPER_PRIVATE_KEY is required");
    if (!KEY.test(raw)) throw new Error("KEEPER_PRIVATE_KEY must be a 32-byte hex string");
    const account = privateKeyToAccount(raw as Hex);
    const deployer = env.DEPLOYER_ADDRESS?.trim();
    if (deployer !== undefined && deployer !== "" && getAddress(account.address) === getAddress(deployer as Address)) {
        throw new Error("The keeper wallet must not be the deployer");
    }
    return { address: account.address, privateKey: raw as Hex };
}
