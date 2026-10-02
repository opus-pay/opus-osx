import type { ReactNode } from "react";
import { JetBrains_Mono, Schibsted_Grotesk } from "next/font/google";

import { Providers } from "../src/components/providers";
import "./globals.css";

const grotesk = Schibsted_Grotesk({ subsets: ["latin"], variable: "--font-grotesk" });
const code = JetBrains_Mono({ subsets: ["latin"], variable: "--font-code" });

export const metadata = {
    title: "OPUS payment link",
    description: "Fund an escrow job from a shared link.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="en" className={`${grotesk.variable} ${code.variable}`}>
            <body>
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
