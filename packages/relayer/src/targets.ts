import { type ProtocolAddresses } from "@opus/sdk";
import { getAddress, type Address } from "viem";

/** The only contracts the gas wallet may call. Anything else is refused. */
export function allowedTarget(addresses: ProtocolAddresses, to: Address): boolean {
    const target = getAddress(to);
    return (
        target === getAddress(addresses.instance) ||
        target === getAddress(addresses.factory) ||
        target === getAddress(addresses.evaluator)
    );
}
