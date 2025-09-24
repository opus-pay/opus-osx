import { expect } from "chai";

import { liveNetworkSignerConfig, readLedgerAddresses } from "../src/utils/LedgerAccounts";

const NAMED_KEYS = ["DEPLOYER", "TREASURY", "OPERATOR", "ARBITRATOR"];
const deployer = "0x1111111111111111111111111111111111111111";
const treasury = "0x2222222222222222222222222222222222222222";
const operator = "0x3333333333333333333333333333333333333333";
const arbitrator = "0x4444444444444444444444444444444444444444";

describe("LedgerAccounts", () => {
    it("returns no ledger addresses when none are set", () => {
        expect(readLedgerAddresses({}, NAMED_KEYS)).to.deep.equal([]);
    });

    it("returns named addresses in key order when every slot is set", () => {
        expect(
            readLedgerAddresses(
                {
                    DEPLOYER_ADDRESS: deployer,
                    TREASURY_ADDRESS: treasury,
                    OPERATOR_ADDRESS: operator,
                    ARBITRATOR_ADDRESS: arbitrator,
                },
                NAMED_KEYS
            )
        ).to.deep.equal([deployer, treasury, operator, arbitrator]);
    });

    it("rejects a partial list so signer indexes cannot shift", () => {
        expect(() =>
            readLedgerAddresses(
                {
                    DEPLOYER_ADDRESS: deployer,
                    TREASURY_ADDRESS: treasury,
                },
                NAMED_KEYS
            )
        ).to.throw("Missing: OPERATOR_ADDRESS, ARBITRATOR_ADDRESS");
    });

    it("picks ledgerAccounts or accounts, never both", () => {
        expect(liveNetworkSignerConfig([deployer], ["0xabc"])).to.deep.equal({ ledgerAccounts: [deployer] });
        expect(liveNetworkSignerConfig([], ["0xabc"])).to.deep.equal({ accounts: ["0xabc"] });
    });
});
