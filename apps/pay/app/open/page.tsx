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
import { configForDraft, fundingView, nextFundingAction, runFundingStep } from "../../src/lib/funding";
import { plainTerms } from "../../src/lib/terms";
import { addresses } from "../../src/lib/wagmi";

function OpenLink() {
    const params = useSearchParams();
    const [jobText, setJobText] = useState(params.get("job") ?? "");
    const [funded, setFunded] = useState(false);
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
        if (publicClient === undefined || jobText === "" || draft === undefined) return;
        let cancel = false;
        const opus = new Opus(publicClient, addresses);
        void fundingView(opus, BigInt(jobText), draft.lock)
            .then((view) => {
                if (!cancel && nextFundingAction(view) === "funded") setFunded(true);
            })
            .catch(() => undefined);
        return () => {
            cancel = true;
        };
    }, [publicClient, jobText, draft]);

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
        if (step.signer !== role) {
            toast.error(`Waiting for the ${step.signer} to ${step.action}`);
            return;
        }
        try {
            const nextId = await runFundingStep(opus, step.action, {
                draft: terms,
                jobId,
                now: BigInt(Math.floor(Date.now() / 1000)),
                operator: addresses.factory,
            });
            if (nextId !== undefined) setJobText(nextId.toString());
            if (step.action === "fund") setFunded(true);
            toast.success(step.action);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "The transaction failed");
        }
    }

    const sides = parties(terms);

    return (
        <Stage
            title="Review the terms"
            footer={
                funded && jobText !== "" ? (
                    <a className={`${primaryButtonClass} pay-button inline-flex h-10 items-center no-underline`} href={`/jobs/${jobText}`}>
                        Open job {jobText}
                    </a>
                ) : isConnected ? (
                    <button className={primaryButtonClass} type="button" onClick={() => void act()}>
                        Sign the next step
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
