import { decodeEventLog, type Log } from "viem";

import { coreAbi, evaluatorAbi } from "./abi";

const abi = [...coreAbi, ...evaluatorAbi];

export function decodeOpusLog(log: Log): { eventName: string; args: unknown } | undefined {
    if (log.topics.length === 0) return undefined;
    try {
        const decoded = decodeEventLog({ abi, data: log.data, topics: log.topics });
        return { eventName: decoded.eventName, args: decoded.args };
    } catch {
        return undefined;
    }
}

export function jobIdFromReceipt(logs: Log[]): bigint {
    for (const log of logs) {
        const decoded = decodeOpusLog(log);
        if (decoded?.eventName === "JobCreated") {
            return (decoded.args as { jobId: bigint }).jobId;
        }
    }
    throw new Error("JobCreated was not emitted");
}
