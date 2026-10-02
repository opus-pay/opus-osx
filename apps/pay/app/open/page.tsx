"use client";

import { Opus } from "@opus/sdk";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { getAddress } from "viem";
import { useAccount, useConnect, usePublicClient, useWalletClient } from "wagmi";

import { AddressLine } from "../../src/components/address-line";
import { Stage, primaryButtonClass } from "../../src/components/stage";
import { decodeDraft, parties } from "../../src/lib/draft";
import {
    configForDraft,
    fundingView,
    nextFundingAction,
    runFundingStep,
    stepLabel,
    stepPosition,
    type FundingAction,
    type FundingStep,
} from "../../src/lib/funding";
import { plainTerms } from "../../src/lib/terms";
import { explorerTx } from "../../src/lib/tx";
import { addresses } from "../../src/lib/wagmi";

function OpenLink() {
    const params = useSearchParams();
    const [jobText, setJobText] = useState(params.get("job") ?? "");
    const [funded, setFunded] = useState(false);
    const [busy, setBusy] = useState(false);
    const [next, setNext] = useState<FundingStep | undefined>(undefined);
    const [done, setDone] = useState<{ action: FundingAction; hash?: `0x${string}` }[]>([]);
    const [tick, setTick] = useState(0);
    const { address, isConnected } = useAccount();
    const { connect, connectors } = useConnect();
    const publicClient = usePublicClient();
    const { data: walletClient } = useWalletClient();
    const token = typeof window === "undefined" ? "" : window.location.hash.slice(1);
    const decoded = useMemo(() => {
        if (token === "") return { error: "Open the shared link to see the terms." };
        try {
            return { draft: decodeDraft(token, Math.floor(Date.now() / 1000)) };
        } catch (error) {
            return { error: error instanceof Error ? error.message : "The link could not be read" };
        }
    }, [token]);

    const draft = decoded.draft;
    useEffect(() => {
        if (publicClient === undefined || draft === undefined) return;
        let cancel = false;
        const opus = new Opus(publicClient, addresses);
        void fundingView(opus, jobText === "" ? undefined : BigInt(jobText), draft.lock)
            .then((view) => {
                if (cancel) return;
                const step = nextFundingAction(view);
                if (step === "funded") setFunded(true);
                else setNext(step);
            })
            .catch(() => undefined);
        return () => {
            cancel = true;
        };
    }, [publicClient, jobText, draft, tick]);

    if (decoded.error !== undefined || draft === undefined) {
        return (
            <Stage title="Review the terms" footer={<span />}>
                <p>{decoded.error}</p>
            </Stage>
        );
    }
    const terms = draft;
    const config = configForDraft(terms, addresses.evaluator);
    const mine = address === undefined ? undefined : getAddress(address);
    const role =
        mine === undefined
            ? undefined
            : mine === terms.from
            ? terms.drafter
            : mine === terms.counterparty
            ? opposite(terms.drafter)
            : undefined;

    async function act() {
        if (busy) return;
        if (publicClient === undefined || walletClient === undefined || mine === undefined) {
            toast.error("Connect the wallet that will sign");
            return;
        }
        if (role === undefined) {
            toast.error("Switch to the client or the provider on this link");
            return;
        }
        const opus = new Opus(publicClient, addresses, walletClient);
        const jobId = jobText === "" ? undefined : BigInt(jobText);
        const view = await fundingView(opus, jobId, terms.lock);
        const step = nextFundingAction(view);
        if (step === "funded") {
            setFunded(true);
            return;
        }
        setNext(step);
        if (step.signer !== role) {
            toast.error(`Waiting for the ${step.signer} to ${step.action}`);
            return;
        }
        setBusy(true);
        try {
            const result = await runFundingStep(opus, step.action, {
                draft: terms,
                jobId,
                now: BigInt(Math.floor(Date.now() / 1000)),
                operator: addresses.factory,
            });
            setJobText(result.jobId.toString());
            setDone((list) => [...list, { action: step.action, hash: result.hash }]);
            if (step.action === "fund") setFunded(true);
            toast.success(`${stepLabel(step.action)}: done`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "The transaction failed");
        } finally {
            setBusy(false);
            setTick((value) => value + 1);
        }
    }

    const sides = parties(terms);
    const position = next === undefined ? undefined : stepPosition(terms.lock, next.action);
    const waitingOnOther = next !== undefined && role !== undefined && next.signer !== role;

    return (
        <Stage
            title="Review the terms"
            footer={
                funded && jobText !== "" ? (
                    <a
                        className={`${primaryButtonClass} pay-button inline-flex h-10 items-center no-underline`}
                        href={`/jobs/${jobText}`}
                    >
                        Open job {jobText}
                    </a>
                ) : isConnected ? (
                    <button
                        className={`${primaryButtonClass} disabled:opacity-50`}
                        type="button"
                        disabled={busy}
                        onClick={() => void act()}
                    >
                        {busy
                            ? "Waiting for the wallet and the chain…"
                            : waitingOnOther
                            ? "Check again"
                            : next === undefined
                            ? "Sign the next step"
                            : `Sign: ${stepLabel(next.action)}`}
                    </button>
                ) : (
                    <button
                        className={primaryButtonClass}
                        type="button"
                        onClick={() => connect({ connector: connectors[0] })}
                    >
                        Connect wallet
                    </button>
                )
            }
        >
            <div className="space-y-3">
                <p>{plainTerms(config.reviewWindow)}</p>
                <p>
                    {terms.amountUsd} USD. Preset {terms.preset}. Link expiry{" "}
                    {new Date(terms.expiresAt * 1000).toLocaleString()}.
                </p>
                <AddressLine label="Client" address={sides.client} />
                <AddressLine label="Provider" address={sides.provider} />
                <p className="whitespace-pre-wrap rounded bg-white p-3">{terms.agreement}</p>
                {!funded && next !== undefined && position !== undefined && (
                    <p className="text-sm">
                        Step {position.index} of {position.total}: {stepLabel(next.action)}. The {next.signer} signs
                        {waitingOnOther ? `. Waiting for the ${next.signer}.` : "."}
                    </p>
                )}
                {done.length > 0 && (
                    <ul className="space-y-1 text-sm">
                        {done.map((item) => {
                            const url = item.hash === undefined ? undefined : explorerTx(addresses.chainId, item.hash);
                            return (
                                <li key={item.action}>
                                    {stepLabel(item.action)}: done
                                    {url !== undefined && (
                                        <>
                                            {" "}
                                            <a className="underline" href={url} target="_blank" rel="noreferrer">
                                                view on Polygonscan
                                            </a>
                                        </>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </Stage>
    );
}

function opposite(role: "client" | "provider"): "client" | "provider" {
    return role === "client" ? "provider" : "client";
}

export default function OpenPage() {
    return (
        <Suspense fallback={<p>Loading the link</p>}>
            <OpenLink />
        </Suspense>
    );
}
