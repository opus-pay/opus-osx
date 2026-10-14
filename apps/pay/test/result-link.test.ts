import { expect } from "chai";

import { findDeliverable, sameFingerprint, type LogReader } from "../src/lib/deliverable";
import { hostOf, parseResultUrl, resultFromHash, resultLinkFor } from "../src/lib/result-link";

const INSTANCE = "0x1111111111111111111111111111111111111111" as const;
const HASH = `0x${"ab".repeat(32)}` as const;
const OTHER = `0x${"cd".repeat(32)}` as const;

describe("the deliverable link", () => {
    it("takes only a safe https link", () => {
        expect(parseResultUrl(" https://example.com/a b ")).to.equal(undefined);
        expect(parseResultUrl(" https://example.com/file.zip ")).to.equal("https://example.com/file.zip");
        for (const bad of [
            "",
            "http://example.com/x",
            "javascript:alert(1)",
            "data:text/html,x",
            "ftp://x.y/z",
            "example.com",
            "https://user:pw@example.com/x",
            "https://",
            `https://example.com/${"a".repeat(2100)}`,
        ])
            expect(parseResultUrl(bad), bad).to.equal(undefined);
    });

    it("makes the page address with the link after the #, and reads it back", () => {
        const url = "https://drive.example.com/f/abc?x=1&y=2#frag";
        const link = resultLinkFor("https://pay.example.org", 7n, url);
        expect(link.startsWith("https://pay.example.org/jobs/7#result=")).to.equal(true);
        expect(link).to.not.contain("drive.example.com/f/abc?");
        expect(resultFromHash(new URL(link).hash)).to.equal(parseResultUrl(url));
        expect(resultFromHash("")).to.equal(undefined);
        expect(resultFromHash("#result=javascript%3Aalert(1)")).to.equal(undefined);
        expect(resultFromHash("#other=1")).to.equal(undefined);
        expect(() => resultLinkFor("https://pay.example.org", 7n, "http://x.y")).to.throw("https://");
    });

    it("names the site a link goes to", () => {
        expect(hostOf("https://drive.example.com/f/abc")).to.equal("drive.example.com");
        expect(hostOf("nonsense")).to.equal("");
    });
});

/** A chain with `logs` at given blocks, and a head; counts the ranges asked for. */
function chain(head: bigint, logs: { block: bigint; deliverable: `0x${string}`; jobId?: bigint }[]) {
    const asked: [bigint, bigint][] = [];
    const reader: LogReader = {
        getBlockNumber: async () => head,
        getLogs: async ({ fromBlock, toBlock, args }) => {
            asked.push([fromBlock, toBlock]);
            return logs
                .filter((l) => l.block >= fromBlock && l.block <= toBlock && (l.jobId ?? 1n) === args.jobId)
                .map((l) => ({ args: { deliverable: l.deliverable } }));
        },
    };
    return { reader, asked };
}

describe("finding the submitted fingerprint on the chain", () => {
    it("looks back in steps until it finds the event", async () => {
        const { reader, asked } = chain(20_000n, [{ block: 7_000n, deliverable: HASH }]);
        expect(await findDeliverable(reader, INSTANCE, 1n)).to.equal(HASH);
        expect(asked).to.deep.equal([
            [15_001n, 20_000n],
            [10_001n, 15_000n],
            [5_001n, 10_000n],
        ]);
    });

    it("ignores other jobs, and gives up after the farthest look", async () => {
        const other = chain(20_000n, [{ block: 19_000n, deliverable: OTHER, jobId: 2n }]);
        expect(await findDeliverable(other.reader, INSTANCE, 1n, { step: 5_000n, maxBlocks: 10_000n })).to.equal(
            undefined
        );
        expect(other.asked.length).to.equal(3);
        const far = chain(500_000n, [{ block: 100n, deliverable: HASH }]);
        expect(await findDeliverable(far.reader, INSTANCE, 1n)).to.equal(undefined);
    });

    it("works near the start of a chain, and compares fingerprints without regard to case", async () => {
        const { reader, asked } = chain(300n, [{ block: 5n, deliverable: HASH }]);
        expect(await findDeliverable(reader, INSTANCE, 1n)).to.equal(HASH);
        expect(asked).to.deep.equal([[0n, 300n]]);
        expect(sameFingerprint(HASH, HASH.toUpperCase().replace("0X", "0x"))).to.equal(true);
        expect(sameFingerprint(HASH, OTHER)).to.equal(false);
    });
});

import { isRejection, sendAndConfirm, type TxPhase } from "../src/lib/tx";

describe("the two waits of a transaction", () => {
    const client = (status: "success" | "reverted") =>
        ({ waitForTransactionReceipt: async () => ({ status }) } as unknown as Parameters<typeof sendAndConfirm>[0]);
    const HASH_1 = `0x${"11".repeat(32)}` as const;

    it("says signing first, then confirming with the hash, then returns the hash", async () => {
        const seen: [TxPhase, string | undefined][] = [];
        const hash = await sendAndConfirm(
            client("success"),
            async () => HASH_1,
            (phase, h) => seen.push([phase, h])
        );
        expect(hash).to.equal(HASH_1);
        expect(seen).to.deep.equal([
            ["signing", undefined],
            ["confirming", HASH_1],
        ]);
    });

    it("never reaches confirming when the wallet refuses, and throws when the block reverted", async () => {
        const seen: TxPhase[] = [];
        let failed: unknown;
        try {
            await sendAndConfirm(
                client("success"),
                async () => Promise.reject(new Error("User rejected the request.")),
                (p) => seen.push(p)
            );
        } catch (error) {
            failed = error;
        }
        expect(seen).to.deep.equal(["signing"]);
        expect(isRejection(failed)).to.equal(true);
        let reverted: unknown;
        try {
            await sendAndConfirm(client("reverted"), async () => HASH_1);
        } catch (error) {
            reverted = error;
        }
        expect((reverted as Error).message).to.contain("reverted");
    });

    it("knows a cancelled signature from other errors", () => {
        expect(isRejection({ code: 4001 })).to.equal(true);
        expect(isRejection(new Error("MetaMask Tx Signature: User denied transaction signature."))).to.equal(true);
        expect(isRejection(new Error("The transaction was reverted"))).to.equal(false);
        expect(isRejection(undefined)).to.equal(false);
    });
});
