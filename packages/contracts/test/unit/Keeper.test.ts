import { time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { Wallet } from "ethers";
import { ethers, network } from "hardhat";
import {
    createPublicClient,
    createWalletClient,
    custom,
    getAddress,
    zeroAddress,
    zeroHash,
    type Address,
    type Hash,
    type PublicClient,
} from "viem";

import { Keeper } from "../../../keeper/src";
import {
    localHardhat,
    minimumExpiredAt,
    Opus,
    presetAiToAi,
    tokenUnitsForUsd,
    type EvaluatorConfig,
    type ProtocolAddresses,
} from "../../../sdk/src";
import { MockPermitToken, OpusForwarder } from "../../typechain-types";
import { testWallets } from "../helpers/acp";

const BUDGET = tokenUnitsForUsd(10n, 6);
const FEE = 2_000000n;
const TIP = 1_000000n;

function units(amount: bigint) {
    return ethers.BigNumber.from(amount.toString());
}

describe("Keeper on a local Hardhat node (#24)", () => {
    const wallets = testWallets();
    const [deployer, operator, , keeperWallet, client, provider] = wallets;

    async function world() {
        const token = (await (
            await ethers.getContractFactory("MockPermitToken")
        ).deploy("USD Coin", "USDC", 6)) as MockPermitToken;
        await token.deployed();
        const forwarder = (await (await ethers.getContractFactory("OpusForwarder")).deploy()) as OpusForwarder;
        await forwarder.deployed();
        const core = await (
            await ethers.getContractFactory("OpusAgenticCommerce")
        ).deploy(token.address, 6, ethers.constants.AddressZero, 0, forwarder.address, ethers.constants.AddressZero);
        await core.deployed();
        const evaluator = await (await ethers.getContractFactory("OptimisticEvaluator")).deploy(forwarder.address);
        await evaluator.deployed();
        const addresses: ProtocolAddresses = {
            network: "hardhat",
            chainId: 31337,
            forwarder: getAddress(forwarder.address),
            factory: zeroAddress,
            usdc: getAddress(token.address),
            instance: getAddress(core.address),
            evaluator: getAddress(evaluator.address),
        };
        const transport = custom(network.provider);
        const publicClient = createPublicClient({ chain: localHardhat, transport });
        const asOpus = (account: Wallet) =>
            new Opus(
                publicClient,
                addresses,
                createWalletClient({ account: getAddress(account.address), chain: localHardhat, transport })
            );
        await token.mint(client.address, units(tokenUnitsForUsd(1_000n, 6)));
        return {
            token,
            publicClient,
            addresses,
            client: asOpus(client),
            provider: asOpus(provider),
            keeper: asOpus(keeperWallet),
            keeperAddress: getAddress(keeperWallet.address),
        };
    }

    async function mine(publicClient: PublicClient, hash: Hash) {
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        expect(receipt.status).to.equal("success");
    }

    async function open(opus: Opus, config: EvaluatorConfig) {
        const now = BigInt(await time.latest()) + 300n;
        return opus.createJob({
            provider: getAddress(provider.address),
            expiredAt: minimumExpiredAt(now, config),
            description: "ipfs://keeper",
        });
    }

    async function fund(opus: Opus, publicClient: PublicClient, jobId: bigint, config: EvaluatorConfig) {
        await mine(publicClient, await opus.approveEvaluation(config.evaluationFee));
        await mine(publicClient, await opus.configure(jobId, config));
        await mine(publicClient, await opus.quote(jobId, BUDGET));
        await mine(publicClient, await opus.approveBudget(BUDGET));
        await mine(publicClient, await opus.fund(jobId, BUDGET));
    }

    function watcher(opus: Opus, keeperAddress: Address, marginSeconds = 60n) {
        return new Keeper(opus, keeperAddress, {
            marginSeconds,
            lowBalanceWei: 0n,
            attempts: 2,
            baseDelayMs: 1,
            sleep: async () => undefined,
        });
    }

    it("finalizes a silent submission and pays the tip to a wallet that is not the deployer", async () => {
        const env = await world();
        expect(env.keeperAddress).to.not.equal(getAddress(deployer.address));
        const config = presetAiToAi({ operator: getAddress(operator.address), evaluationFee: FEE, keeperTip: TIP });
        const jobId = await open(env.client, config);
        await fund(env.client, env.publicClient, jobId, config);
        await mine(env.publicClient, await env.provider.submit(jobId, zeroHash, BUDGET));

        const keeper = watcher(env.keeper, env.keeperAddress);
        expect((await keeper.tick()).calls).to.deep.equal([]);
        await time.increaseTo(Number((await env.client.status(jobId, env.keeperAddress)).nextDeadline));
        const acted = await keeper.tick();
        expect(acted.calls.map((call) => call.action)).to.deep.equal(["finalize"]);
        expect((await env.client.job(jobId)).status).to.equal("Completed");
        expect(await env.token.balanceOf(env.keeperAddress)).to.equal(units(TIP));
        expect(await env.token.balanceOf(operator.address)).to.equal(units(FEE - TIP));
    });

    it("rejects a job whose submit window passed and pays the tip", async () => {
        const env = await world();
        const config = presetAiToAi({ operator: getAddress(operator.address), evaluationFee: FEE, keeperTip: TIP });
        const jobId = await open(env.client, config);
        await fund(env.client, env.publicClient, jobId, config);
        await time.increaseTo(Number((await env.client.status(jobId, env.keeperAddress)).nextDeadline));
        const acted = await watcher(env.keeper, env.keeperAddress).tick();
        expect(acted.calls.map((call) => call.action)).to.deep.equal(["timeoutNoSubmission"]);
        expect((await env.client.job(jobId)).status).to.equal("Rejected");
        expect(await env.token.balanceOf(env.keeperAddress)).to.equal(units(TIP));
    });

    it("skips other evaluators and alerts on a low balance or a close expiry", async () => {
        const env = await world();
        const config = presetAiToAi({ operator: getAddress(operator.address) });
        const now = BigInt(await time.latest()) + 300n;
        await env.client.createJob({
            provider: getAddress(provider.address),
            evaluator: getAddress(client.address),
            hook: zeroAddress,
            expiredAt: minimumExpiredAt(now, config),
            description: "ipfs://other",
        });
        const tracked = await open(env.client, config);
        await fund(env.client, env.publicClient, tracked, config);
        const alerts: string[] = [];
        const keeper = new Keeper(env.keeper, env.keeperAddress, {
            marginSeconds: 1_000_000n,
            lowBalanceWei: 10n ** 30n,
            onAlert: (alert) => alerts.push(alert.kind),
        });
        const result = await keeper.tick();
        expect(result.calls).to.deep.equal([]);
        expect(alerts).to.include("low-balance");
        expect(alerts).to.include("near-expiry");
    });
});
