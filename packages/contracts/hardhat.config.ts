import "@nomicfoundation/hardhat-chai-matchers";
import "@nomicfoundation/hardhat-ledger";
import "@nomicfoundation/hardhat-network-helpers";
import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-etherscan";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import "solidity-coverage";

import { Wallet } from "ethers";
import { HardhatAccount } from "./src/HardhatAccount";
import { NAMED_ACCOUNT_KEYS } from "./src/namedAccounts";
import { liveNetworkSignerConfig, readLedgerAddresses } from "./src/utils/LedgerAccounts";
import { loadNetworkEnv } from "./src/utils/NetworkEnv";

loadNetworkEnv();

/// 배포·운영 주체별 키를 고정 순서로 배치합니다. 이 순서는 deploy 스크립트와 테스트가
/// 공유하므로 중간에 항목을 끼워 넣지 마십시오.
const TOTAL_TEST_ACCOUNTS = 50;

function getAccounts(): string[] {
    const accounts: string[] = [];
    const reg_bytes64: RegExp = /^(0x)[0-9a-f]{64}$/i;

    for (const key of NAMED_ACCOUNT_KEYS) {
        const value = process.env[key];
        if (value !== undefined && value.trim() !== "" && reg_bytes64.test(value)) {
            accounts.push(value);
        } else {
            accounts.push(Wallet.createRandom().privateKey);
        }
    }

    while (accounts.length < TOTAL_TEST_ACCOUNTS) {
        accounts.push(Wallet.createRandom().privateKey);
    }

    if (HardhatAccount.keys.length === 0) {
        for (const account of accounts) {
            HardhatAccount.keys.push(account);
        }
    }

    return accounts;
}

function getTestAccounts() {
    const defaultBalance = "2000000000000000000000000";
    return getAccounts().map((m) => {
        return {
            privateKey: m,
            balance: defaultBalance,
        };
    });
}

function getLedgerAccounts(): string[] {
    if (HardhatAccount.ledgerAddress.length !== 0) return HardhatAccount.ledgerAddress;
    const addresses = readLedgerAddresses(process.env, NAMED_ACCOUNT_KEYS);
    for (const address of addresses) {
        HardhatAccount.ledgerAddress.push(address);
    }
    // Acceptance jobs are signed by these HD accounts, not by the deployer.
    if (process.env.ACCEPTANCE_LEDGER === "1") {
        HardhatAccount.ledgerAddress.push(
            "0x7b88b2324289d42C5972957eC09bfb9C7a7ECda0",
            "0xC012a2ab8C2949eC870c0A923c2EE7120474F7Be"
        );
    }
    return HardhatAccount.ledgerAddress;
}

function liveNetworkAccounts() {
    // Hardhat 2 ignores ledgerAccounts when `accounts` is also set on HTTP networks.
    return liveNetworkSignerConfig(getLedgerAccounts(), getAccounts());
}

const config = {
    solidity: {
        compilers: [
            {
                version: "0.8.24",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 2000,
                    },
                    // D1: Polygon PoS / Amoy Cancun subset. See docs/EVM_TARGET.md.
                    evmVersion: "cancun",
                },
            },
        ],
    },
    defaultNetwork: "hardhat",
    networks: {
        hardhat: {
            accounts: getTestAccounts(),
            chainId: 31337,
            hardfork: "cancun",
            gas: 12000000,
            gasPrice: 8000000000,
            blockGasLimit: 12000000,
        },
        localhost: {
            url: "http://127.0.0.1:8545",
            chainId: 31337,
            accounts: getAccounts(),
        },
        amoy: {
            url: process.env.AMOY_URL || "https://polygon-amoy-bor-rpc.publicnode.com",
            chainId: 80002,
            // Amoy rejects a tip under 25 gwei. dRPC's eth_gasPrice is ~400 gwei, which
            // prices one deploy at ~0.5 POL. Pin the chain minimum so the quote is not used.
            gasPrice: 25_000_000_000,
            ...liveNetworkAccounts(),
        },
        polygon: {
            url: process.env.POLYGON_URL || "https://polygon-rpc.com",
            chainId: 137,
            ...liveNetworkAccounts(),
        },
    },
    etherscan: {
        apiKey: {
            polygon: process.env.POLYGONSCAN_API_KEY || "",
            amoy: process.env.POLYGONSCAN_API_KEY || "",
        },
        customChains: [
            {
                network: "amoy",
                chainId: 80002,
                urls: {
                    apiURL: "https://api.etherscan.io/v2/api?chainid=80002",
                    browserURL: "https://amoy.polygonscan.com",
                },
            },
        ],
    },
    gasReporter: {
        enabled: process.env.REPORT_GAS !== undefined,
        currency: "USD",
    },
    typechain: {
        outDir: "typechain-types",
        target: "ethers-v5",
    },
    mocha: {
        timeout: 120000,
    },
};

export default config;
