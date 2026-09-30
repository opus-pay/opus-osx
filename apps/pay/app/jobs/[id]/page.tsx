"use client";

import { Opus, type JobAction } from "@opus/sdk";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useAccount, useConnect, usePublicClient, useWalletClient } from "wagmi";

import { countdown, proofHash, textHash } from "../../../src/lib/proof";
import { addresses } from "../../../src/lib/wagmi";

const PARTY = new Set<JobAction>(["submit", "approve", "object", "extendReview", "postDeposit", "withdraw"]);

export default function JobPage() {
    const params = useParams<{ id: string }>();
    const jobId = BigInt(params.id);
    const { isConnected } = useAccount();
    const { connect, connectors } = useConnect();
    const publicClient = usePublicClient();
    const { data: walletClient } = useWalletClient();
    const [view, setView] = useState<string>("Connect a wallet to load this job.");
    const [actions, setActions] = useState<JobAction[]>([]);
    const [objection, setObjection] = useState("The work does not match the agreement.");
    const [extension, setExtension] = useState("3600");

    async function load() {
        if (publicClient === undefined || walletClient?.account === undefined) return;
        const opus = new Opus(publicClient, addresses, walletClient);
        const status = await opus.status(jobId, walletClient.account.address);
        const left = countdown(status.nextDeadline, BigInt(Math.floor(Date.now() / 1000)));
        setView(`${status.status} · ${status.phase} · ${left}`);
        setActions(status.actions.filter((action) => PARTY.has(action)));
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

    return (
        <div className="space-y-4">
            <h1 className="text-2xl font-semibold">Job {params.id}</h1>
            <p>{view}</p>
            {isConnected ? (
                <button className="rounded border px-3 py-2" type="button" onClick={() => void load()}>
                    Refresh status
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
            <label className="block text-sm">
                Deliverable file
                <input id="proof" className="mt-1 block" type="file" />
            </label>
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
            <div className="flex flex-wrap gap-2">
                {actions.map((action) => (
                    <button
                        key={action}
                        className="rounded bg-stone-900 px-3 py-2 text-white"
                        type="button"
                        onClick={() => void run(action)}
                    >
                        {action}
                    </button>
                ))}
            </div>
        </div>
    );
}
