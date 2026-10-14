import { coreAbi } from "@opus/sdk";
import { getAbiItem, type Address, type Hex } from "viem";

const submittedEvent = getAbiItem({ abi: coreAbi, name: "JobSubmitted" });

/** What the lookup needs from a chain client (a viem public client has both). */
export type LogReader = {
    getBlockNumber(): Promise<bigint>;
    getLogs(args: {
        address: Address;
        event: typeof submittedEvent;
        args: { jobId: bigint };
        fromBlock: bigint;
        toBlock: bigint;
    }): Promise<readonly { args: { deliverable?: Hex } }[]>;
};

export type LookupOptions = {
    /** Blocks asked for at a time: public nodes refuse long ranges. */
    step?: bigint;
    /** How far back to look at most. */
    maxBlocks?: bigint;
};

/**
 * The fingerprint the provider submitted for a job, read from the escrow's `JobSubmitted` event. It looks back from the
 * newest block in steps, because the contract keeps the fingerprint only in that event. Returns undefined when it is not
 * found within `maxBlocks` (the screen then says so). The last submission wins.
 */
export async function findDeliverable(
    reader: LogReader,
    instance: Address,
    jobId: bigint,
    { step = 5_000n, maxBlocks = 200_000n }: LookupOptions = {}
): Promise<Hex | undefined> {
    const head = await reader.getBlockNumber();
    const floor = head > maxBlocks ? head - maxBlocks : 0n;
    let to = head;
    while (to >= floor) {
        const from = to - step + 1n > floor ? to - step + 1n : floor;
        const logs = await reader.getLogs({
            address: instance,
            event: submittedEvent,
            args: { jobId },
            fromBlock: from,
            toBlock: to,
        });
        const found = logs.at(-1)?.args.deliverable;
        if (found !== undefined) return found;
        if (from === floor) break;
        to = from - 1n;
    }
    return undefined;
}

/** Whether a file's fingerprint is the one on the chain (case does not matter). */
export function sameFingerprint(a: string, b: string): boolean {
    return a.toLowerCase() === b.toLowerCase();
}
