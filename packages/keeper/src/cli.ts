import { readFileSync } from "fs";

import { amoy, loadAddresses, localHardhat, Opus } from "@opus/sdk";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { Keeper } from "./keeper";
import { keeperAccountFromEnv } from "./wallet";

async function main(): Promise<void> {
    const account = keeperAccountFromEnv(process.env);
    const path = process.env.KEEPER_ADDRESSES?.trim();
    if (path === undefined || path === "") throw new Error("KEEPER_ADDRESSES is required");
    const addresses = loadAddresses(readFileSync(path, "utf8"));
    const chain = addresses.chainId === 80002 ? amoy : localHardhat;
    const rpc = process.env.KEEPER_RPC_URL?.trim() || chain.rpcUrls.default.http[0];
    const transport = http(rpc);
    const signer = privateKeyToAccount(account.privateKey);
    const publicClient = createPublicClient({ chain, transport });
    const walletClient = createWalletClient({ account: signer, chain, transport });
    const opus = new Opus(publicClient, addresses, walletClient);
    const low = process.env.KEEPER_LOW_BALANCE_WEI?.trim();
    const margin = process.env.KEEPER_EXPIRY_MARGIN_SECONDS?.trim();
    const keeper = new Keeper(opus, account.address, {
        lowBalanceWei: low === undefined || low === "" ? undefined : BigInt(low),
        marginSeconds: margin === undefined || margin === "" ? undefined : BigInt(margin),
        onAlert: (alert) =>
            console.error(
                JSON.stringify(alert, (_key, value) => (typeof value === "bigint" ? value.toString() : value))
            ),
    });
    const poll = Number(process.env.KEEPER_POLL_MS ?? "30000");
    for (;;) {
        const result = await keeper.tick();
        for (const call of result.calls) {
            console.log(`${call.action} job ${call.jobId} ${call.hash}`);
        }
        await new Promise((resolve) => setTimeout(resolve, poll));
    }
}

if (require.main === module) {
    main().catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : error);
        process.exit(1);
    });
}
