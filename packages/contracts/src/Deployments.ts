import { BaseContract, Signer } from "ethers";
import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

import { getNamedSigners } from "./utils/Signers";
import { HardhatAccount } from "./HardhatAccount";
import { NAMED_ACCOUNT_KEYS } from "./namedAccounts";
import { assertLiveNetworkSigners } from "./utils/LedgerAccounts";
import { assertLiveDeployEnv } from "./utils/NetworkEnv";

export interface IDeployedContract {
    name: string;
    address: string;
    contract: BaseContract;
}

export interface IAccount {
    deployer: Signer;
    treasury: Signer;
    operator: Signer;
    arbitrator: Signer;
}

export type FnDeployer = (accounts: IAccount, deployment: Deployments) => Promise<void>;

/**
 * 배포 단계를 순서대로 실행하고 결과 주소를 파일에 남깁니다.
 *
 * 배포를 중간부터 이어서 할 수 있도록 매 단계 직후 주소를 저장합니다. OpusVault ↔ OpusShop
 * 처럼 서로를 참조하는 컨트랙트는 1회성 초기화로 주소를 주입한 뒤 잠그므로, 어느 단계까지
 * 끝났는지가 파일에 남아 있어야 재실행이 안전합니다. 자세한 순서는 ROADMAP.md Part A.4를
 * 따릅니다.
 */
export class Deployments {
    public deployments: Map<string, IDeployedContract>;
    public deployers: FnDeployer[];
    public accounts: IAccount | undefined;

    private readonly network: string;

    constructor(network: string) {
        this.network = network;
        this.deployments = new Map<string, IDeployedContract>();
        this.deployers = [];
        this.accounts = undefined;
    }

    public get filename(): string {
        return path.join("deploy", this.network, "deployed_contracts.json");
    }

    /**
     * Live networks use Ledger signers when `*_ADDRESS` is set; localhost always uses software keys.
     */
    public async initAccounts() {
        const envFile = assertLiveDeployEnv(this.network);
        assertLiveNetworkSigners(this.network, process.env, NAMED_ACCOUNT_KEYS, envFile);
        const [deployer, treasury, operator, arbitrator] = await getNamedSigners(this.network);
        if (deployer === undefined || treasury === undefined || operator === undefined || arbitrator === undefined) {
            throw new Error("Named deploy accounts are missing");
        }
        this.accounts = { deployer, treasury, operator, arbitrator };
        if (this.network === "polygon" && HardhatAccount.ledgerAddress.length === 0) {
            console.warn(`Polygon deploy is using software keys. Set *_ADDRESS in ${envFile} to use a Ledger.`);
        }
    }

    public addContract(name: string, address: string, contract: BaseContract) {
        this.deployments.set(name, { name, address, contract });
    }

    public getContract(name: string): BaseContract | undefined {
        return this.deployments.get(name)?.contract;
    }

    public getContractAddress(name: string): string | undefined {
        return this.deployments.get(name)?.address;
    }

    public addDeployer(deployer: FnDeployer) {
        this.deployers.push(deployer);
    }

    /**
     * 한 단계라도 실패하면 즉시 중단합니다.
     *
     * @dev 실패를 무시하고 다음 단계로 넘어가면 주소가 주입되지 않은 채 초기화가 잠기거나
     *      권한 바인딩이 빠진 컨트랙트가 배포될 수 있습니다. 부분 배포 상태는 파일에 남으므로
     *      원인을 고친 뒤 재실행하십시오.
     */
    public async doDeploy() {
        if (this.accounts === undefined) {
            throw new Error("Call initAccounts() before doDeploy()");
        }
        for (const elem of this.deployers) {
            try {
                await elem(this.accounts, this);
            } catch (error) {
                this.saveContractInfo();
                throw error;
            }
            this.saveContractInfo();
        }
    }

    public async loadContractInfo() {
        if (!fs.existsSync(this.filename)) return;

        const data: any = JSON.parse(fs.readFileSync(this.filename, "utf-8"));
        for (const name of Object.keys(data)) {
            const address = data[name];
            console.log(`Load ${name} - ${address}...`);
            this.deployments.set(name, {
                name,
                address,
                contract: (await ethers.getContractFactory(name)).attach(address),
            });
        }
    }

    public saveContractInfo() {
        const contents: any = {};
        for (const key of this.deployments.keys()) {
            const item = this.deployments.get(key);
            if (item !== undefined) contents[key] = item.address;
        }
        fs.mkdirSync(path.dirname(this.filename), { recursive: true });
        // Four-space indent and a final newline match Prettier, so CI accepts the file as written.
        fs.writeFileSync(this.filename, `${JSON.stringify(contents, null, 4)}\n`, "utf-8");
    }
}
