"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import { WagmiProvider } from "wagmi";

import { addresses, wagmiConfig } from "../lib/wagmi";

function Frame({ children }: { children: ReactNode }) {
    const network = addresses.chainId === 80002 ? "Polygon Amoy testnet" : "Polygon";
    return (
        <>
            <header className="border-b border-line bg-white">
                <div className="mx-auto flex max-w-[44rem] items-center justify-between px-4 py-3">
                    <a href="/" className="text-[17px] font-bold tracking-tight text-ink no-underline">
                        OPUS
                    </a>
                    <span className="rounded-full bg-chain-wash px-3 py-1 text-[12.5px] font-medium text-chain">
                        {network}
                    </span>
                </div>
            </header>
            <main className="mx-auto max-w-[44rem] px-4 py-8">{children}</main>
        </>
    );
}

export function Providers({ children }: { children: ReactNode }) {
    const [queryClient] = useState(() => new QueryClient());
    const [ready, setReady] = useState(false);
    useEffect(() => setReady(true), []);
    if (!ready) return <Frame>{children}</Frame>;
    return (
        <WagmiProvider config={wagmiConfig}>
            <QueryClientProvider client={queryClient}>
                <Frame>{children}</Frame>
                <Toaster position="bottom-right" />
            </QueryClientProvider>
        </WagmiProvider>
    );
}
