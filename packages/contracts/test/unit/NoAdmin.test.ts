import { expect } from "chai";
import { execFileSync } from "child_process";
import { resolve } from "path";

describe("No-admin check (#21)", () => {
    it("rejects Ownable, AccessControl, pause, upgrade, and admin setters (I-6)", () => {
        expect(() =>
            execFileSync("npx", ["ts-node", "scripts/checkNoAdmin.ts"], {
                cwd: resolve(__dirname, "../.."),
                stdio: "pipe",
            })
        ).to.not.throw();
    });
});
