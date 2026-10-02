import type { JobStatusName, PhaseName } from "@opus/sdk";
import { Check } from "lucide-react";

import { jobProgress, type StepState } from "../lib/progress";
import { useLocale } from "./locale";

const DOT: Record<StepState, string> = {
    done: "border-emerald bg-emerald text-white",
    current: "border-cobalt bg-white text-cobalt ring-4 ring-cobalt-wash",
    alert: "border-amber bg-amber text-white ring-4 ring-amber-wash",
    todo: "border-line bg-white text-muted",
    passed: "border-line bg-canvas text-muted",
};

const LABEL: Record<StepState, string> = {
    done: "text-ink-soft",
    current: "font-semibold text-cobalt",
    alert: "font-semibold text-amber",
    todo: "text-muted",
    passed: "text-muted line-through",
};

/** Where the job stands among its five stages. `onChain` is false while the link is still being signed. */
export function JobProgress({
    status,
    phase,
    onChain = true,
}: {
    status: JobStatusName;
    phase: PhaseName;
    onChain?: boolean;
}) {
    const { locale, t } = useLocale();
    const steps = jobProgress(status, phase, onChain, locale);
    return (
        <ol className="m-0 grid list-none grid-cols-5 p-0" aria-label={t("progress.label")}>
            {steps.map((step, i) => {
                const reached = step.state !== "todo";
                return (
                    <li key={step.label} className="relative flex flex-col items-center">
                        {i > 0 && (
                            <span
                                className={`absolute right-1/2 top-[13px] h-0.5 w-full ${
                                    reached ? "bg-emerald" : "bg-line"
                                }`}
                                aria-hidden
                            />
                        )}
                        <span
                            className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 text-[12.5px] font-semibold tabular-nums ${
                                DOT[step.state]
                            }`}
                            aria-current={step.state === "current" || step.state === "alert" ? "step" : undefined}
                        >
                            {step.state === "done" ? <Check size={15} strokeWidth={3} aria-hidden /> : i + 1}
                        </span>
                        <span className={`mt-1.5 whitespace-nowrap text-[12.5px] ${LABEL[step.state]}`}>
                            {step.label}
                        </span>
                    </li>
                );
            })}
        </ol>
    );
}
