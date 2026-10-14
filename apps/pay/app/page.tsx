"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { getAddress, isAddress } from "viem";
import { useAccount, useConnect } from "wagmi";

import { Stage, StageTab, fieldClass, primaryButtonClass, secondaryButtonClass } from "../src/components/stage";
import { suggestCriteria, type CriteriaKind } from "../src/lib/criteria";
import { encodeDraft, linkFor, PRESETS, type Draft, type PresetName } from "../src/lib/draft";
import { useLocale } from "../src/components/locale";
import { localizeError, type MessageKey } from "../src/lib/i18n";
import { presetLabel } from "../src/lib/terms";

const STEPS: MessageKey[] = ["draft.tab.parties", "draft.tab.payment", "draft.tab.agreement"];
const CRITERIA: CriteriaKind[] = ["errand", "code", "report", "design"];

export default function DraftPage() {
    const { locale, t } = useLocale();
    const [step, setStep] = useState(0);
    const [from, setFrom] = useState("");
    const [counterparty, setCounterparty] = useState("");
    const [amountUsd, setAmountUsd] = useState("25");
    const [preset, setPreset] = useState<PresetName>("smallNoArbiter");
    const [agreement, setAgreement] = useState("");
    const [criteriaKind, setCriteriaKind] = useState<CriteriaKind>("errand");
    const [assistant, setAssistant] = useState("");
    const [hours, setHours] = useState("24");
    const [lock, setLock] = useState<1 | 2>(2);
    const [drafter, setDrafter] = useState<"client" | "provider">("client");
    const [link, setLink] = useState("");
    // The wallet hooks need the wallet provider, which is there only once the page has mounted.
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    const [fromTyped, setFromTyped] = useState(false);
    const fillFrom = useCallback((address: string) => setFrom(address), []);

    function share() {
        try {
            if (!isAddress(from) || !isAddress(counterparty)) throw new Error(t("draft.needAddresses"));
            const life = Number(hours);
            if (!Number.isInteger(life) || life < 1) throw new Error(t("draft.minHours"));
            const draft: Draft = {
                v: 1,
                expiresAt: Math.floor(Date.now() / 1000) + life * 3600,
                from,
                counterparty,
                amountUsd: Number(amountUsd),
                preset,
                agreement,
                lock,
                drafter,
            };
            const next = linkFor(window.location.origin, draft);
            encodeDraft(draft);
            setLink(next);
            void navigator.clipboard.writeText(next);
            toast.success(t("draft.copied"));
        } catch (error) {
            toast.error(error instanceof Error ? localizeError(locale, error.message) : t("draft.cannotMake"));
        }
    }

    return (
        <Stage
            title={t("draft.title")}
            tabs={STEPS.map((label, index) => (
                <StageTab key={label} current={step === index} onClick={() => setStep(index)}>
                    {index + 1}. {t(label)}
                </StageTab>
            ))}
            footer={
                <>
                    {step < 2 ? (
                        <button className={primaryButtonClass} type="button" onClick={() => setStep(step + 1)}>
                            {t("draft.next")}
                        </button>
                    ) : (
                        <button className={primaryButtonClass} type="button" onClick={share}>
                            {t("draft.create")}
                        </button>
                    )}
                    {step > 0 && (
                        <button className={secondaryButtonClass} type="button" onClick={() => setStep(step - 1)}>
                            {t("draft.back")}
                        </button>
                    )}
                </>
            }
        >
            {step === 0 && (
                <div className="flex flex-col gap-5" role="tabpanel">
                    <Field label={t("draft.youAre")}>
                        <select
                            className={fieldClass}
                            value={drafter}
                            onChange={(event) => setDrafter(event.target.value as "client" | "provider")}
                        >
                            <option value="client">{t("role.client")}</option>
                            <option value="provider">{t("role.provider")}</option>
                        </select>
                    </Field>
                    <Field label={t("draft.yourAddress")}>
                        <input
                            className={`${fieldClass} font-mono`}
                            value={from}
                            onChange={(event) => {
                                setFromTyped(true);
                                setFrom(event.target.value.trim());
                            }}
                        />
                    </Field>
                    {mounted && <WalletFill current={from} typed={fromTyped} onFill={fillFrom} />}
                    <Field label={t("draft.counterparty")}>
                        <input
                            className={`${fieldClass} font-mono`}
                            value={counterparty}
                            onChange={(event) => setCounterparty(event.target.value.trim())}
                        />
                    </Field>
                </div>
            )}
            {step === 1 && (
                <div className="flex flex-col gap-5" role="tabpanel">
                    <Field label={t("draft.amount")}>
                        <input
                            className={fieldClass}
                            value={amountUsd}
                            onChange={(event) => setAmountUsd(event.target.value)}
                        />
                    </Field>
                    <Field label={t("draft.whoSets")}>
                        <select
                            className={fieldClass}
                            value={lock}
                            onChange={(event) => setLock(Number(event.target.value) as 1 | 2)}
                        >
                            <option value={2}>{t("draft.lock2")}</option>
                            <option value={1}>{t("draft.lock1")}</option>
                        </select>
                    </Field>
                    <Field label={t("draft.rules")}>
                        <select
                            className={fieldClass}
                            value={preset}
                            onChange={(event) => setPreset(event.target.value as PresetName)}
                        >
                            {PRESETS.map((name) => (
                                <option key={name} value={name}>
                                    {presetLabel(name, locale)}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <div>
                        <span className="flex items-center gap-2 text-[14.5px] font-semibold text-muted">
                            {t("draft.arbiter")}
                            <SoonBadge label={t("soon")} />
                        </span>
                        <select className={`${fieldClass} cursor-not-allowed bg-canvas text-muted`} disabled>
                            <option>{t("draft.arbiterNone")}</option>
                        </select>
                        <p className="m-0 mt-1.5 text-[14.5px] text-muted">
                            {t("draft.arbiterNote")}{" "}
                            <a href="/arbiters" className="text-cobalt">
                                {t("nav.arbiters")}
                            </a>
                        </p>
                    </div>
                    <Field label={t("draft.hours")}>
                        <input
                            className={fieldClass}
                            value={hours}
                            onChange={(event) => setHours(event.target.value)}
                        />
                    </Field>
                </div>
            )}
            {step === 2 && (
                <div className="flex flex-col gap-5" role="tabpanel">
                    <Field label={t("draft.criteria")}>
                        <select
                            className={fieldClass}
                            value={criteriaKind}
                            onChange={(event) => setCriteriaKind(event.target.value as CriteriaKind)}
                        >
                            {CRITERIA.map((kind) => (
                                <option key={kind} value={kind}>
                                    {t(`criteria.${kind}`)}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <button
                        className={`${secondaryButtonClass} self-start`}
                        type="button"
                        onClick={() =>
                            void suggestCriteria(agreement, criteriaKind, assistant === "" ? undefined : assistant)
                                .then(setAgreement)
                                .catch((error: unknown) =>
                                    toast.error(error instanceof Error ? error.message : t("draft.criteriaFailed"))
                                )
                        }
                    >
                        {t("draft.writeCriteria")}
                    </button>
                    <Field label={t("draft.assistant")}>
                        <input
                            className={fieldClass}
                            value={assistant}
                            onChange={(event) => setAssistant(event.target.value.trim())}
                        />
                    </Field>
                    <Field label={t("draft.agreement")}>
                        <textarea
                            className={fieldClass}
                            rows={3}
                            value={agreement}
                            onChange={(event) => setAgreement(event.target.value)}
                        />
                    </Field>
                    {link !== "" && (
                        <div>
                            <span className="text-[14.5px] font-semibold text-emerald">{t("draft.copiedNote")}</span>
                            <p className="m-0 mt-1.5 break-all rounded-lg bg-canvas px-3 py-2.5 font-mono text-[14px] text-ink-soft">
                                {link}
                            </p>
                        </div>
                    )}
                </div>
            )}
        </Stage>
    );
}

/**
 * Puts the connected wallet's address in "Your address" when the field is still empty and the person has not typed
 * in it, and offers a button for it (which also connects a wallet first when none is connected).
 */
function WalletFill({
    current,
    typed,
    onFill,
}: {
    current: string;
    typed: boolean;
    onFill: (address: string) => void;
}) {
    const { t } = useLocale();
    const { address, isConnected } = useAccount();
    const { connect, connectors } = useConnect();
    const [wanted, setWanted] = useState(false);
    const mine = isConnected && address !== undefined ? getAddress(address) : undefined;

    useEffect(() => {
        if (mine === undefined) return;
        if ((current === "" && !typed) || wanted) {
            onFill(mine);
            setWanted(false);
        }
    }, [mine, current, typed, wanted, onFill]);

    if (mine !== undefined && current === mine) return null;
    return (
        <button
            className={`${secondaryButtonClass} -mt-2 self-start`}
            type="button"
            onClick={() => {
                if (mine !== undefined) return onFill(mine);
                if (connectors[0] === undefined) return void toast.error(t("job.connect"));
                setWanted(true);
                connect({ connector: connectors[0] });
            }}
        >
            {mine === undefined ? t("draft.connectAndUse") : t("draft.useWallet")}
        </button>
    );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <label className="block">
            <span className="text-[14.5px] font-semibold text-ink-soft">{label}</span>
            {children}
        </label>
    );
}

/** Marks a control that is shown but not yet available. */
function SoonBadge({ label }: { label: string }) {
    return <span className="rounded-full bg-canvas px-2 py-0.5 text-[12.5px] font-semibold text-muted">{label}</span>;
}
