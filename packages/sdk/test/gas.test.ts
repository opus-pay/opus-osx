import { expect } from "chai";

import { AMOY_MIN_TIP, amoyGasPrice, chainForId, rpcTransport, rpcUrlsFrom, usesTipFloor } from "../src";

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

describe("node settings", () => {
    it("reads one node or several separated by commas, and falls back to the chain's own", () => {
        expect(rpcUrlsFrom("https://a.example/key", "https://d")).to.deep.equal(["https://a.example/key"]);
        expect(rpcUrlsFrom(" https://a , https://b ,", "https://d")).to.deep.equal(["https://a", "https://b"]);
        expect(rpcUrlsFrom("", "https://d")).to.deep.equal(["https://d"]);
        expect(rpcUrlsFrom(undefined, "https://d")).to.deep.equal(["https://d"]);
    });

    it("makes one transport for one node and a fallback for several", () => {
        expect(rpcTransport(["https://a"])({}).config.type).to.equal("http");
        expect(rpcTransport(["https://a", "https://b"])({}).config.type).to.equal("fallback");
    });
});
