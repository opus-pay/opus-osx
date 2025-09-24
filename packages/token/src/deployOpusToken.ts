import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

import { HardhatAccount } from "./HardhatAccount";
import { NAMED_ACCOUNT_KEYS } from "./namedAccounts";
import { assertLiveNetworkSigners } from "./utils/LedgerAccounts";
import { assertLiveDeployEnv } from "./utils/NetworkEnv";
import { getNamedSigners } from "./utils/Signers";
import { OpusToken } from "../typechain-types";

export async function deployOpusToken(network: string) {
    const envFile = assertLiveDeployEnv(network);
    assertLiveNetworkSigners(network, process.env, NAMED_ACCOUNT_KEYS, envFile);
    const [deployer, treasury, sale, team, marketing, liquidity] = await getNamedSigners(network);
    if (
        deployer === undefined ||
        treasury === undefined ||
        sale === undefined ||
        team === undefined ||
        marketing === undefined ||
        liquidity === undefined
    ) {
        throw new Error("Named deploy accounts are missing");
    }
    if (network === "polygon" && HardhatAccount.ledgerAddress.length === 0) {
        console.warn(`Polygon deploy is using software keys. Set *_ADDRESS in ${envFile} to use a Ledger.`);
    }

    const factory = await ethers.getContractFactory("OpusToken");
    const token = (await factory
        .connect(deployer)
        .deploy(
            await treasury.getAddress(),
            await sale.getAddress(),
            await team.getAddress(),
            await marketing.getAddress(),
            await liquidity.getAddress()
        )) as OpusToken;
    await token.deployed();

    const out = path.join("deploy", network, "deployed_contracts.json");
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify({ OpusToken: token.address }, null, 2), "utf-8");
    console.log(`OpusToken deployed to ${token.address}`);
}
