"use client";

import { getAddress } from "viem";

export function AddressLine({ label, address }: { label: string; address: string }) {
    const shown = getAddress(address);
    return (
        <div className="flex items-baseline gap-3 rounded border border-stone-300 bg-white px-3 py-2">
            <div className="w-16 shrink-0 text-sm text-stone-500">{label}</div>
            <div className="min-w-0 break-all font-mono text-sm">{shown}</div>
        </div>
    );
}
