import { encodeFunctionData, getAddress, type Address, type Hex, type PublicClient, type WalletClient } from "viem";

import { forwarderAbi } from "./abi";

export const FORWARD_REQUEST_TYPES = {
    ForwardRequest: [
        { name: "from", type: "address" },
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "gas", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint48" },
        { name: "data", type: "bytes" },
    ],
} as const;

export type ForwardRequest = {
    from: Address;
    to: Address;
    value: bigint;
    gas: bigint;
    deadline: number;
    data: Hex;
    signature: Hex;
};

/** EIP-712 request for `OpusForwarder`. The nonce is signed and then read on chain; it is not a struct field. */
export async function signForwardRequest(
    publicClient: PublicClient,
    wallet: WalletClient,
    forwarder: Address,
    request: Omit<ForwardRequest, "signature">
): Promise<ForwardRequest> {
    const account = wallet.account;
    if (account === undefined || getAddress(account.address) !== getAddress(request.from)) {
        throw new Error("The wallet must be the request sender");
    }
    const nonce = await publicClient.readContract({
        address: forwarder,
        abi: forwarderAbi,
        functionName: "nonces",
        args: [request.from],
    });
    const chainId = wallet.chain?.id ?? publicClient.chain?.id;
    if (chainId === undefined) throw new Error("The wallet has no chain id");
    const signature = await wallet.signTypedData({
        account,
        domain: { name: "OpusForwarder", version: "1", chainId, verifyingContract: forwarder },
        types: FORWARD_REQUEST_TYPES,
        primaryType: "ForwardRequest",
        message: { ...request, nonce },
    });
    return { ...request, signature };
}

export function encodeForwarderExecute(request: ForwardRequest): Hex {
    return encodeFunctionData({ abi: forwarderAbi, functionName: "execute", args: [request] });
}
