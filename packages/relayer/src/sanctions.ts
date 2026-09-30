import { getAddress, isAddress, type Address } from "viem";

/** Addresses the operator refuses to relay for. The list is supplied, not fetched here. */
export function parseSanctionsList(text: string): Set<Address> {
    const blocked = new Set<Address>();
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (line === "" || line.startsWith("#")) continue;
        if (!isAddress(line)) throw new Error("The sanctions list has a line that is not an address");
        blocked.add(getAddress(line));
    }
    return blocked;
}

export function isSanctioned(blocked: ReadonlySet<Address>, signer: Address): boolean {
    return blocked.has(getAddress(signer));
}
