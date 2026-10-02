"use client";

import { Opus, evaluatorAbi, type JobAction, type JobStatusName, type PhaseName, type WalletStatus } from "@opus/sdk";
import { Check, ExternalLink } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { getAddress, zeroAddress, type Address } from "viem";
import { useAccount, useConnect, usePublicClient, useWalletClient } from "wagmi";

import { Balances } from "../../../src/components/balances";
import { JobProgress } from "../../../src/components/job-progress";
import {
    Facts,
    SectionLabel,
    Stage,
    StageTab,
    fieldClass,
    primaryButtonClass,
    secondaryButtonClass,
} from "../../../src/components/stage";
import { dueNotices, notify } from "../../../src/lib/notices";
import { proofHash, textHash } from "../../../src/lib/proof";
import { actionLabel, escrowFor, roleGuide, statusFacts, type Role } from "../../../src/lib/status-text";
import { confirmed, explorerTx } from "../../../src/lib/tx";
import { addresses } from "../../../src/lib/wagmi";
import { useLocale } from "../../../src/components/locale";

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
    const { t } = useLocale();
    const [ready, setReady] = useState(false);
    useEffect(() => setReady(true), []);
    if (!ready) {
        return (
            <Stage title={t("job.title", { id: params.id })} footer={<span />}>
                <p>{t("job.loading")}</p>
            </Stage>
        );
    }
    return <JobScreen id={params.id} />;
}

