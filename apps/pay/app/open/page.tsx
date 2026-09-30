"use client";

import { Opus } from "@opus/sdk";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { toast } from "sonner";
import { getAddress } from "viem";
import { useAccount, useConnect, usePublicClient, useWalletClient } from "wagmi";

import { AddressLine } from "../../src/components/address-line";
import { decodeDraft, parties } from "../../src/lib/draft";
import { configForDraft, fundingView, nextFundingAction, runFundingStep } from "../../src/lib/funding";
import { plainTerms } from "../../src/lib/terms";
import { addresses } from "../../src/lib/wagmi";

function OpenLink() {
    const params = useSearchParams();
    const [jobText, setJobText] = useState(params.get("job") ?? "");
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

    if (decoded.error !== undefined || decoded.draft === undefined) {
        return <p>{decoded.error}</p>;
    }
    const draft = decoded.draft;
    const config = configForDraft(draft, addresses.evaluator);
    const mine = address === undefined ? undefined : getAddress(address);
    const role =
        mine === undefined
            ? undefined
            : mine === draft.from
            ? draft.drafter
            : mine === draft.counterparty
            ? opposite(draft.drafter)
            : undefined;

    async function act() {
        if (publicClient === undefined || walletClient === undefined || mine === undefined || role === undefined) {
            toast.error("Connect the wallet that will sign");
            return;
        }
        const opus = new Opus(publicClient, addresses, walletClient);
        const jobId = jobText === "" ? undefined : BigInt(jobText);
        const view = await fundingView(opus, jobId, draft.lock);
        const step = nextFundingAction(view);
        if (step === "funded") {
            toast.success("The job is funded");
            return;
        }
        if (step.signer !== role) {
            toast.error(`Waiting for the ${step.signer} to ${step.action}`);
            return;
        }
        try {
            const nextId = await runFundingStep(opus, step.action, {
                draft,
                jobId,
                now: BigInt(Math.floor(Date.now() / 1000)),
                operator: addresses.factory,
            });
            if (nextId !== undefined) setJobText(nextId.toString());
            toast.success(step.action);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "The transaction failed");
        }
    }

    const sides = parties(draft);

    return (
        <div className="space-y-4">
            <h1 className="text-2xl font-semibold">Review the terms</h1>
            <p className="text-lg">{plainTerms(config.reviewWindow)}</p>
            <p>
                {draft.amountUsd} USD. Preset {draft.preset}. Link expiry{" "}
                {new Date(draft.expiresAt * 1000).toLocaleString()}.
            </p>
            <AddressLine label="Client" address={sides.client} />
            <AddressLine label="Provider" address={sides.provider} />
            <p className="whitespace-pre-wrap rounded bg-white p-3">{draft.agreement}</p>
            {isConnected ? (
                <button className="rounded bg-stone-900 px-4 py-2 text-white" type="button" onClick={() => void act()}>
                    Sign the next step
                </button>
            ) : (
                <button
                    className="rounded bg-stone-900 px-4 py-2 text-white"
                    type="button"
                    onClick={() => connect({ connector: connectors[0] })}
                >
                    Connect wallet
                </button>
            )}
            {jobText !== "" && (
                <p>
                    Job {jobText}. <a href={`/jobs/${jobText}`}>Open the status page</a>
                </p>
            )}
        </div>
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
