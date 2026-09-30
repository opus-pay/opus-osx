import type { ReactNode } from "react";

import { Providers } from "../src/components/providers";
import "./globals.css";

export const metadata = {
    title: "OPUS payment link",
    description: "Fund an escrow job from a shared link.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="en">
            <body>
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
