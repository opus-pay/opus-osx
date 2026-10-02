"use client";

import { useEffect, useState } from "react";
import { erc20Abi, formatUnits, getAddress, zeroAddress, type Address } from "viem";
import { usePublicClient } from "wagmi";

import { addresses } from "../lib/wagmi";

function short(address: Address): string {
    return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function usdc(value: bigint | undefined): string {
    return value === undefined ? "…" : `${formatUnits(value, 6)} USDC`;
}

/** Wallet balances of both sides, and what this job holds in escrow. Re-read whenever `tick` changes. */
export function Balances({
    client,
    provider,
    escrow,
    me,
    tick,
}: {
    client?: Address;
    provider?: Address;
    escrow: { amount: bigint; note: string };
    me?: Address;
    tick: number;
}) {
    const publicClient = usePublicClient();
    const [held, setHeld] = useState<{ client?: bigint; provider?: bigint }>({});
    useEffect(() => {
        if (publicClient === undefined) return;
        let cancel = false;
        const read = (who?: Address) =>
            who === undefined || who === zeroAddress
                ? Promise.resolve(undefined)
                : publicClient.readContract({
                      address: addresses.usdc,
                      abi: erc20Abi,
                      functionName: "balanceOf",
                      args: [who],
                  });
        void Promise.all([read(client), read(provider)])
            .then(([c, p]) => {
                if (!cancel) setHeld({ client: c, provider: p });
            })
            .catch(() => undefined);
        return () => {
            cancel = true;
        };
    }, [publicClient, client, provider, tick]);

    const row = (label: string, who: Address | undefined, value: bigint | undefined) => (
        <tr className="border-t border-stone-200">
            <td className="py-1 pr-3 text-stone-500">{label}</td>
            <td className="py-1 pr-3 font-mono">
                {who === undefined || who === zeroAddress ? "not set" : short(who)}
                {who !== undefined && me !== undefined && getAddress(who) === me ? " (you)" : ""}
            </td>
            <td className="py-1 text-right">{usdc(value)}</td>
        </tr>
    );

    return (
        <table className="w-full rounded bg-white text-sm">
            <tbody>
                {row("Client", client, held.client)}
                {row("Provider", provider, held.provider)}
                <tr className="border-t border-stone-200">
                    <td className="py-1 pr-3 text-stone-500">Escrow</td>
                    <td className="py-1 pr-3">{escrow.note}</td>
                    <td className="py-1 text-right">{usdc(escrow.amount)}</td>
                </tr>
            </tbody>
        </table>
    );
}
