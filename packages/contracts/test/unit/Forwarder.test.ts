import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { Wallet } from "ethers";
import { ethers } from "hardhat";

import { OpusAgenticCommerce, OpusForwarder } from "../../typechain-types";
import { defaultExpiry, deployUsdc, DESC, EMPTY, testWallets } from "../helpers/acp";

describe("OpusForwarder (#12)", () => {
    const wallets = testWallets();
    const [deployer, relayer, , , client, provider, evaluator] = wallets;

    const types = {
        ForwardRequest: [
            { name: "from", type: "address" },
            { name: "to", type: "address" },
            { name: "value", type: "uint256" },
            { name: "gas", type: "uint256" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint48" },
            { name: "data", type: "bytes" },
        ],
    };

    async function deployPair() {
        const forwarder = (await (await ethers.getContractFactory("OpusForwarder")).deploy()) as OpusForwarder;
        await forwarder.deployed();
        const token = await deployUsdc();
        const core = (await (
            await ethers.getContractFactory("OpusAgenticCommerce")
        ).deploy(
            token.address,
            6,
            ethers.constants.AddressZero,
            0,
            forwarder.address,
            ethers.constants.AddressZero
        )) as OpusAgenticCommerce;
        await core.deployed();
        return { forwarder, token, core };
    }

    async function signRequest(
        forwarder: OpusForwarder,
        signer: Wallet,
        to: string,
        data: string,
        deadline: number,
        chainId = 31337
    ) {
        const nonce = await forwarder.nonces(signer.address);
        const request = {
            from: signer.address,
            to,
            value: 0,
            gas: 1_000_000,
            deadline,
            data,
            signature: "0x",
        };
        const domain = {
            name: "OpusForwarder",
            version: "1",
            chainId,
            verifyingContract: forwarder.address,
        };
        const signature = await signer._signTypedData(domain, types, {
            from: request.from,
            to: request.to,
            value: request.value,
            gas: request.gas,
            nonce,
            deadline,
            data: request.data,
        });
        return { ...request, signature };
    }

    it("lets a relayer complete the standard flow for a signer (I-3)", async () => {
        const { forwarder, token, core } = await deployPair();
        const expiredAt = await defaultExpiry();
        const createData = core.interface.encodeFunctionData("createJob", [
            provider.address,
            evaluator.address,
            expiredAt,
            DESC,
            ethers.constants.AddressZero,
        ]);
        const deadline = (await time.latest()) + 3600;
        const createReq = await signRequest(forwarder, client, core.address, createData, deadline);
        await forwarder.connect(relayer).execute(createReq);

        await core.connect(client).setBudget(1, 100_000000, EMPTY);
        await token.mint(client.address, 100_000000);
        await token.connect(client).approve(core.address, 100_000000);
        await core.connect(client).fund(1, 100_000000, EMPTY);

        const submitData = core.interface.encodeFunctionData("submit", [1, ethers.constants.HashZero, EMPTY]);
        const submitReq = await signRequest(forwarder, provider, core.address, submitData, deadline);
        await forwarder.connect(relayer).execute(submitReq);

        const completeData = core.interface.encodeFunctionData("complete", [1, ethers.constants.HashZero, EMPTY]);
        const completeReq = await signRequest(forwarder, evaluator, core.address, completeData, deadline);
        await forwarder.connect(relayer).execute(completeReq);
        expect(await token.balanceOf(provider.address)).to.equal(100_000000);
        expect((await core.getJob(1)).client).to.equal(client.address);
    });

    it("rejects forged, expired, replayed, and wrong-chain requests", async () => {
        const { forwarder, core } = await deployPair();
        const expiredAt = await defaultExpiry();
        const data = core.interface.encodeFunctionData("createJob", [
            provider.address,
            evaluator.address,
            expiredAt,
            DESC,
            ethers.constants.AddressZero,
        ]);
        const deadline = (await time.latest()) + 3600;

        const forged = await signRequest(forwarder, deployer, core.address, data, deadline);
        forged.from = client.address;
        await expect(forwarder.connect(relayer).execute(forged)).to.be.revertedWithCustomError(
            forwarder,
            "ERC2771ForwarderInvalidSigner"
        );

        const expiredReq = await signRequest(forwarder, client, core.address, data, (await time.latest()) - 1);
        await expect(forwarder.connect(relayer).execute(expiredReq)).to.be.revertedWithCustomError(
            forwarder,
            "ERC2771ForwarderExpiredRequest"
        );

        const wrongChain = await signRequest(forwarder, client, core.address, data, deadline, 1);
        await expect(forwarder.connect(relayer).execute(wrongChain)).to.be.revertedWithCustomError(
            forwarder,
            "ERC2771ForwarderInvalidSigner"
        );

        const ok = await signRequest(forwarder, client, core.address, data, deadline);
        await forwarder.connect(relayer).execute(ok);
        await expect(forwarder.connect(relayer).execute(ok)).to.be.reverted;
    });

    it("lets a relayer configure and approve through the evaluator (I-3)", async () => {
        const { defaultConfig, deployEvaluator } = await import("../helpers/evaluator");
        const { forwarder, token, core } = await deployPair();
        const ev = await deployEvaluator(forwarder.address);
        const expiredAt = await defaultExpiry();
        await core.connect(client).createJob(provider.address, ev.address, expiredAt, DESC, ev.address);
        await core.connect(client).setBudget(1, 100_000000, EMPTY);
        const cfg = defaultConfig(wallets[8].address);
        const configureData = ev.interface.encodeFunctionData("configure", [core.address, 1, cfg]);
        const deadline = (await time.latest()) + 3600;
        await forwarder
            .connect(relayer)
            .execute(await signRequest(forwarder, client, ev.address, configureData, deadline));
        await token.mint(client.address, 100_000000);
        await token.connect(client).approve(core.address, 100_000000);
        await core.connect(client).fund(1, 100_000000, EMPTY);
        await core.connect(provider).submit(1, ethers.constants.HashZero, EMPTY);
        const approveData = ev.interface.encodeFunctionData("approve", [core.address, 1]);
        await forwarder
            .connect(relayer)
            .execute(await signRequest(forwarder, client, ev.address, approveData, deadline));
        expect((await core.getJob(1)).status).to.equal(3);
    });
});
