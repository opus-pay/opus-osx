"use client";

import { useState } from "react";
import { toast } from "sonner";
import { isAddress } from "viem";

import { suggestCriteria, type CriteriaKind } from "../src/lib/criteria";
import { encodeDraft, linkFor, PRESETS, type Draft, type PresetName } from "../src/lib/draft";

export default function DraftPage() {
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
        <div className="space-y-4">
            <h1 className="text-2xl font-semibold">Payment link</h1>
            <label className="block text-sm">
                You are the
                <select
                    className="mt-1 w-full rounded border bg-white p-2"
                    value={drafter}
                    onChange={(event) => setDrafter(event.target.value as "client" | "provider")}
                >
                    <option value="client">client</option>
                    <option value="provider">provider</option>
                </select>
            </label>
            <label className="block text-sm">
                Your address
                <input
                    className="mt-1 w-full rounded border bg-white p-2 font-mono"
                    value={from}
                    onChange={(event) => setFrom(event.target.value.trim())}
                />
            </label>
            <label className="block text-sm">
                Counterparty address
                <input
                    className="mt-1 w-full rounded border bg-white p-2 font-mono"
                    value={counterparty}
                    onChange={(event) => setCounterparty(event.target.value.trim())}
                />
            </label>
            <label className="block text-sm">
                Amount in USD
                <input
                    className="mt-1 w-full rounded border bg-white p-2"
                    value={amountUsd}
                    onChange={(event) => setAmountUsd(event.target.value)}
                />
            </label>
            <label className="block text-sm">
                Evaluator preset
                <select
                    className="mt-1 w-full rounded border bg-white p-2"
                    value={preset}
                    onChange={(event) => setPreset(event.target.value as PresetName)}
                >
                    {PRESETS.map((name) => (
                        <option key={name} value={name}>
                            {name}
                        </option>
                    ))}
                </select>
            </label>
            <label className="block text-sm">
                Completion criteria
                <select
                    className="mt-1 w-full rounded border bg-white p-2"
                    value={criteriaKind}
                    onChange={(event) => setCriteriaKind(event.target.value as CriteriaKind)}
                >
                    <option value="errand">errand</option>
                    <option value="code">code</option>
                    <option value="report">report</option>
                    <option value="design">design</option>
                </select>
            </label>
            <button
                className="rounded border px-3 py-2"
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
            <label className="block text-sm">
                Optional criteria assistant URL
                <input
                    className="mt-1 w-full rounded border bg-white p-2"
                    value={assistant}
                    onChange={(event) => setAssistant(event.target.value.trim())}
                />
            </label>
            <label className="block text-sm">
                Agreement made elsewhere
                <textarea
                    className="mt-1 w-full rounded border bg-white p-2"
                    rows={4}
                    value={agreement}
                    onChange={(event) => setAgreement(event.target.value)}
                />
            </label>
            <label className="block text-sm">
                Who sets the amount
                <select
                    className="mt-1 w-full rounded border bg-white p-2"
                    value={lock}
                    onChange={(event) => setLock(Number(event.target.value) as 1 | 2)}
                >
                    <option value={2}>Client, before the evaluator is configured</option>
                    <option value={1}>Provider quote, locked after the first quote</option>
                </select>
            </label>
            <label className="block text-sm">
                Link expires in hours
                <input
                    className="mt-1 w-full rounded border bg-white p-2"
                    value={hours}
                    onChange={(event) => setHours(event.target.value)}
                />
            </label>
            <button className="rounded bg-stone-900 px-4 py-2 text-white" type="button" onClick={share}>
                Create link
            </button>
            {link !== "" && <p className="break-all rounded bg-white p-3 font-mono text-sm">{link}</p>}
        </div>
    );
}
