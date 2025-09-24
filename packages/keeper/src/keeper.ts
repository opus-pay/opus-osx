import { PLACEHOLDER_SAFETY_MARGIN, type Opus } from "@opus/sdk";
import { parseAbi, type Address, type Hash } from "viem";

import { isLowBalance, isNearExpiry, type Alert } from "./alerts";
import { PermanentError, withBackoff } from "./retry";
import { dueTriggers, type KeeperTrigger } from "./triggers";

const jobCountAbi = parseAbi(["function jobCount() view returns (uint256)"]);

/** 0.05 POL. Enough for a few Amoy calls at the 25 gwei floor. An operating alert, not a protocol constant. */
export const DEFAULT_LOW_BALANCE_WEI = 50_000_000_000_000_000n;

export type KeeperCall = { jobId: bigint; action: KeeperTrigger; hash: Hash };

export type KeeperOptions = {
    marginSeconds?: bigint;
    lowBalanceWei?: bigint;
    attempts?: number;
    baseDelayMs?: number;
    sleep?: (ms: number) => Promise<void>;
    onAlert?: (alert: Alert) => void;
};

/**
 * One pass over the instance. Which call is due comes only from `Opus.status`.
 * Gas on Amoy is floored inside the SDK write path.
 */
export class Keeper {
    private readonly marginSeconds: bigint;
    private readonly lowBalanceWei: bigint;
    private readonly attempts: number;
    private readonly baseDelayMs: number;

    constructor(
        private readonly opus: Opus,
        private readonly keeper: Address,
        private readonly options: KeeperOptions = {}
    ) {
        this.marginSeconds = options.marginSeconds ?? BigInt(PLACEHOLDER_SAFETY_MARGIN);
        this.lowBalanceWei = options.lowBalanceWei ?? DEFAULT_LOW_BALANCE_WEI;
        this.attempts = options.attempts ?? 4;
        this.baseDelayMs = options.baseDelayMs ?? 1_000;
    }

    async tick(): Promise<{ calls: KeeperCall[]; alerts: Alert[] }> {
        const alerts: Alert[] = [];
        const calls: KeeperCall[] = [];
        const balance = await this.opus.publicClient.getBalance({ address: this.keeper });
        if (isLowBalance(balance, this.lowBalanceWei)) {
            const alert: Alert = { kind: "low-balance", balance, minimum: this.lowBalanceWei };
            alerts.push(alert);
            this.options.onAlert?.(alert);
        }

        const count = await this.opus.publicClient.readContract({
            address: this.opus.addresses.instance,
            abi: jobCountAbi,
            functionName: "jobCount",
        });
        const now = (await this.opus.publicClient.getBlock()).timestamp;

        for (let jobId = 1n; jobId <= count; jobId++) {
            const job = await this.opus.job(jobId);
            if (job.evaluator !== this.opus.addresses.evaluator) continue;
            if (isNearExpiry(job.status, job.expiredAt, now, this.marginSeconds)) {
                const alert: Alert = { kind: "near-expiry", jobId, expiredAt: job.expiredAt, now };
                alerts.push(alert);
                this.options.onAlert?.(alert);
            }
            const status = await this.opus.status(jobId, this.keeper);
            for (const action of dueTriggers(status.actions)) {
                const hash = await this.send(action, jobId);
                calls.push({ jobId, action, hash });
            }
        }
        return { calls, alerts };
    }

    private async send(action: KeeperTrigger, jobId: bigint): Promise<Hash> {
        return withBackoff(
            async () => {
                const hash = await this.opus[action](jobId);
                const receipt = await this.opus.publicClient.waitForTransactionReceipt({ hash });
                if (receipt.status !== "success") throw new PermanentError("transaction reverted");
                return hash;
            },
            { attempts: this.attempts, baseDelayMs: this.baseDelayMs, sleep: this.options.sleep }
        );
    }
}
