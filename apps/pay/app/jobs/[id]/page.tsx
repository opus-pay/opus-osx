"use client";

import { Opus, type JobAction } from "@opus/sdk";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAccount, useConnect, usePublicClient, useWalletClient } from "wagmi";

import { Stage, StageTab, primaryButtonClass, secondaryButtonClass } from "../../../src/components/stage";
import { dueNotices, notify } from "../../../src/lib/notices";
import { countdown, proofHash, textHash } from "../../../src/lib/proof";
import { addresses } from "../../../src/lib/wagmi";

const PARTY = new Set<JobAction>(["submit", "approve", "object", "extendReview", "postDeposit", "withdraw"]);

export default function JobPage() {
    const params = useParams<{ id: string }>();
    const [ready, setReady] = useState(false);
    useEffect(() => setReady(true), []);
    if (!ready) {
        return (
            <Stage
                title={`Job ${params.id}`}
                tabs={
                    <>
                        <StageTab current>Proof</StageTab>
                        <StageTab>Dispute</StageTab>
                    </>
                }
                footer={<span />}
            >
                <p>Connect a wallet to load this job.</p>
            </Stage>
        );
    }
    return <JobScreen id={params.id} />;
}

function JobScreen({ id }: { id: string }) {
    const params = { id };
    const jobId = BigInt(params.id);
    const { isConnected } = useAccount();
    const { connect, connectors } = useConnect();
    const publicClient = usePublicClient();
    const { data: walletClient } = useWalletClient();
    const [view, setView] = useState<string>("Connect a wallet to load this job.");
    const [actions, setActions] = useState<JobAction[]>([]);
    const [pane, setPane] = useState<"proof" | "dispute">("proof");
    const [objection, setObjection] = useState("The work does not match the agreement.");
    const [extension, setExtension] = useState("3600");
    const [webhook, setWebhook] = useState("");

    async function load() {
        if (publicClient === undefined || walletClient?.account === undefined) return;
        const opus = new Opus(publicClient, addresses, walletClient);
        const status = await opus.status(jobId, walletClient.account.address);
        const left = countdown(status.nextDeadline, BigInt(Math.floor(Date.now() / 1000)));
        setView(`${status.status} · ${status.phase} · ${left}`);
        setActions(status.actions.filter((action) => PARTY.has(action)));
        if (webhook !== "") {
            const kinds = dueNotices({
                status: status.status,
                phase: status.phase,
                now: BigInt(Math.floor(Date.now() / 1000)),
                nextDeadline: status.nextDeadline,
                marginSeconds: 3600n,
                autoCompleteOnSilence: status.actions.includes("finalize"),
                disputeDeposit: status.actions.includes("postDeposit") ? 1n : 0n,
                clientPosted: false,
                providerPosted: false,
            });
            try {
                for (const kind of kinds) {
                    await notify(webhook, { kind, jobId: jobId.toString(), instance: addresses.instance });
                }
            } catch (error) {
                toast.error(error instanceof Error ? error.message : "The webhook failed");
            }
        }
        return { opus, status };
    }

    async function run(action: JobAction) {
        if (publicClient === undefined || walletClient === undefined) return;
        const loaded = await load();
        if (loaded === undefined) return;
        const { opus, status } = loaded;
        try {
            if (action === "submit") {
                const file = (document.getElementById("proof") as HTMLInputElement).files?.[0];
                if (file === undefined) throw new Error("Choose the deliverable file");
                const hash = proofHash(new Uint8Array(await file.arrayBuffer()));
                await opus.submit(jobId, hash, (await opus.job(jobId)).budget);
            } else if (action === "approve") {
                await opus.approve(jobId);
            } else if (action === "object") {
                await opus.object(jobId, textHash(objection));
            } else if (action === "extendReview") {
                await opus.extendReview(jobId, Number(extension));
            } else if (action === "postDeposit") {
                await opus.postDepositWithPermit(jobId);
            } else if (action === "withdraw") {
                const who = walletClient.account?.address;
                if (who === undefined) throw new Error("Connect a wallet");
                if ((await opus.claimableOnInstance(who)) > 0n) await opus.withdrawFromInstance();
                if ((await opus.claimableOnEvaluator(addresses.usdc, who)) > 0n) {
                    await opus.withdrawFromEvaluator(addresses.usdc);
                }
            }
            toast.success(action);
            await load();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "The transaction failed");
        }
    }

    const proofActions = actions.filter(
        (action) => action === "submit" || action === "approve" || action === "withdraw"
    );
    const disputeActions = actions.filter(
        (action) => action === "object" || action === "extendReview" || action === "postDeposit"
    );
    const shown = pane === "proof" ? proofActions : disputeActions;

    return (
        <Stage
            title={`Job ${params.id}`}
            tabs={
                <>
                    <StageTab current={pane === "proof"} onClick={() => setPane("proof")}>
                        Proof
                    </StageTab>
                    <StageTab current={pane === "dispute"} onClick={() => setPane("dispute")}>
                        Dispute
                    </StageTab>
                </>
            }
            footer={
                isConnected ? (
                    <>
                        {shown.map((action) => (
                            <button
                                key={action}
                                className={primaryButtonClass}
                                type="button"
                                onClick={() => void run(action)}
                            >
                                {action}
                            </button>
                        ))}
                        <button className={secondaryButtonClass} type="button" onClick={() => void load()}>
                            Refresh status
                        </button>
                    </>
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
                <p>{view}</p>
                {pane === "proof" ? (
                    <label className="block text-sm">
                        Deliverable file
                        <input id="proof" className="mt-1 block" type="file" />
                    </label>
                ) : (
                    <>
                        <label className="block text-sm">
                            Objection
                            <input
                                className="mt-1 w-full rounded border bg-white p-2"
                                value={objection}
                                onChange={(event) => setObjection(event.target.value)}
                            />
                        </label>
                        <label className="block text-sm">
                            Extend review by seconds
                            <input
                                className="mt-1 w-full rounded border bg-white p-2"
                                value={extension}
                                onChange={(event) => setExtension(event.target.value)}
                            />
                        </label>
                        <label className="block text-sm">
                            Webhook URL
                            <input
                                className="mt-1 w-full rounded border bg-white p-2"
                                value={webhook}
                                onChange={(event) => setWebhook(event.target.value.trim())}
                            />
                        </label>
                    </>
                )}
            </div>
        </Stage>
    );
}
