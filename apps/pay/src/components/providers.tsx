"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import { WagmiProvider } from "wagmi";

import { wagmiConfig } from "../lib/wagmi";

export function Providers({ children }: { children: ReactNode }) {
    const [queryClient] = useState(() => new QueryClient());
    const [ready, setReady] = useState(false);
    useEffect(() => setReady(true), []);
    if (!ready) return <main className="mx-auto max-w-xl px-6 py-5">{children}</main>;
    return (
        <WagmiProvider config={wagmiConfig}>
            <QueryClientProvider client={queryClient}>
                <main className="mx-auto max-w-xl px-6 py-5">{children}</main>
                <Toaster />
            </QueryClientProvider>
        </WagmiProvider>
    );
}
