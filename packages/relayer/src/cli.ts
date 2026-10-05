import { readFileSync } from "fs";

import { amoy, loadAddresses, localHardhat } from "@opus/sdk";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { parseIntegrators } from "./limits";
import { Relayer } from "./relayer";
import { createRelayerServer } from "./server";
import { readBudgets, writeBudgets } from "./state";
import { parseSanctionsList } from "./sanctions";
import { relayerAccountFromEnv } from "./wallet";

async function main(): Promise<void> {
    const account = relayerAccountFromEnv(process.env);
    const path = process.env.RELAYER_ADDRESSES?.trim();
    const sanctionsPath = process.env.RELAYER_SANCTIONS_FILE?.trim();
    const integratorsJson = process.env.RELAYER_INTEGRATORS?.trim();
    if (path === undefined || path === "") throw new Error("RELAYER_ADDRESSES is required");
    if (sanctionsPath === undefined || sanctionsPath === "") throw new Error("RELAYER_SANCTIONS_FILE is required");
    if (integratorsJson === undefined || integratorsJson === "") throw new Error("RELAYER_INTEGRATORS is required");
    const addresses = loadAddresses(readFileSync(path, "utf8"));
    const blocked = parseSanctionsList(readFileSync(sanctionsPath, "utf8"));
    const chain = addresses.chainId === 80002 ? amoy : localHardhat;
    const rpc = process.env.RELAYER_RPC_URL?.trim() || chain.rpcUrls.default.http[0];
    const transport = http(rpc);
    const signer = privateKeyToAccount(account.privateKey);
    const publicClient = createPublicClient({ chain, transport });
    const walletClient = createWalletClient({ account: signer, chain, transport });
    const stateFile = process.env.RELAYER_STATE_FILE?.trim();
    const log = (entry: Record<string, unknown>) =>
        console.log(
            JSON.stringify({ t: new Date().toISOString(), ...entry }, (_k, v) =>
                typeof v === "bigint" ? v.toString() : v
            )
        );
    const number = (name: string): number | undefined => {
        const raw = process.env[name]?.trim();
        if (raw === undefined || raw === "") return undefined;
        if (!/^\d+$/.test(raw)) throw new Error(`${name} must be a whole number`);
        return Number(raw);
    };
    const wei = (name: string): bigint | undefined => {
        const raw = process.env[name]?.trim();
        if (raw === undefined || raw === "") return undefined;
        if (!/^\d+$/.test(raw)) throw new Error(`${name} must be a whole number`);
        return BigInt(raw);
    };
    const relayer = new Relayer(publicClient, walletClient, addresses, {
        integrators: parseIntegrators(integratorsJson),
        blocked,
        maxGas: wei("RELAYER_MAX_GAS"),
        receiptTimeoutMs: number("RELAYER_RECEIPT_TIMEOUT_MS"),
        minBalanceWei: wei("RELAYER_MIN_BALANCE_WEI"),
        restoredBudgets: stateFile === undefined || stateFile === "" ? undefined : readBudgets(stateFile),
        onBudgets: stateFile === undefined || stateFile === "" ? undefined : (left) => writeBudgets(stateFile, left),
        log,
    });
    const host = process.env.RELAYER_HOST?.trim() || "127.0.0.1";
    const port = Number(process.env.RELAYER_PORT ?? "8787");
    const server = createRelayerServer(relayer, { log });
    await new Promise<void>((resolve) => server.listen(port, host, () => resolve()));
    // Stop taking requests on SIGTERM/SIGINT, let the ones in flight finish, then leave.
    const stop = () => {
        log({ event: "stopping" });
        server.close();
        void relayer.idle().then(() => process.exit(0));
        setTimeout(() => process.exit(1), 30_000).unref();
    };
    process.on("SIGTERM", stop);
    process.on("SIGINT", stop);
    console.log("relayer started");
    console.log(`wallet ${account.address}`);
    console.log(`network ${addresses.network} chain ${chain.id} ${chain.name}`);
    console.log(`rpc ${rpc}`);
    console.log(`instance ${addresses.instance}`);
    console.log(`evaluator ${addresses.evaluator}`);
    console.log(`forwarder ${addresses.forwarder}`);
    console.log(`factory ${addresses.factory}`);
    console.log(`usdc ${addresses.usdc}`);
    console.log(`listening ${host}:${port}`);
}

if (require.main === module) {
    main().catch((error: unknown) => {
        console.error(error instanceof Error ? error.message : error);
        process.exit(1);
    });
}
