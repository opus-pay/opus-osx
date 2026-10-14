"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { Hash } from "viem";

import { isRejection, explorerTx, type TxPhase } from "../lib/tx";
import { addresses } from "../lib/wagmi";
import { useLocale } from "./locale";

const TX_TOAST = "tx";

/**
 * What a screen shows while a transaction runs, in two waits: the wallet asking for a signature, then the network
 * confirming the signed transaction (with a link to see it on the explorer). Use `onPhase` as the callback of
 * `sendAndConfirm`, call `finish` when the work is over, and `label(...)` for the button text.
 */
export function useTxFeedback() {
    const { t } = useLocale();
    const [phase, setPhase] = useState<TxPhase>("idle");

    const onPhase = useCallback(
        (next: TxPhase, hash?: Hash) => {
            setPhase(next);
            if (next === "signing") toast.loading(t("tx.signing"), { id: TX_TOAST });
            if (next === "confirming") {
                const url = hash === undefined ? undefined : explorerTx(addresses.chainId, hash);
                toast.loading(t("tx.confirming"), {
                    id: TX_TOAST,
                    ...(url === undefined
                        ? {}
                        : {
                              action: {
                                  label: t("tx.open"),
                                  onClick: () => window.open(url, "_blank", "noopener,noreferrer"),
                              },
                          }),
                });
            }
        },
        [t]
    );

    const finish = useCallback(() => {
        toast.dismiss(TX_TOAST);
        setPhase("idle");
    }, []);

    /** The button text: the wait the transaction is in, or `idle` when none. */
    const label = (idle: string): string =>
        phase === "signing" ? t("button.signing") : phase === "confirming" ? t("button.confirming") : idle;

    /** The message for a failed step: a short one when the person cancelled in the wallet. */
    const failure = (error: unknown): string =>
        isRejection(error) ? t("tx.rejected") : error instanceof Error ? error.message : t("tx.failed");

    return { phase, onPhase, finish, label, failure };
}
