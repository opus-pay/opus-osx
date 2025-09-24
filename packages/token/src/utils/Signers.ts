import { Signer, Wallet } from "ethers";
import { ethers } from "hardhat";

import { HardhatAccount } from "../HardhatAccount";
import { LIVE_NETWORKS } from "./NetworkEnv";

/**
 * Ledger signers are only used on live networks. Localhost keeps software keys
 * even when `*_ADDRESS` is set, so a Ledger device is not required for local deploys.
 */
export async function getNamedSigners(network: string): Promise<Signer[]> {
    if (LIVE_NETWORKS.has(network) && HardhatAccount.ledgerAddress.length > 0) {
        return Promise.all(HardhatAccount.ledgerAddress.map((address) => ethers.getSigner(address)));
    }
    return HardhatAccount.keys.map((key) => new Wallet(key, ethers.provider));
}
