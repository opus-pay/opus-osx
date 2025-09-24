import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { Wallet } from "ethers";
import { ethers } from "hardhat";

import { defaultExpiry, deployCore, deployUsdc, DESC, EMPTY, testWallets } from "../helpers/acp";
import { MockPermitToken, OpusAgenticCommerce } from "../../typechain-types";

describe("fundWithPermit (#13)", () => {
    const wallets = testWallets();
    const [, , , , client, provider, evaluator] = wallets;

    async function signPermit(token: MockPermitToken, owner: Wallet, spender: string, value: number, deadline: number) {
        const nonce = await token.nonces(owner.address);
        const signature = await owner._signTypedData(
            { name: "USD Coin", version: "1", chainId: 31337, verifyingContract: token.address },
            {
                Permit: [
                    { name: "owner", type: "address" },
                    { name: "spender", type: "address" },
                    { name: "value", type: "uint256" },
                    { name: "nonce", type: "uint256" },
                    { name: "deadline", type: "uint256" },
                ],
            },
            { owner: owner.address, spender, value, nonce, deadline }
        );
        return ethers.utils.splitSignature(signature);
    }

    it("emits the same JobFunded event as fund", async () => {
        const token = await deployUsdc();
        const core = await deployCore(token.address);
        const expiredAt = await defaultExpiry();
        await core
            .connect(client)
            .createJob(provider.address, evaluator.address, expiredAt, DESC, ethers.constants.AddressZero);
        await core.connect(client).setBudget(1, 100_000000, EMPTY);
        await token.mint(client.address, 100_000000);
        const deadline = (await time.latest()) + 3600;
        const { v, r, s } = await signPermit(token, client, core.address, 100_000000, deadline);

        await expect(core.connect(client).fundWithPermit(1, 100_000000, EMPTY, deadline, v, r, s))
            .to.emit(core, "JobFunded")
            .withArgs(1, client.address, 100_000000);
        expect(await token.balanceOf(core.address)).to.equal(100_000000);
    });

    it("still funds when the permit was already submitted", async () => {
        const token = await deployUsdc();
        const core = await deployCore(token.address);
        const expiredAt = await defaultExpiry();
        await core
            .connect(client)
            .createJob(provider.address, evaluator.address, expiredAt, DESC, ethers.constants.AddressZero);
        await core.connect(client).setBudget(1, 100_000000, EMPTY);
        await token.mint(client.address, 100_000000);
        const deadline = (await time.latest()) + 3600;
        const { v, r, s } = await signPermit(token, client, core.address, 100_000000, deadline);
        await token.permit(client.address, core.address, 100_000000, deadline, v, r, s);
        await expect(core.connect(client).fundWithPermit(1, 100_000000, EMPTY, deadline, v, r, s)).to.emit(
            core,
            "JobFunded"
        );
    });
});
