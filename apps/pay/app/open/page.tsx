"use client";

import { Opus } from "@opus/sdk";
import { Check, ExternalLink } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { getAddress } from "viem";
import { useAccount, useConnect, usePublicClient, useWalletClient } from "wagmi";

import { Balances } from "../../src/components/balances";
import { JobProgress } from "../../src/components/job-progress";
import { Facts, SectionLabel, Stage, primaryButtonClass } from "../../src/components/stage";
import { decodeDraft, parties } from "../../src/lib/draft";
import {
    amountForDraft,
    configForDraft,
    fundingView,
    nextFundingAction,
    runFundingStep,
    stepLabel,
    stepPosition,
    type FundingAction,
    type FundingStep,
} from "../../src/lib/funding";
import { escrowFor } from "../../src/lib/status-text";
import { dateTime, plainTerms } from "../../src/lib/terms";
import { explorerTx } from "../../src/lib/tx";
import { addresses } from "../../src/lib/wagmi";

function OpenLink({ token }: { token: string }) {
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
    // Funded only once this link has its own job on chain.
    const isFunded = funded && jobText !== "";
    const position = next === undefined ? undefined : stepPosition(terms.lock, next.action);
    const waitingOnOther = next !== undefined && role !== undefined && next.signer !== role;

    return (
        <Stage
            title="Review the terms"
            progress={
                <JobProgress
                    status={isFunded ? "Funded" : "Open"}
                    phase={isFunded ? "Funded" : "None"}
                    onChain={jobText !== ""}
                />
            }
            footer={
                <>
                    {isFunded ? (
                        <a className={`${primaryButtonClass} pay-button no-underline`} href={`/jobs/${jobText}`}>
                            Open job {jobText}
                        </a>
                    ) : isConnected ? (
                        <button className={primaryButtonClass} type="button" disabled={busy} onClick={() => void act()}>
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
                    )}
                    {!isFunded && next !== undefined && position !== undefined && (
                        <p className="m-0 ml-auto text-right text-[13px] leading-snug text-muted">
                            <span className="font-semibold text-ink-soft">
                                Step {position.index} of {position.total}
                            </span>
                            <br />
                            {waitingOnOther ? `Waiting for the ${next.signer} to sign` : `The ${next.signer} signs`}
                        </p>
                    )}
                </>
            }
        >
            <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-4">
                    <p className="m-0 text-[17px] font-semibold leading-snug text-ink">
                        {plainTerms(config.reviewWindow)}
                    </p>
                    <Facts
                        items={[
                            { label: "Amount", value: `${terms.amountUsd} USD` },
                            { label: "Review preset", value: terms.preset },
                            { label: "Link expires", value: dateTime(terms.expiresAt) },
                        ]}
                    />
                </div>
                <section>
                    <SectionLabel>Agreement</SectionLabel>
                    <p className="m-0 whitespace-pre-wrap rounded-lg bg-canvas px-4 py-3 text-ink">{terms.agreement}</p>
                </section>
                <section>
                    <SectionLabel>Where the money is</SectionLabel>
                    <Balances
                        client={sides.client}
                        provider={sides.provider}
                        escrow={escrowFor(isFunded ? "Funded" : "Open", amountForDraft(terms))}
                        me={mine}
                        tick={tick}
                    />
                </section>
                {done.length > 0 && (
                    <section>
                        <SectionLabel>Signed so far</SectionLabel>
                        <ul className="m-0 list-none space-y-1.5 p-0 text-[14px]">
                            {done.map((item) => {
                                const url =
                                    item.hash === undefined ? undefined : explorerTx(addresses.chainId, item.hash);
                                return (
                                    <li key={item.action} className="flex items-center gap-2">
                                        <Check className="text-emerald" size={16} strokeWidth={3} aria-hidden />
                                        <span className="text-ink">{stepLabel(item.action)}</span>
                                        {url !== undefined && (
                                            <a
                                                className="ml-auto inline-flex items-center gap-1 text-cobalt"
                                                href={url}
                                                target="_blank"
                                                rel="noreferrer"
                                            >
                                                Polygonscan
                                                <ExternalLink size={13} aria-hidden />
                                            </a>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                )}
            </div>
        </Stage>
    );
}

function opposite(role: "client" | "provider"): "client" | "provider" {
    return role === "client" ? "provider" : "client";
}

/**
 * Pasting a new link into a tab that already shows one changes only the `#` part,
 * which does not reload the page. Keying the screen by the link starts it fresh,
 * so the job number and "funded" state of the previous link never carry over.
 */
function useHashToken(): string | undefined {
    const [token, setToken] = useState<string | undefined>(undefined);
    useEffect(() => {
        const read = () => setToken(window.location.hash.slice(1));
        read();
        window.addEventListener("hashchange", read);
        return () => window.removeEventListener("hashchange", read);
    }, []);
    return token;
}

export default function OpenPage() {
    const token = useHashToken();
    if (token === undefined) return <p>Loading the link</p>;
    return (
        <Suspense fallback={<p>Loading the link</p>}>
            <OpenLink key={token} token={token} />
        </Suspense>
    );
}
