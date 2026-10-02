"use client";

import { Opus, evaluatorAbi, type JobAction, type JobStatusName, type PhaseName, type WalletStatus } from "@opus/sdk";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { getAddress, zeroAddress, type Address } from "viem";
import { useAccount, useConnect, usePublicClient, useWalletClient } from "wagmi";

import { Balances } from "../../../src/components/balances";
import { JobProgress } from "../../../src/components/job-progress";
import { Stage, StageTab, primaryButtonClass, secondaryButtonClass } from "../../../src/components/stage";
import { dueNotices, notify } from "../../../src/lib/notices";
import { proofHash, textHash } from "../../../src/lib/proof";
import { actionLabel, escrowFor, roleGuide, statusLine, type Role } from "../../../src/lib/status-text";
import { confirmed, explorerTx } from "../../../src/lib/tx";
import { addresses } from "../../../src/lib/wagmi";

/** Buttons each tab may show. Keeper calls (finalize, timeouts) are left to the keeper. */
const ROLE_ACTIONS: Record<Role, Set<JobAction>> = {
    client: new Set<JobAction>(["approve", "object", "extendReview", "postDeposit", "claimRefund", "withdraw"]),
    provider: new Set<JobAction>(["submit", "postDeposit", "withdraw"]),
};

/** How often the screen re-reads the chain, so a step taken in the other wallet shows up. */
const REFRESH_MS = 15_000;

type JobView = {
    client: Address;
    provider: Address;
    budget: bigint;
    status: JobStatusName;
    phase: PhaseName;
    nextDeadline: bigint | null;
    autoComplete: boolean;
    actions: Record<Role, JobAction[]>;
    now: bigint;
};

export default function JobPage() {
    const params = useParams<{ id: string }>();
    const [ready, setReady] = useState(false);
    useEffect(() => setReady(true), []);
    if (!ready) {
        return (
            <Stage title={`Job ${params.id}`} footer={<span />}>
                <p>Loading the job.</p>
            </Stage>
        );
    }
    return <JobScreen id={params.id} />;
}

