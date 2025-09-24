import { expect } from "chai";

import { liveNetworkSignerConfig, readLedgerAddresses } from "../src/utils/LedgerAccounts";

const NAMED_KEYS = ["DEPLOYER", "TREASURY"];
const deployer = "0x1111111111111111111111111111111111111111";
const treasury = "0x2222222222222222222222222222222222222222";

describe("LedgerAccounts", () => {
    it("returns no ledger addresses when none are set", () => {
        expect(readLedgerAddresses({}, NAMED_KEYS)).to.deep.equal([]);
        expect(readLedgerAddresses({ DEPLOYER_ADDRESS: "", TREASURY_ADDRESS: "   " }, NAMED_KEYS)).to.deep.equal([]);
    });

    it("returns named addresses in key order when every slot is set", () => {
        expect(
            readLedgerAddresses(
                {
                    TREASURY_ADDRESS: treasury,
                    DEPLOYER_ADDRESS: ` ${deployer} `,
                },
                NAMED_KEYS
            )
        ).to.deep.equal([deployer, treasury]);
    });

    it("rejects a partial list so signer indexes cannot shift", () => {
        expect(() => readLedgerAddresses({ DEPLOYER_ADDRESS: deployer }, NAMED_KEYS)).to.throw(
            "Ledger deploy requires every named address. Missing: TREASURY_ADDRESS"
        );
    });

    it("rejects a value that is not an address", () => {
        expect(() =>
            readLedgerAddresses(
                {
                    DEPLOYER_ADDRESS: "0x1234",
                    TREASURY_ADDRESS: treasury,
                },
                NAMED_KEYS
            )
        ).to.throw("DEPLOYER_ADDRESS is not a valid address");
    });

    it("picks ledgerAccounts or accounts, never both", () => {
        expect(liveNetworkSignerConfig([deployer], ["0xabc"])).to.deep.equal({ ledgerAccounts: [deployer] });
        expect(liveNetworkSignerConfig([], ["0xabc"])).to.deep.equal({ accounts: ["0xabc"] });
    });
});
