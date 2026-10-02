"use client";

import { ArrowRight, Copy, Lock, LockOpen } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { erc20Abi, getAddress, zeroAddress, type Address } from "viem";
import { usePublicClient } from "wagmi";

import { usdcText } from "../lib/terms";
import { useLocale } from "./locale";
import { addresses } from "../lib/wagmi";

function short(address: Address): string {
    return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function Amount({ value, size }: { value: bigint | undefined; size: "md" | "lg" }) {
    return (
        <span className={`${size === "lg" ? "text-[28px] font-bold" : "text-[19px] font-semibold"}`}>
            {value === undefined ? "…" : usdcText(value)}
            <span className="ml-1 text-[14px] font-medium text-muted">USDC</span>
        </span>
    );
}

function Party({
    label,
    who,
    value,
    you,
}: {
    label: string;
    who: Address | undefined;
    value: bigint | undefined;
    you: boolean;
}) {
    const { t } = useLocale();
    return (
        <div className="flex min-w-0 flex-col gap-1 rounded-xl border border-line p-3">
            <div className="flex items-center gap-2 text-[14.5px] font-semibold text-ink-soft">
                {label}
                {you && (
                    <span className="rounded-full bg-cobalt-wash px-2 text-[13px] font-semibold text-cobalt">
                        {t("you")}
                    </span>
                )}
            </div>
            {who === undefined || who === zeroAddress ? (
                <div className="font-mono text-[14px] text-muted">{t("money.notSet")}</div>
            ) : (
                <button
                    type="button"
                    className="group inline-flex items-center gap-1.5 self-start font-mono text-[14px] text-muted hover:text-ink"
                    title={`${getAddress(who)} (${t("money.copyHint")})`}
                    aria-label={`${label} ${getAddress(who)} (${t("money.copyHint")})`}
                    onClick={() =>
                        void navigator.clipboard
                            .writeText(getAddress(who))
                            .then(() => toast.success(t("money.copied", { role: label })))
                            .catch(() => toast.error(t("money.copyFailed")))
                    }
                >
                    {short(who)}
                    <Copy size={12} className="opacity-60 group-hover:opacity-100" aria-hidden />
                </button>
            )}
            <Amount value={value} size="md" />
        </div>
    );
}

function Flow() {
    return <ArrowRight className="hidden self-center text-line sm:block" size={20} strokeWidth={2.5} aria-hidden />;
}

/**
 * Where the money is: the client's wallet, this job's escrow, the provider's wallet.
 * The escrow tile turns emerald while USDC is locked for the job. Re-read whenever `tick` changes.
 */
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
    const { t } = useLocale();
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

    const isMe = (who?: Address) =>
        who !== undefined && who !== zeroAddress && me !== undefined && getAddress(who) === me;
    const locked = escrow.amount > 0n;
    const escrowTile: ReactNode = (
        <div
            className={`flex min-w-0 flex-col gap-1 rounded-xl border p-3 ${
                locked ? "border-emerald/50 bg-emerald-wash" : "border-dashed border-line bg-canvas"
            }`}
        >
            <div
                className={`flex items-center gap-1.5 text-[14.5px] font-semibold ${
                    locked ? "text-emerald" : "text-ink-soft"
                }`}
            >
                {locked ? <Lock size={14} strokeWidth={2.5} aria-hidden /> : <LockOpen size={14} aria-hidden />}
                {t("money.escrow")}
            </div>
            <Amount value={escrow.amount} size="lg" />
            <div className="text-[14px] leading-snug text-muted">{escrow.note}</div>
        </div>
    );

    return (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_1.3fr_auto_1fr]">
            <Party label={t("roleTitle.client")} who={client} value={held.client} you={isMe(client)} />
            <Flow />
            {escrowTile}
            <Flow />
            <Party label={t("roleTitle.provider")} who={provider} value={held.provider} you={isMe(provider)} />
        </div>
    );
}
