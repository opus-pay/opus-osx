import { expect } from "chai";

import { AMOY_MIN_TIP, amoyGasPrice, chainForId, usesTipFloor } from "../src";

const gwei = (n: number) => BigInt(n) * 1_000_000_000n;
const client = (baseFeePerGas: bigint | null) => ({ getBlock: async () => ({ baseFeePerGas }) } as never);

describe("Amoy gas price", () => {
    it("pays the base fee with headroom plus a tip above Amoy's 25 gwei minimum", async () => {
        const price = await amoyGasPrice(client(gwei(31)));
        expect(price).to.equal(gwei(31) + gwei(31) / 4n + gwei(30));
        // What a legacy transaction leaves as the tip must clear the minimum.
        expect(price - gwei(31) >= AMOY_MIN_TIP).to.equal(true);
    });

    it("still pays the minimum tip when the base fee is zero or missing", async () => {
        expect(await amoyGasPrice(client(0n))).to.equal(gwei(30));
        expect(await amoyGasPrice(client(null))).to.equal(gwei(30));
    });
});

describe("chains", () => {
    it("knows Polygon, Amoy and a local node, and refuses any other chain id", () => {
        expect(chainForId(137).id).to.equal(137);
        expect(chainForId(137).name).to.equal("Polygon");
        expect(chainForId(80002).id).to.equal(80002);
        expect(chainForId(31337).id).to.equal(31337);
        expect(() => chainForId(1)).to.throw("Unknown chain id 1");
    });

    it("uses the tip floor on Polygon and Amoy only", () => {
        expect(usesTipFloor(137)).to.equal(true);
        expect(usesTipFloor(80002)).to.equal(true);
        expect(usesTipFloor(31337)).to.equal(false);
    });
});
