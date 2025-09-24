import { expect } from "chai";
import { Wallet } from "ethers";
import hre, { ethers } from "hardhat";

import { runBootstrapProbeSmoke } from "../src/deploy/bootstrapProbe";
import { HardhatAccount } from "../src/HardhatAccount";
import { BootstrapProbe, BootstrapToken } from "../typechain-types";

describe("EVM target (D1)", () => {
    const raws = HardhatAccount.keys.map((key) => new Wallet(key, ethers.provider));
    const [deployer, other] = raws;

    let probe: BootstrapProbe;
    let token: BootstrapToken;

    before(async () => {
        const probeFactory = await ethers.getContractFactory("BootstrapProbe");
        probe = (await probeFactory.connect(deployer).deploy()) as BootstrapProbe;
        await probe.deployed();

        const tokenFactory = await ethers.getContractFactory("BootstrapToken");
        token = (await tokenFactory.connect(deployer).deploy()) as BootstrapToken;
        await token.deployed();
    });

    it("compiles Solidity 0.8.24 for cancun", () => {
        const compiler = hre.config.solidity.compilers[0];
        expect(compiler.version).to.equal("0.8.24");
        expect(compiler.settings.evmVersion).to.equal("cancun");
        expect((hre.network.config as { hardfork?: string }).hardfork).to.equal("cancun");
    });

    it("resolves EIP712, Nonces, ReentrancyGuard, and SafeERC20", async () => {
        expect(await probe.openzeppelinModulesResolve()).to.equal(true);
    });

    it("exposes a live EIP-712 domain", async () => {
        const domain = await probe.eip712Domain();
        expect(domain.name).to.equal("BootstrapProbe");
        expect(domain.version).to.equal("1");
        expect(domain.verifyingContract).to.equal(probe.address);
        expect(domain.chainId).to.equal(31337);

        const structHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("probe"));
        const domainSeparator = ethers.utils._TypedDataEncoder.hashDomain({
            name: "BootstrapProbe",
            version: "1",
            chainId: 31337,
            verifyingContract: probe.address,
        });
        const manual = ethers.utils.keccak256(ethers.utils.concat(["0x1901", domainSeparator, structHash]));
        expect(await probe.hashTyped(structHash)).to.equal(manual);
    });

    it("consumes a nonce and rejects a stale one", async () => {
        expect(await probe.nonces(other.address)).to.equal(0);
        await expect(probe.useCheckedNonce(other.address, 1))
            .to.be.revertedWithCustomError(probe, "InvalidAccountNonce")
            .withArgs(other.address, 0);

        await (await probe.consumeNonce(other.address)).wait();
        expect(await probe.nonces(other.address)).to.equal(1);

        await expect(probe.useCheckedNonce(other.address, 0))
            .to.be.revertedWithCustomError(probe, "InvalidAccountNonce")
            .withArgs(other.address, 1);
        await (await probe.useCheckedNonce(other.address, 1)).wait();
        expect(await probe.nonces(other.address)).to.equal(2);
    });

    it("moves tokens through SafeERC20 and nonReentrant", async () => {
        const amount = ethers.utils.parseEther("10");
        await token.connect(deployer).approve(probe.address, amount);
        await probe.connect(deployer).pull(token.address, deployer.address, amount);
        expect(await token.balanceOf(probe.address)).to.equal(amount);
    });

    it("runs Cancun MCOPY and transient storage", async () => {
        expect(await probe.memoryCopy("0x")).to.equal("0x");
        expect(await probe.memoryCopy("0xdeadbeef")).to.equal("0xdeadbeef");
        expect(await probe.callStatic.transientRoundtrip(7)).to.equal(7);
    });

    it("passes the Amoy deploy smoke helper on the in-memory chain", async () => {
        const factory = await ethers.getContractFactory("BootstrapProbe");
        const fresh = (await factory.connect(deployer).deploy()) as BootstrapProbe;
        await fresh.deployed();
        await runBootstrapProbeSmoke(fresh.connect(deployer) as BootstrapProbe, deployer.address);
        expect(await fresh.nonces(deployer.address)).to.equal(1);
    });
});
