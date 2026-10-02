"use client";

import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { isAddress } from "viem";

import { Stage, StageTab, fieldClass, primaryButtonClass, secondaryButtonClass } from "../src/components/stage";
import { suggestCriteria, type CriteriaKind } from "../src/lib/criteria";
import { encodeDraft, linkFor, PRESETS, type Draft, type PresetName } from "../src/lib/draft";
import { presetLabel } from "../src/lib/terms";

const STEPS = ["Parties", "Payment", "Agreement"] as const;

export default function DraftPage() {
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

    function share() {
        try {
            if (!isAddress(from) || !isAddress(counterparty)) throw new Error("Enter both wallet addresses");
            const life = Number(hours);
            if (!Number.isInteger(life) || life < 1) throw new Error("Link expiry must be at least 1 hour");
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
            toast.success("Link copied");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Could not make the link");
        }
    }

    return (
        <Stage
            title="Payment link"
            tabs={STEPS.map((label, index) => (
                <StageTab key={label} current={step === index} onClick={() => setStep(index)}>
                    {index + 1}. {label}
                </StageTab>
            ))}
            footer={
                <>
                    {step < 2 ? (
                        <button className={primaryButtonClass} type="button" onClick={() => setStep(step + 1)}>
                            Next
                        </button>
                    ) : (
                        <button className={primaryButtonClass} type="button" onClick={share}>
                            Create link
                        </button>
                    )}
                    {step > 0 && (
                        <button className={secondaryButtonClass} type="button" onClick={() => setStep(step - 1)}>
                            Back
                        </button>
                    )}
                </>
            }
        >
            {step === 0 && (
                <div className="flex flex-col gap-5" role="tabpanel">
                    <Field label="You are the">
                        <select
                            className={fieldClass}
                            value={drafter}
                            onChange={(event) => setDrafter(event.target.value as "client" | "provider")}
                        >
                            <option value="client">client</option>
                            <option value="provider">provider</option>
                        </select>
                    </Field>
                    <Field label="Your address">
                        <input
                            className={`${fieldClass} font-mono`}
                            value={from}
                            onChange={(event) => setFrom(event.target.value.trim())}
                        />
                    </Field>
                    <Field label="Counterparty address">
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
                    <Field label="Amount in USDC">
                        <input
                            className={fieldClass}
                            value={amountUsd}
                            onChange={(event) => setAmountUsd(event.target.value)}
                        />
                    </Field>
                    <Field label="Who sets the amount">
                        <select
                            className={fieldClass}
                            value={lock}
                            onChange={(event) => setLock(Number(event.target.value) as 1 | 2)}
                        >
                            <option value={2}>Client, before the evaluator is configured</option>
                            <option value={1}>Provider quote, locked after the first quote</option>
                        </select>
                    </Field>
                    <Field label="Review rules">
                        <select
                            className={fieldClass}
                            value={preset}
                            onChange={(event) => setPreset(event.target.value as PresetName)}
                        >
                            {PRESETS.map((name) => (
                                <option key={name} value={name}>
                                    {presetLabel(name)}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <Field label="Link expires in hours">
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
                    <Field label="Completion criteria">
                        <select
                            className={fieldClass}
                            value={criteriaKind}
                            onChange={(event) => setCriteriaKind(event.target.value as CriteriaKind)}
                        >
                            <option value="errand">errand</option>
                            <option value="code">code</option>
                            <option value="report">report</option>
                            <option value="design">design</option>
                        </select>
                    </Field>
                    <button
                        className={`${secondaryButtonClass} self-start`}
                        type="button"
                        onClick={() =>
                            void suggestCriteria(agreement, criteriaKind, assistant === "" ? undefined : assistant)
                                .then(setAgreement)
                                .catch((error: unknown) =>
                                    toast.error(error instanceof Error ? error.message : "Could not write criteria")
                                )
                        }
                    >
                        Write criteria
                    </button>
                    <Field label="Optional criteria assistant URL">
                        <input
                            className={fieldClass}
                            value={assistant}
                            onChange={(event) => setAssistant(event.target.value.trim())}
                        />
                    </Field>
                    <Field label="Agreement made elsewhere">
                        <textarea
                            className={fieldClass}
                            rows={3}
                            value={agreement}
                            onChange={(event) => setAgreement(event.target.value)}
                        />
                    </Field>
                    {link !== "" && (
                        <div>
                            <span className="text-[13px] font-semibold text-emerald">
                                Link copied. Send it to the other side.
                            </span>
                            <p className="m-0 mt-1.5 break-all rounded-lg bg-canvas px-3 py-2.5 font-mono text-[12.5px] text-ink-soft">
                                {link}
                            </p>
                        </div>
                    )}
                </div>
            )}
        </Stage>
    );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <label className="block">
            <span className="text-[13px] font-semibold text-ink-soft">{label}</span>
            {children}
        </label>
    );
}
