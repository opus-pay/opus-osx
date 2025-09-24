import { expect } from "chai";
import { getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { dueTriggers, isNearExpiry, isPermanent, keeperAccountFromEnv, PermanentError, withBackoff } from "../src";

const KEY = `0x${"11".repeat(32)}` as const;

describe("@opus/keeper", () => {
    it("calls only the due triggers the status helper lists", () => {
        expect(dueTriggers(["approve", "finalize", "claimRefund", "submit"])).to.deep.equal(["finalize"]);
        expect(dueTriggers(["setBudget", "fund"])).to.deep.equal([]);
    });

    it("alerts from chain time, inside the margin and after it", () => {
        expect(isNearExpiry("Submitted", 10_000n, 9_000n, 1_000n)).to.equal(true);
        expect(isNearExpiry("Funded", 10_000n, 10_500n, 1_000n)).to.equal(true);
        expect(isNearExpiry("Submitted", 10_000n, 1_000n, 1_000n)).to.equal(false);
        expect(isNearExpiry("Completed", 1n, 1_000n, 1_000n)).to.equal(false);
        expect(isNearExpiry("Open", 1n, 1_000n, 1_000n)).to.equal(false);
    });

    it("retries a transport failure and stops on a contract rejection", async () => {
        let tries = 0;
        const waits: number[] = [];
        const value = await withBackoff(
            async () => {
                tries += 1;
                if (tries < 3) throw new Error("socket hang up");
                return "ok";
            },
            { attempts: 4, baseDelayMs: 10, sleep: async (ms) => void waits.push(ms) }
        );
        expect(value).to.equal("ok");
        expect(waits).to.deep.equal([10, 20]);

        let permanentTries = 0;
        try {
            await withBackoff(
                async () => {
                    permanentTries += 1;
                    throw new PermanentError("transaction reverted");
                },
                { attempts: 4, baseDelayMs: 10, sleep: async () => undefined }
            );
            expect.fail("should throw");
        } catch (error) {
            expect(isPermanent(error)).to.equal(true);
        }
        expect(permanentTries).to.equal(1);
    });

    it("reads a hot-wallet key from the environment and refuses the deployer", () => {
        const account = keeperAccountFromEnv({ KEEPER_PRIVATE_KEY: KEY, DEPLOYER_ADDRESS: "" });
        expect(account.address).to.equal(privateKeyToAccount(KEY).address);
        expect(account.privateKey).to.equal(KEY);
        expect(() => keeperAccountFromEnv({})).to.throw("KEEPER_PRIVATE_KEY is required");
        expect(() => keeperAccountFromEnv({ KEEPER_PRIVATE_KEY: "not-a-key" })).to.throw("32-byte hex");
        const deployer = getAddress(account.address);
        expect(() => keeperAccountFromEnv({ KEEPER_PRIVATE_KEY: KEY, DEPLOYER_ADDRESS: deployer })).to.throw(
            "must not be the deployer"
        );
        expect(deployer).to.be.a("string");
    });
});
