import type { JobStatusName, PhaseName } from "@opus/sdk";

import { jobProgress, type StepState } from "../lib/progress";

const STYLE: Record<StepState, string> = {
    done: "border border-stone-900 text-stone-900",
    current: "bg-stone-900 text-white",
    alert: "bg-amber-600 text-white",
    todo: "border border-dashed border-stone-300 text-stone-400",
    passed: "border border-stone-300 text-stone-400",
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
    const steps = jobProgress(status, phase, onChain);
    return (
        <ol className="flex flex-nowrap items-center gap-1 overflow-x-auto text-[13px]" aria-label="Job progress">
            {steps.map((step, i) => (
                <li key={step.label} className="flex shrink-0 items-center gap-1">
                    {i > 0 && <span className="h-px w-2 bg-stone-300" aria-hidden />}
                    <span
                        className={`whitespace-nowrap rounded-full px-2 py-0.5 ${STYLE[step.state]}`}
                        aria-current={step.state === "current" || step.state === "alert" ? "step" : undefined}
                    >
                        {step.state === "done" ? "✓" : `${i + 1}.`} {step.label}
                    </span>
                </li>
            ))}
        </ol>
    );
}
