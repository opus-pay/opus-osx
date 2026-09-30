import { expect } from "chai";
import { getAddress, zeroAddress, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import {
    allowedTarget,
    GasBudget,
    isSanctioned,
    parseIntegrators,
    parseSanctionsList,
    relayerAccountFromEnv,
    RequestWindow,
    tokenMatches,
} from "../src";
import type { ProtocolAddresses } from "../../sdk/src";

const KEY = `0x${"22".repeat(32)}` as const;

const addresses: ProtocolAddresses = {
    network: "hardhat",
    chainId: 31337,
    forwarder: getAddress("0x0000000000000000000000000000000000000001"),
    factory: getAddress("0x0000000000000000000000000000000000000002"),
    usdc: getAddress("0x0000000000000000000000000000000000000003"),
    instance: getAddress("0x0000000000000000000000000000000000000004"),
    evaluator: getAddress("0x0000000000000000000000000000000000000005"),
};

describe("@opus/relayer", () => {
    it("relays only the instance, the factory, and the evaluator", () => {
        expect(allowedTarget(addresses, addresses.instance)).to.equal(true);
        expect(allowedTarget(addresses, addresses.factory)).to.equal(true);
        expect(allowedTarget(addresses, addresses.evaluator)).to.equal(true);
        expect(allowedTarget(addresses, addresses.usdc)).to.equal(false);
        expect(allowedTarget(addresses, addresses.forwarder)).to.equal(false);
        expect(allowedTarget(addresses, zeroAddress)).to.equal(false);
    });

    it("reads a sanctions list and ignores comments", () => {
        const blocked = parseSanctionsList(`# comment\n\n${addresses.usdc}\n`);
        expect(isSanctioned(blocked, addresses.usdc)).to.equal(true);
        expect(isSanctioned(blocked, addresses.instance)).to.equal(false);
        expect(() => parseSanctionsList("not-an-address")).to.throw("not an address");
    });

    it("stops an integrator at the rate limit and restores the window", () => {
        let now = 1_000;
        const window = new RequestWindow(2, 60, () => now);
        expect(window.allow()).to.equal(true);
        expect(window.allow()).to.equal(true);
        expect(window.allow()).to.equal(false);
        now += 60;
        expect(window.allow()).to.equal(true);
    });

    it("holds a gas budget and settles it to the amount actually used", () => {
        const budget = new GasBudget(100n);
        expect(budget.hold(40n)).to.equal(true);
        budget.settle(40n, 25n);
        expect(budget.remaining).to.equal(75n);
        expect(budget.hold(76n)).to.equal(false);
        expect(budget.remaining).to.equal(75n);
    });

    it("requires an integrator id, token, and positive limits", () => {
        const parsed = parseIntegrators(
            JSON.stringify([{ id: "errands", token: "secret", budgetWei: "10", maxRequests: 2, windowSeconds: 30 }])
        );
        expect(parsed[0].budgetWei).to.equal(10n);
        expect(tokenMatches("secret", "secret")).to.equal(true);
        expect(tokenMatches("secret", "secreT")).to.equal(false);
        expect(tokenMatches("secret", "secret-longer")).to.equal(false);
        expect(() => parseIntegrators("[]")).to.throw("at least one integrator");
    });

    it("reads a hot-wallet key from the environment and refuses the deployer", () => {
        const account = relayerAccountFromEnv({ RELAYER_PRIVATE_KEY: KEY });
        expect(account.address).to.equal(privateKeyToAccount(KEY).address);
        expect(() => relayerAccountFromEnv({})).to.throw("RELAYER_PRIVATE_KEY is required");
        expect(() => relayerAccountFromEnv({ RELAYER_PRIVATE_KEY: "nope" })).to.throw("32-byte hex");
        const deployer = getAddress(account.address) as Address;
        expect(() => relayerAccountFromEnv({ RELAYER_PRIVATE_KEY: KEY, DEPLOYER_ADDRESS: deployer })).to.throw(
            "must not be the deployer"
        );
    });
});
