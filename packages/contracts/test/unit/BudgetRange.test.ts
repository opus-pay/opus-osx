import { expect } from "chai";
import { ethers } from "hardhat";

import { deployCore, deployUsdc, defaultExpiry, DESC, EMPTY, testWallets } from "../helpers/acp";

describe("Budget range (#10)", () => {
    const wallets = testWallets();
    const [, , , , client, provider, evaluator] = wallets;

    async function deploy(decimals: 6 | 18) {
        const token = await deployUsdc();
        if (decimals === 18) {
            const factory = await ethers.getContractFactory("MockPermitToken");
            const t18 = await factory.deploy("DAI", "DAI", 18);
            await t18.deployed();
            const core = await deployCore(t18.address, 18);
            return { token: t18, core };
        }
        const core = await deployCore(token.address, 6);
        return { token, core };
    }

    function unit(decimals: 6 | 18, usd: "low" | "min" | "max" | "high") {
        if (decimals === 6) {
            const one = ethers.BigNumber.from(1_000000);
            if (usd === "low") return one.sub(1);
            if (usd === "min") return one;
            if (usd === "max") return one.mul(1000);
            return one.mul(1000).add(1);
        }
        const one = ethers.utils.parseUnits("1", 18);
        if (usd === "low") return ethers.utils.parseUnits("0.999999", 18);
        if (usd === "min") return one;
        if (usd === "max") return one.mul(1000);
        return ethers.utils.parseUnits("1000.000001", 18);
    }

    for (const decimals of [6, 18] as const) {
        it(`rejects below 1 and above 1,000 USD for ${decimals}-decimal tokens`, async () => {
            const { core } = await deploy(decimals);
            const expiredAt = await defaultExpiry();
            await core
                .connect(client)
                .createJob(provider.address, evaluator.address, expiredAt, DESC, ethers.constants.AddressZero);

            await expect(core.connect(client).setBudget(1, unit(decimals, "low"), EMPTY)).to.be.revertedWithCustomError(
                core,
                "BudgetBelowMinimum"
            );
            await core.connect(client).setBudget(1, unit(decimals, "min"), EMPTY);
            await core.connect(client).setBudget(1, unit(decimals, "max"), EMPTY);
            await expect(
                core.connect(client).setBudget(1, unit(decimals, "high"), EMPTY)
            ).to.be.revertedWithCustomError(core, "BudgetAboveMaximum");
        });
    }
});
