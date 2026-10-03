import { expect } from "chai";
import { getAddress, keccak256, stringToBytes, zeroAddress, type Address } from "viem";

import {
    assertBudgetInRange,
    assertDescription,
    descriptionOf,
    MAX_BUDGET_USD,
    minimumExpiredAt,
    PLACEHOLDER_SAFETY_MARGIN,
    presetAiToAi,
    presetAiToPerson,
    presetPersonToAny,
    presetSmallNoArbiter,
    splitBudgetUsd,
    statusFor,
    tokenUnitsForUsd,
    warnings,
} from "../src";
import type { JobSnapshot } from "../src";

const operator = "0x0000000000000000000000000000000000000001" as Address;
const client = "0x0000000000000000000000000000000000000002" as Address;
const provider = "0x0000000000000000000000000000000000000003" as Address;
const arbiter = "0x0000000000000000000000000000000000000004" as Address;
const evaluator = "0x0000000000000000000000000000000000000005" as Address;

function snapshot(over: Partial<JobSnapshot> = {}): JobSnapshot {
    return {
        job: {
            client,
            provider,
            evaluator,
            description: "ipfs://job",
            budget: 100n,
            expiredAt: 10_000n,
            status: "Open",
            hook: evaluator,
        },
        phase: "None",
        now: 1_000n,
        reviewEnd: 0n,
        depositDeadline: 0n,
        disputeDeadline: 0n,
        fundedAt: 0n,
        submitWindow: 3600,
        autoCompleteOnSilence: true,
        arbiter: zeroAddress,
        disputeDeposit: 0n,
        maxExtension: 0,
        clientDeposit: 0n,
        providerDeposit: 0n,
        feeHeld: 0n,
        instanceClaimable: 0n,
        evaluatorClaimable: 0n,
        configured: false,
        evaluatorAddress: evaluator,
        ...over,
    };
}

describe("@opus/sdk helpers", () => {
    it("keeps the 1 to 100 USD range", () => {
        expect(splitBudgetUsd(250)).to.deep.equal([MAX_BUDGET_USD, MAX_BUDGET_USD, 50]);
        expect(tokenUnitsForUsd(1n, 6)).to.equal(1_000000n);
        expect(tokenUnitsForUsd(1000n, 18)).to.equal(1000n * 10n ** 18n);
        expect(() => assertBudgetInRange(999999n, 6)).to.throw("below 1 USD");
        expect(() => assertBudgetInRange(tokenUnitsForUsd(101n, 6), 6)).to.throw("above 100 USD");
    });

    it("hashes a request and keeps a URI or hash", () => {
        const hash = keccak256(stringToBytes("deliver the parcel"));
        expect(descriptionOf("deliver the parcel")).to.equal(hash);
        expect(descriptionOf("ipfs://job/1")).to.equal("ipfs://job/1");
        expect(descriptionOf(hash)).to.equal(hash);
        expect(() => assertDescription("plain text")).to.throw("hash or URI");
    });

    it("builds presets that the evaluator accepts", () => {
        const ai = presetAiToAi({ operator });
        expect(ai.autoCompleteOnSilence).to.equal(true);
        expect(ai.disputeDeposit).to.equal(0n);
        expect(ai.arbiter).to.equal(zeroAddress);
        expect(presetAiToPerson({ operator }).autoCompleteOnSilence).to.equal(true);
        expect(presetSmallNoArbiter({ operator }).disputeDeposit).to.equal(0n);
        const person = presetPersonToAny({ operator, arbiter, disputeDeposit: 1n });
        expect(person.autoCompleteOnSilence).to.equal(false);
        expect(person.arbiter).to.equal(getAddress(arbiter));
        expect(() => presetPersonToAny({ operator })).to.throw("requires an arbiter");
        const expiry = minimumExpiredAt(1_000n, person);
        const needed =
            BigInt(
                person.submitWindow +
                    person.reviewWindow +
                    person.maxExtension +
                    person.depositWindow +
                    person.disputeWindow
            ) + BigInt(PLACEHOLDER_SAFETY_MARGIN);
        expect(expiry).to.equal(1_000n + needed + 1n);
    });

    it("lists the actions a wallet can take", () => {
        const open = statusFor(client, snapshot());
        expect(open.actions).to.include("setBudget");
        expect(open.actions).to.include("configure");
        expect(open.nextDeadline).to.equal(10_000n);

        const funded = statusFor(
            provider,
            snapshot({
                phase: "Funded",
                now: 2_000n,
                fundedAt: 1_000n,
                configured: true,
                job: { ...snapshot().job, status: "Funded", budget: 100n },
            })
        );
        expect(funded.actions).to.include("submit");
        expect(funded.actions).to.not.include("timeoutNoSubmission");

        const due = statusFor(
            client,
            snapshot({
                phase: "Funded",
                now: 5_000n,
                fundedAt: 1_000n,
                configured: true,
                job: { ...snapshot().job, status: "Funded" },
            })
        );
        expect(due.actions).to.include("timeoutNoSubmission");

        const warned = warnings(
            snapshot({
                job: { ...snapshot().job, evaluator: client },
                arbiter: provider,
            })
        );
        expect(warned).to.deep.equal(["The evaluator is the client", "The arbiter is a party to the job"]);
    });
});
