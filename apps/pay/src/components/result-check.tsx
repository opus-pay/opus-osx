"use client";

import { Check, ExternalLink, X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import type { Address, Hex } from "viem";

import { findDeliverable, sameFingerprint, type LogReader } from "../lib/deliverable";
import { proofHash } from "../lib/proof";
import { hostOf, parseResultUrl, resultLinkFor } from "../lib/result-link";
import { useLocale } from "./locale";
import { SectionLabel, fieldClass, secondaryButtonClass } from "./stage";

/**
 * Client side, while a proof waits for approval: the link to the deliverable the provider shared (from the address,
 * or pasted), and a check of the downloaded file against the fingerprint the provider stored on the chain.
 */
export function ResultCheck({
    jobId,
    instance,
    reader,
    linkFromAddress,
}: {
    jobId: bigint;
    instance: Address;
    reader: LogReader | undefined;
    linkFromAddress: string | undefined;
}) {
    const { t } = useLocale();
    const [pasted, setPasted] = useState("");
    const [state, setState] = useState<"idle" | "searching" | "match" | "mismatch" | "missing">("idle");
    const onChain = useRef<Hex | undefined>(undefined);
    const link = linkFromAddress ?? parseResultUrl(pasted);

    async function check(file: File | undefined) {
        if (file === undefined) return setState("idle");
        setState("searching");
        try {
            const mine = proofHash(new Uint8Array(await file.arrayBuffer()));
            if (onChain.current === undefined && reader !== undefined) {
                onChain.current = await findDeliverable(reader, instance, jobId);
            }
            if (onChain.current === undefined) return setState("missing");
            setState(sameFingerprint(mine, onChain.current) ? "match" : "mismatch");
        } catch {
            setState("missing");
        }
    }

    return (
        <section className="flex flex-col gap-4">
            <SectionLabel>{t("result.title")}</SectionLabel>
            {link !== undefined ? (
                <div className="flex flex-col gap-1.5">
                    <span className="text-[14.5px] font-semibold text-ink-soft">{t("result.fromProvider")}</span>
                    <a
                        className="inline-flex items-center gap-1.5 break-all text-cobalt"
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        {hostOf(link)}
                        <ExternalLink size={14} aria-hidden />
                    </a>
                    <span className="text-[14px] text-amber">{t("result.warn")}</span>
                </div>
            ) : (
                <label className="block">
                    <span className="text-[14.5px] font-semibold text-ink-soft">{t("result.paste")}</span>
                    <input
                        className={fieldClass}
                        value={pasted}
                        onChange={(event) => setPasted(event.target.value.trim())}
                        placeholder="https://"
                    />
                </label>
            )}
            <div className="flex flex-col gap-1.5">
                <span className="text-[14.5px] font-semibold text-ink-soft">{t("result.verifyTitle")}</span>
                <p className="m-0 text-[14.5px] text-muted">{t("result.verifyHint")}</p>
                <input
                    className="block w-full text-[15.5px] text-ink-soft file:mr-3 file:rounded-lg file:border file:border-line file:bg-white file:px-3 file:py-2 file:text-[15.5px] file:font-medium file:text-ink"
                    type="file"
                    onChange={(event) => void check(event.target.files?.[0])}
                />
                {state === "searching" && <span className="text-[14.5px] text-muted">{t("result.searching")}</span>}
                {state === "missing" && <span className="text-[14.5px] text-amber">{t("result.noHash")}</span>}
                {state === "match" && (
                    <span className="flex items-center gap-1.5 text-[15.5px] font-semibold text-emerald">
                        <Check size={16} strokeWidth={3} aria-hidden />
                        {t("result.match")}
                    </span>
                )}
                {state === "mismatch" && (
                    <span className="flex items-center gap-1.5 text-[15.5px] font-semibold text-amber">
                        <X size={16} strokeWidth={3} aria-hidden />
                        {t("result.mismatch")}
                    </span>
                )}
            </div>
        </section>
    );
}

/**
 * Provider side, after submitting: makes the link to send to the client. The deliverable link rides after the `#`, so
 * no server sees it, and nothing about it goes on the chain.
 */
export function ResultShare({ jobId, url, onUrl }: { jobId: bigint; url: string; onUrl: (value: string) => void }) {
    const { t } = useLocale();
    const [link, setLink] = useState("");
    const valid = parseResultUrl(url) !== undefined;

    async function copy() {
        try {
            const next = resultLinkFor(window.location.origin, jobId, url);
            setLink(next);
            await navigator.clipboard.writeText(next);
            toast.success(t("result.share.copied"));
        } catch (error) {
            toast.error(error instanceof Error ? t("job.resultBad") : t("tx.failed"));
        }
    }

    return (
        <section className="flex flex-col gap-2">
            <SectionLabel>{t("result.share.title")}</SectionLabel>
            <input
                className={fieldClass}
                value={url}
                onChange={(event) => onUrl(event.target.value.trim())}
                placeholder="https://"
                aria-label={t("job.resultUrl")}
            />
            {url !== "" && !valid && <span className="text-[14.5px] text-amber">{t("job.resultBad")}</span>}
            <button
                className={`${secondaryButtonClass} self-start`}
                type="button"
                disabled={!valid}
                onClick={() => void copy()}
            >
                {t("result.share.copy")}
            </button>
            {link !== "" && (
                <p className="m-0 break-all rounded-lg bg-canvas px-3 py-2.5 font-mono text-[14px] text-ink-soft">
                    {link}
                </p>
            )}
            <p className="m-0 text-[14px] text-muted">{t("result.share.note")}</p>
        </section>
    );
}
