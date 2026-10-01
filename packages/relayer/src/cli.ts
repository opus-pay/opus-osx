import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { readFileSync } from "fs";

import { amoy, loadAddresses, localHardhat, type ForwardRequest } from "@opus/sdk";
import { getAddress, isAddress, type Hex } from "viem";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { parseIntegrators } from "./limits";
import { Relayer, RelayRejected } from "./relayer";
import { parseSanctionsList } from "./sanctions";
import { relayerAccountFromEnv } from "./wallet";

type Body = { integratorId?: unknown; request?: Record<string, unknown> };

function readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        req.on("error", reject);
    });
}

function asRequest(value: Record<string, unknown> | undefined): ForwardRequest {
    if (value === undefined) throw new RelayRejected("The forward request is missing");
    const from = value.from;
    const to = value.to;
    if (typeof from !== "string" || !isAddress(from) || typeof to !== "string" || !isAddress(to)) {
        throw new RelayRejected("The forward request has a bad address");
    }
    if (typeof value.data !== "string" || typeof value.signature !== "string") {
        throw new RelayRejected("The forward request is missing data");
    }
    return {
        from: getAddress(from),
        to: getAddress(to),
        value: BigInt(String(value.value ?? "")),
        gas: BigInt(String(value.gas ?? "")),
        deadline: Number(value.deadline),
        data: value.data as Hex,
        signature: value.signature as Hex,
    };
}

export function startServer(relayer: Relayer, host: string, port: number): Promise<void> {
    const server = createServer((req, res) => {
        void handle(relayer, req, res);
    });
    return new Promise((resolve) => {
        server.listen(port, host, () => resolve());
    });
}

async function handle(relayer: Relayer, req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method === "GET" && req.url === "/health") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end('{"ok":true}');
        return;
    }
    if (req.method !== "POST" || req.url !== "/relay") {
        res.writeHead(404);
        res.end();
        return;
    }
    try {
        const body = JSON.parse(await readBody(req)) as Body;
        const header = req.headers.authorization ?? "";
        const bearer = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
        const integratorId = typeof body.integratorId === "string" ? body.integratorId : "";
        const hash = await relayer.submit(asRequest(body.request), integratorId, bearer);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ hash }));
    } catch (error) {
        const status = error instanceof RelayRejected ? 400 : 500;
        const message = error instanceof Error ? error.message : "relay failed";
        res.writeHead(status, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: message }));
    }
}

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
    const relayer = new Relayer(publicClient, walletClient, addresses, {
        integrators: parseIntegrators(integratorsJson),
        blocked,
    });
    const host = process.env.RELAYER_HOST?.trim() || "127.0.0.1";
    const port = Number(process.env.RELAYER_PORT ?? "8787");
    await startServer(relayer, host, port);
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
