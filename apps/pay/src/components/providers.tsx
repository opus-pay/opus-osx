"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import { WagmiProvider } from "wagmi";

import { addresses, wagmiConfig } from "../lib/wagmi";
import { LanguageSelect, LocaleProvider, useLocale } from "./locale";

function Frame({ children }: { children: ReactNode }) {
    const { t } = useLocale();
    const network = addresses.chainId === 80002 ? t("nav.testnet") : t("nav.mainnet");
    return (
        <>
            <header className="border-b border-line bg-white">
                <div className="mx-auto flex max-w-[58rem] items-center justify-between px-4 py-2.5">
                    <a href="/" className="text-[19px] font-bold tracking-tight text-ink no-underline">
                        OPUS
                    </a>
                    <div className="flex items-center gap-2">
                        <span className="rounded-full bg-chain-wash px-3 py-1 text-[14px] font-medium text-chain">
                            {network}
                        </span>
                        <LanguageSelect />
                    </div>
                </div>
            </header>
            <main className="mx-auto max-w-[58rem] px-4 py-5">{children}</main>
        </>
    );
}

export function Providers({ children }: { children: ReactNode }) {
    const [queryClient] = useState(() => new QueryClient());
    const [ready, setReady] = useState(false);
    useEffect(() => setReady(true), []);
    if (!ready) {
        return (
            <LocaleProvider>
                <Frame>{children}</Frame>
            </LocaleProvider>
        );
    }
    return (
        <LocaleProvider>
            <WagmiProvider config={wagmiConfig}>
                <QueryClientProvider client={queryClient}>
                    <Frame>{children}</Frame>
                    <Toaster position="bottom-right" />
                </QueryClientProvider>
            </WagmiProvider>
        </LocaleProvider>
    );
}
