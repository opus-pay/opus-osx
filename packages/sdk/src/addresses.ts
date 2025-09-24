import { getAddress, isAddress, type Address } from "viem";

import type { ProtocolAddresses } from "./types";

export function parseAddresses(value: unknown): ProtocolAddresses {
    if (typeof value !== "object" || value === null) throw new Error("Address file is not an object");
    const row = value as Record<string, unknown>;
    return {
        network: String(row.network),
        chainId: Number(row.chainId),
        forwarder: asAddress(row.forwarder),
        factory: asAddress(row.factory),
        usdc: asAddress(row.usdc),
        instance: asAddress(row.instance),
        evaluator: asAddress(row.evaluator),
    };
}

export function loadAddresses(json: string): ProtocolAddresses {
    return parseAddresses(JSON.parse(json));
}

function asAddress(value: unknown): Address {
    if (typeof value !== "string" || !isAddress(value)) throw new Error("Address file has a bad address");
    return getAddress(value);
}
