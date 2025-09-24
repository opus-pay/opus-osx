import { BigNumber, constants, ContractReceipt, ContractTransaction, providers, Signer, utils } from "ethers";

export class ContractUtils {
    /**
     * Convert hexadecimal strings into Buffer.
     * @param hex The hexadecimal string
     */
    public static StringToBuffer(hex: string): Buffer {
        const start = hex.substring(0, 2) === "0x" ? 2 : 0;
        return Buffer.from(hex.substring(start), "hex");
    }

    /**
     * Convert Buffer into hexadecimal strings.
     * @param data The data
     */
    public static BufferToString(data: Buffer): string {
        return "0x" + data.toString("hex");
    }

    public static getTimeStamp(): number {
        return Math.floor(new Date().getTime() / 1000);
    }

    public static findLog(
        receipt: ContractReceipt,
        iface: utils.Interface,
        eventName: string
    ): providers.Log | undefined {
        return receipt.logs.find((log) => log.topics[0] === utils.id(iface.getEvent(eventName).format("sighash")));
    }

    public static async getEventValue(
        tx: ContractTransaction,
        iface: utils.Interface,
        event: string,
        field: string
    ): Promise<string | undefined> {
        const receipt = await tx.wait();
        const log = ContractUtils.findLog(receipt, iface, event);
        if (log !== undefined) {
            return iface.parseLog(log).args[field].toString();
        }
        return undefined;
    }

    public static async getEventValueBigNumber(
        tx: ContractTransaction,
        iface: utils.Interface,
        event: string,
        field: string
    ): Promise<BigNumber | undefined> {
        const receipt = await tx.wait();
        const log = ContractUtils.findLog(receipt, iface, event);
        if (log !== undefined) {
            return iface.parseLog(log).args[field];
        }
        return undefined;
    }

    public static async getEventValueString(
        tx: ContractTransaction,
        iface: utils.Interface,
        event: string,
        field: string
    ): Promise<string | undefined> {
        const receipt = await tx.wait();
        const log = ContractUtils.findLog(receipt, iface, event);
        if (log !== undefined) {
            return iface.parseLog(log).args[field];
        }
        return undefined;
    }

    public static async signMessage(signer: Signer, message: Uint8Array): Promise<string> {
        return signer.signMessage(message);
    }

    public static verifySignature(message: Uint8Array, signature: utils.BytesLike): string {
        try {
            return utils.verifyMessage(message, signature);
        } catch (error) {
            return constants.AddressZero;
        }
    }
}