function JobScreen({ id }: { id: string }) {
    const jobId = BigInt(id);
    const { address, isConnected } = useAccount();
    const { connect, connectors } = useConnect();
    const publicClient = usePublicClient();
    const { data: walletClient } = useWalletClient();
    const [job, setJob] = useState<JobView | undefined>(undefined);
    const [loadError, setLoadError] = useState<string | undefined>(undefined);
    const [tab, setTab] = useState<Role | undefined>(undefined);
    const [tick, setTick] = useState(0);
    const [objection, setObjection] = useState("The work does not match the agreement.");
    const [extension, setExtension] = useState("3600");
    const [webhook, setWebhook] = useState("");
    const [busy, setBusy] = useState(false);
    const [lastTx, setLastTx] = useState<{ action: JobAction; url?: string } | undefined>(undefined);

    const load = useCallback(async (): Promise<JobView | undefined> => {
        if (publicClient === undefined) return undefined;
        const opus = new Opus(publicClient, addresses);
        const core = await opus.job(jobId);
        const [clientStatus, providerStatus, config] = await Promise.all([
            opus.status(jobId, core.client),
            core.provider === zeroAddress ? Promise.resolve(undefined) : opus.status(jobId, core.provider),
            publicClient.readContract({
                address: addresses.evaluator,
                abi: evaluatorAbi,
                functionName: "getConfig",
                args: [addresses.instance, jobId],
            }),
        ]);
        const pick = (role: Role, status?: WalletStatus) =>
            (status?.actions ?? []).filter((action) => ROLE_ACTIONS[role].has(action));
        const view: JobView = {
            client: getAddress(core.client),
            provider: core.provider === zeroAddress ? zeroAddress : getAddress(core.provider),
            budget: core.budget,
            status: clientStatus.status,
            phase: clientStatus.phase,
            nextDeadline: clientStatus.nextDeadline,
            autoComplete: config.autoCompleteOnSilence,
            actions: { client: pick("client", clientStatus), provider: pick("provider", providerStatus) },
            now: BigInt(Math.floor(Date.now() / 1000)),
        };
        setJob(view);
        setLoadError(undefined);
        return view;
    }, [publicClient, jobId]);

    useEffect(() => {
        void load().catch((error) =>
            setLoadError(error instanceof Error ? error.message : "The job could not be read")
        );
    }, [load, tick]);

    useEffect(() => {
        const timer = setInterval(() => setTick((value) => value + 1), REFRESH_MS);
        return () => clearInterval(timer);
    }, []);

    const me = address === undefined ? undefined : getAddress(address);
    const myRole: Role | undefined =
        job === undefined || me === undefined
            ? undefined
            : me === job.client
            ? "client"
            : me === job.provider
            ? "provider"
            : undefined;
    const shownRole: Role = tab ?? myRole ?? "client";
    const roleAddress = job === undefined ? undefined : shownRole === "client" ? job.client : job.provider;
    const canAct = me !== undefined && roleAddress !== undefined && me === roleAddress;

    async function refresh() {
        const view = await load();
        if (view === undefined || webhook === "") return;
        const kinds = dueNotices({
            status: view.status,
            phase: view.phase,
            now: view.now,
            nextDeadline: view.nextDeadline,
            marginSeconds: 3600n,
            autoCompleteOnSilence: view.autoComplete,
            disputeDeposit: view.actions.client.includes("postDeposit") ? 1n : 0n,
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

    async function run(action: JobAction) {
        if (busy || publicClient === undefined || walletClient === undefined || !canAct) return;
        setBusy(true);
        try {
            const opus = new Opus(publicClient, addresses, walletClient);
            // Each call waits for its block, so the refreshed screen no longer offers the same button.
            const sent: `0x${string}`[] = [];
            if (action === "submit") {
                const file = (document.getElementById("proof") as HTMLInputElement | null)?.files?.[0];
                if (file === undefined) throw new Error("Choose the deliverable file");
                const hash = proofHash(new Uint8Array(await file.arrayBuffer()));
                sent.push(
                    await confirmed(publicClient, await opus.submit(jobId, hash, (await opus.job(jobId)).budget))
                );
            } else if (action === "approve") {
                sent.push(await confirmed(publicClient, await opus.approve(jobId)));
            } else if (action === "object") {
                sent.push(await confirmed(publicClient, await opus.object(jobId, textHash(objection))));
            } else if (action === "extendReview") {
                sent.push(await confirmed(publicClient, await opus.extendReview(jobId, Number(extension))));
            } else if (action === "postDeposit") {
                sent.push(await confirmed(publicClient, await opus.postDepositWithPermit(jobId)));
            } else if (action === "claimRefund") {
                sent.push(await confirmed(publicClient, await opus.claimRefund(jobId)));
            } else if (action === "withdraw") {
                const who = walletClient.account?.address;
                if (who === undefined) throw new Error("Connect a wallet");
                if ((await opus.claimableOnInstance(who)) > 0n) {
                    sent.push(await confirmed(publicClient, await opus.withdrawFromInstance()));
                }
                if ((await opus.claimableOnEvaluator(addresses.usdc, who)) > 0n) {
                    sent.push(await confirmed(publicClient, await opus.withdrawFromEvaluator(addresses.usdc)));
                }
            }
            const last = sent.at(-1);
            setLastTx({ action, url: last === undefined ? undefined : explorerTx(addresses.chainId, last) });
            toast.success(`${actionLabel(action)}: done`);
            await load();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "The transaction failed");
        } finally {
            setBusy(false);
        }
    }

    const actions = job === undefined ? [] : job.actions[shownRole];
    const roleTab = (role: Role, label: string) => (
        <StageTab current={shownRole === role} onClick={() => setTab(role)}>
            {label}
            {myRole === role ? " (you)" : ""}
        </StageTab>
    );

    return (
        <Stage
            title={`Job ${id}`}
            progress={job === undefined ? undefined : <JobProgress status={job.status} phase={job.phase} />}
            tabs={
                <>
                    {roleTab("client", "Client")}
                    {roleTab("provider", "Provider")}
                </>
            }
            footer={
                !isConnected ? (
                    <button
                        className={primaryButtonClass}
                        type="button"
                        onClick={() => connect({ connector: connectors[0] })}
                    >
                        Connect wallet
                    </button>
                ) : (
                    <>
                        {actions.map((action) => (
                            <button
                                key={action}
                                className={`${primaryButtonClass} disabled:opacity-50`}
                                type="button"
                                disabled={busy || !canAct}
                                onClick={() => void run(action)}
                            >
                                {busy ? "Waiting for the wallet and the chain…" : actionLabel(action)}
                            </button>
                        ))}
                        <button
                            className={`${secondaryButtonClass} disabled:opacity-50`}
                            type="button"
                            disabled={busy}
                            onClick={() => void refresh()}
                        >
                            Refresh status
                        </button>
                    </>
                )
            }
        >
            {job === undefined ? (
                <p>{loadError ?? "Reading the job from the chain."}</p>
            ) : (
                <div className="space-y-3">
                    <Balances
                        client={job.client}
                        provider={job.provider}
                        escrow={escrowFor(job.status, job.budget)}
                        me={me}
                        tick={tick}
                    />
                    <p className="font-medium">{roleGuide(shownRole, job.status, job.phase, job.autoComplete)}</p>
                    <p className="text-sm text-stone-600">
                        {statusLine({
                            status: job.status,
                            phase: job.phase,
                            nextDeadline: job.nextDeadline,
                            now: job.now,
                        })}
                    </p>
                    {isConnected && !canAct && actions.length > 0 && (
                        <p className="text-sm text-amber-700">
                            Switch the wallet to the {shownRole} account to act here.
                        </p>
                    )}
                    {shownRole === "provider" && actions.includes("submit") && (
                        <label className="block text-sm">
                            Deliverable file
                            <input id="proof" className="mt-1 block" type="file" />
                        </label>
                    )}
                    {shownRole === "client" && actions.includes("object") && (
                        <label className="block text-sm">
                            Objection
                            <input
                                className="mt-1 w-full rounded border bg-white p-2"
                                value={objection}
                                onChange={(event) => setObjection(event.target.value)}
                            />
                        </label>
                    )}
                    {shownRole === "client" && actions.includes("extendReview") && (
                        <label className="block text-sm">
                            Extend review by seconds
                            <input
                                className="mt-1 w-full rounded border bg-white p-2"
                                value={extension}
                                onChange={(event) => setExtension(event.target.value)}
                            />
                        </label>
                    )}
                    {lastTx !== undefined && (
                        <p className="text-sm">
                            {actionLabel(lastTx.action)}: done
                            {lastTx.url !== undefined && (
                                <>
                                    {" "}
                                    <a className="underline" href={lastTx.url} target="_blank" rel="noreferrer">
                                        view on Polygonscan
                                    </a>
                                </>
                            )}
                        </p>
                    )}
                    <details className="text-sm">
                        <summary className="cursor-pointer text-stone-500">Notifications</summary>
                        <label className="mt-2 block">
                            Webhook URL
                            <input
                                className="mt-1 w-full rounded border bg-white p-2"
                                value={webhook}
                                onChange={(event) => setWebhook(event.target.value.trim())}
                            />
                        </label>
                    </details>
                </div>
            )}
        </Stage>
    );
}
