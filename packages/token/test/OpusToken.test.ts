import { expect } from "chai";
import { Wallet, constants } from "ethers";
import { ethers } from "hardhat";

import { HardhatAccount } from "../src/HardhatAccount";
import { OpgAmount } from "../src/utils/Amount";
import { OpusToken } from "../typechain-types";

describe("OpusToken", () => {
    const raws = HardhatAccount.keys.map((m) => new Wallet(m, ethers.provider));
    const [deployer, treasury, sale, team, marketing, liquidity, holder] = raws;

    const supply = OpgAmount.make("1000000000").value;
    const treasuryAmount = OpgAmount.make("400000000").value;
    const saleAmount = OpgAmount.make("200000000").value;
    const teamAmount = OpgAmount.make("200000000").value;
    const marketingAmount = OpgAmount.make("160000000").value;
    const liquidityAmount = OpgAmount.make("40000000").value;

    let token: OpusToken;

    async function deploy(
        treasuryAddr = treasury.address,
        saleAddr = sale.address,
        teamAddr = team.address,
        marketingAddr = marketing.address,
        liquidityAddr = liquidity.address
    ) {
        const factory = await ethers.getContractFactory("OpusToken");
        const instance = (await factory
            .connect(deployer)
            .deploy(treasuryAddr, saleAddr, teamAddr, marketingAddr, liquidityAddr)) as OpusToken;
        await instance.deployed();
        return instance;
    }

    before(async () => {
        token = await deploy();
    });

    it("sets ERC-20 name, symbol, and 18 decimals", async () => {
        expect(await token.name()).to.equal("OPUS Governance");
        expect(await token.symbol()).to.equal("OPG");
        expect(await token.decimals()).to.equal(18);
    });

    it("mints the full fixed supply to the five allocation recipients", async () => {
        expect(await token.INITIAL_SUPPLY()).to.equal(supply);
        expect(await token.TREASURY_ALLOCATION()).to.equal(treasuryAmount);
        expect(await token.SALE_ALLOCATION()).to.equal(saleAmount);
        expect(await token.TEAM_ALLOCATION()).to.equal(teamAmount);
        expect(await token.MARKETING_ALLOCATION()).to.equal(marketingAmount);
        expect(await token.LIQUIDITY_ALLOCATION()).to.equal(liquidityAmount);

        expect(await token.totalSupply()).to.equal(supply);
        expect(await token.balanceOf(treasury.address)).to.equal(treasuryAmount);
        expect(await token.balanceOf(sale.address)).to.equal(saleAmount);
        expect(await token.balanceOf(team.address)).to.equal(teamAmount);
        expect(await token.balanceOf(marketing.address)).to.equal(marketingAmount);
        expect(await token.balanceOf(liquidity.address)).to.equal(liquidityAmount);
        expect(await token.balanceOf(deployer.address)).to.equal(0);
    });

    it("has no mint, burn, pause, blacklist, or votes surface", () => {
        const forbidden = [
            "mint",
            "mintTo",
            "mint(address,uint256)",
            "burn",
            "burnFrom",
            "pause",
            "unpause",
            "blacklist",
            "setBlacklist",
            "getVotes",
            "getPastVotes",
            "delegate",
            "delegates",
        ];
        for (const signature of forbidden) {
            expect(() => token.interface.getFunction(signature)).to.throw();
        }
    });

    it("reverts when any allocation recipient is the zero address", async () => {
        const recipients = [treasury.address, sale.address, team.address, marketing.address, liquidity.address];
        for (let i = 0; i < recipients.length; i++) {
            const args = [...recipients];
            args[i] = constants.AddressZero;
            const factory = await ethers.getContractFactory("OpusToken");
            await expect(
                factory.connect(deployer).deploy(args[0], args[1], args[2], args[3], args[4], {
                    gasLimit: 5_000_000,
                })
            ).to.be.revertedWithCustomError(token, "ZeroRecipient");
        }
    });

    it("does not change totalSupply after transfer and transferFrom", async () => {
        const amount = OpgAmount.make("1").value;
        const before = await token.totalSupply();

        await token.connect(treasury).transfer(holder.address, amount);
        expect(await token.totalSupply()).to.equal(before);
        expect(await token.balanceOf(holder.address)).to.equal(amount);

        await token.connect(holder).approve(sale.address, amount);
        await token.connect(sale).transferFrom(holder.address, sale.address, amount);
        expect(await token.totalSupply()).to.equal(before);
        expect(await token.totalSupply()).to.equal(supply);
    });
});