function JobScreen({ id }: { id: string }) {
    const { locale, t } = useLocale();
    const jobId = BigInt(id);
    const { address, isConnected } = useAccount();
    const { connect, connectors } = useConnect();
    const publicClient = usePublicClient();
    const { data: walletClient } = useWalletClient();
    const [job, setJob] = useState<JobView | undefined>(undefined);
    const [loadError, setLoadError] = useState<string | undefined>(undefined);
    const [tab, setTab] = useState<Role | undefined>(undefined);
    const [tick, setTick] = useState(0);
    const [objection, setObjection] = useState(() => t("job.objectionDefault"));
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
        void load().catch((error) => setLoadError(error instanceof Error ? error.message : t("job.unreadable")));
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
            toast.error(error instanceof Error ? error.message : t("job.webhookFailed"));
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
                if (file === undefined) throw new Error(t("job.chooseFile"));
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
                if (who === undefined) throw new Error(t("job.connect"));
                if ((await opus.claimableOnInstance(who)) > 0n) {
                    sent.push(await confirmed(publicClient, await opus.withdrawFromInstance()));
                }
                if ((await opus.claimableOnEvaluator(addresses.usdc, who)) > 0n) {
                    sent.push(await confirmed(publicClient, await opus.withdrawFromEvaluator(addresses.usdc)));
                }
            }
            const last = sent.at(-1);
            setLastTx({ action, url: last === undefined ? undefined : explorerTx(addresses.chainId, last) });
            toast.success(t("done", { what: actionLabel(action, locale) }));
            await load();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : t("tx.failed"));
        } finally {
            setBusy(false);
        }
    }

    const actions = job === undefined ? [] : job.actions[shownRole];
    const roleTab = (role: Role, label: string) => (
        <StageTab current={shownRole === role} onClick={() => setTab(role)}>
            {label}
            {myRole === role && (
                <span className="ml-1.5 rounded-full bg-cobalt-wash px-1.5 text-[13px] font-semibold text-cobalt">
                    {t("you")}
                </span>
            )}
        </StageTab>
    );

    return (
        <Stage
            title={t("job.title", { id })}
            progress={job === undefined ? undefined : <JobProgress status={job.status} phase={job.phase} />}
            tabs={
                <>
                    {roleTab("client", t("roleTitle.client"))}
                    {roleTab("provider", t("roleTitle.provider"))}
                </>
            }
            footer={
                !isConnected ? (
                    <button
                        className={primaryButtonClass}
                        type="button"
                        onClick={() => connect({ connector: connectors[0] })}
                    >
                        {t("button.connect")}
                    </button>
                ) : (
                    <>
                        {actions.map((action) => (
                            <button
                                key={action}
                                className={primaryButtonClass}
                                type="button"
                                disabled={busy || !canAct}
                                onClick={() => void run(action)}
                            >
                                {busy ? t("button.busy") : actionLabel(action, locale)}
                            </button>
                        ))}
                        <button
                            className={`${secondaryButtonClass} ml-auto`}
                            type="button"
                            disabled={busy}
                            onClick={() => void refresh()}
                        >
                            {t("job.refresh")}
                        </button>
                    </>
                )
            }
        >
            {job === undefined ? (
                <p className="m-0 text-muted">{loadError ?? t("job.reading")}</p>
            ) : (
                <div className="flex flex-col gap-6">
                    <div
                        className={`rounded-xl px-4 py-3 ${
                            job.phase === "Escalated" || job.phase === "ArbiterPending"
                                ? "bg-amber-wash text-amber"
                                : "bg-cobalt-wash text-ink"
                        }`}
                    >
                        <p className="m-0 text-[18px] font-semibold leading-snug">
                            {roleGuide(shownRole, job.status, job.phase, job.autoComplete, locale)}
                        </p>
                        {isConnected && !canAct && actions.length > 0 && (
                            <p className="m-0 mt-1 text-[15px] font-medium text-amber">
                                {t("job.switch", { role: t(`role.${shownRole}`) })}
                            </p>
                        )}
                    </div>
                    <Facts
                        items={statusFacts(
                            {
                                status: job.status,
                                phase: job.phase,
                                nextDeadline: job.nextDeadline,
                                now: job.now,
                            },
                            locale
                        )}
                    />
                    <section>
                        <SectionLabel>{t("money.title")}</SectionLabel>
                        <Balances
                            client={job.client}
                            provider={job.provider}
                            escrow={escrowFor(job.status, job.budget, locale)}
                            me={me}
                            tick={tick}
                        />
                    </section>
                    {shownRole === "provider" && actions.includes("submit") && (
                        <label className="block">
                            <SectionLabel>{t("job.file")}</SectionLabel>
                            <input
                                id="proof"
                                className="block w-full text-[15.5px] text-ink-soft file:mr-3 file:rounded-lg file:border file:border-line file:bg-white file:px-3 file:py-2 file:text-[15.5px] file:font-medium file:text-ink"
                                type="file"
                            />
                        </label>
                    )}
                    {shownRole === "client" && actions.includes("object") && (
                        <label className="block">
                            <SectionLabel>{t("job.objection")}</SectionLabel>
                            <input
                                className={fieldClass}
                                value={objection}
                                onChange={(event) => setObjection(event.target.value)}
                            />
                        </label>
                    )}
                    {shownRole === "client" && actions.includes("extendReview") && (
                        <label className="block">
                            <SectionLabel>{t("job.extend")}</SectionLabel>
                            <input
                                className={fieldClass}
                                value={extension}
                                onChange={(event) => setExtension(event.target.value)}
                            />
                        </label>
                    )}
                    {lastTx !== undefined && (
                        <p className="m-0 flex items-center gap-2 text-[15.5px]">
                            <Check className="text-emerald" size={16} strokeWidth={3} aria-hidden />
                            <span className="text-ink">{t("done", { what: actionLabel(lastTx.action, locale) })}</span>
                            {lastTx.url !== undefined && (
                                <a
                                    className="ml-auto inline-flex items-center gap-1 text-cobalt"
                                    href={lastTx.url}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    Polygonscan
                                    <ExternalLink size={13} aria-hidden />
                                </a>
                            )}
                        </p>
                    )}
                    <details className="text-[15.5px]">
                        <summary className="cursor-pointer font-medium text-muted">{t("job.notifications")}</summary>
                        <label className="mt-2 block">
                            <span className="text-[14.5px] font-semibold text-ink-soft">{t("job.webhook")}</span>
                            <input
                                className={fieldClass}
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
