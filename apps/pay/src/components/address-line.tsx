"use client";

import { getAddress } from "viem";

export function AddressLine({ label, address }: { label: string; address: string }) {
    const shown = getAddress(address);
    return (
        <div className="rounded-lg border border-stone-300 bg-white p-4">
            <div className="text-sm text-stone-500">{label}</div>
            <div className="mt-1 break-all font-mono text-2xl">{shown}</div>
        </div>
    );
}
