import type { ReactNode } from "react";

/** One recording frame. Title, tabs, body, and the action row stay in the same place on every screen. */
export function Stage({
    title,
    progress,
    tabs,
    children,
    footer,
}: {
    title: string;
    progress?: ReactNode;
    tabs?: ReactNode;
    children: ReactNode;
    footer: ReactNode;
}) {
    return (
        <section className="flex h-[40rem] w-full flex-col">
            <h1 className="text-2xl font-semibold">{title}</h1>
            {progress != null && <div className="mt-3 shrink-0">{progress}</div>}
            {tabs != null && (
                <div className="mt-4 flex h-10 shrink-0 items-center gap-2" role="tablist">
                    {tabs}
                </div>
            )}
            <div className="mt-4 min-h-0 flex-1 overflow-auto">{children}</div>
            <div className="mt-4 flex h-10 shrink-0 items-center gap-2">{footer}</div>
        </section>
    );
}

export function StageTab({
    current,
    children,
    onClick,
}: {
    current?: boolean;
    children: ReactNode;
    onClick?: () => void;
}) {
    return (
        <button
            aria-selected={current === true}
            className={current ? "rounded bg-stone-900 px-3 py-2 text-white" : "rounded border px-3 py-2"}
            role="tab"
            type="button"
            onClick={onClick}
        >
            {children}
        </button>
    );
}

export const primaryButtonClass = "rounded bg-stone-900 px-4 py-2 text-white";
export const secondaryButtonClass = "rounded border px-3 py-2";
