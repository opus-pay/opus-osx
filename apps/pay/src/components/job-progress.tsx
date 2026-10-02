import type { JobStatusName, PhaseName } from "@opus/sdk";

import { jobProgress, type StepState } from "../lib/progress";

const STYLE: Record<StepState, string> = {
    done: "border border-stone-900 text-stone-900",
    current: "bg-stone-900 text-white",
    alert: "bg-amber-600 text-white",
    todo: "border border-dashed border-stone-300 text-stone-400",
    passed: "border border-stone-300 text-stone-400",
};

/** Where the job stands among its four stages. */
export function JobProgress({ status, phase }: { status: JobStatusName; phase: PhaseName }) {
    const steps = jobProgress(status, phase);
    return (
        <ol className="flex flex-wrap items-center gap-2 text-sm" aria-label="Job progress">
            {steps.map((step, i) => (
                <li key={step.label} className="flex items-center gap-2">
                    {i > 0 && <span className="h-px w-5 bg-stone-300" aria-hidden />}
                    <span
                        className={`rounded-full px-3 py-1 ${STYLE[step.state]}`}
                        aria-current={step.state === "current" || step.state === "alert" ? "step" : undefined}
                    >
                        {step.state === "done" ? "✓" : `${i + 1}.`} {step.label}
                    </span>
                </li>
            ))}
        </ol>
    );
}
