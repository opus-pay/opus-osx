import type { ReactNode } from "react";

/**
 * One recording frame. Header (title and progress), optional tabs, a scrolling body and the
 * action row stay in the same place on every screen, so a recording never jumps.
 */
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
        <section className="flex h-[max(36rem,calc(100dvh-7rem))] max-h-[54rem] w-full flex-col overflow-hidden rounded-2xl border border-line bg-white">
            <header className="shrink-0 border-b border-line px-8 pb-5 pt-6">
                <h1 className="text-[25px] font-bold leading-tight tracking-tight text-ink">{title}</h1>
                {progress != null && <div className="mt-5">{progress}</div>}
            </header>
            {tabs != null && (
                <div className="shrink-0 px-8 pt-5">
                    <div className="inline-flex gap-1 rounded-lg bg-canvas p-1" role="tablist">
                        {tabs}
                    </div>
                </div>
            )}
            <div className="min-h-0 flex-1 overflow-auto px-8 py-4 text-[17px] leading-relaxed">{children}</div>
            <footer className="flex shrink-0 items-center gap-2 border-t border-line bg-white px-8 py-4">
                {footer}
            </footer>
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
            className={
                current
                    ? "rounded-md bg-white px-4 py-2 text-[15px] font-semibold text-ink shadow-sm"
                    : "rounded-md px-4 py-2 text-[15px] font-medium text-muted hover:text-ink"
            }
            role="tab"
            type="button"
            onClick={onClick}
        >
            {children}
        </button>
    );
}

/** A label and its value, listed in two columns. */
export function Facts({ items }: { items: { label: string; value: ReactNode }[] }) {
    return (
        <dl className="m-0 grid grid-cols-[10rem_1fr] items-baseline gap-x-4 gap-y-1.5">
            {items.map((item) => (
                <div key={item.label} className="contents">
                    <dt className={LABEL_CLASS}>{item.label}</dt>
                    <dd className="m-0 text-[17px] font-medium text-ink">{item.value}</dd>
                </div>
            ))}
        </dl>
    );
}

/** One style for every label in the body: list labels and section headings alike. */
const LABEL_CLASS = "text-[14.5px] font-semibold text-ink-soft";

/** A small heading inside the body. */
export function SectionLabel({ children }: { children: ReactNode }) {
    return <h2 className={`mb-2 ${LABEL_CLASS}`}>{children}</h2>;
}

export const primaryButtonClass =
    "inline-flex h-11 items-center rounded-lg bg-cobalt px-5 text-[17px] font-semibold text-white hover:bg-cobalt-deep disabled:opacity-50";
export const secondaryButtonClass =
    "inline-flex h-11 items-center rounded-lg border border-line bg-white px-5 text-[17px] font-medium text-ink hover:border-ink-soft disabled:opacity-50";

export const fieldClass =
    "mt-1.5 block w-full rounded-lg border border-line bg-white px-3 py-2.5 text-[17px] text-ink placeholder:text-muted focus:border-cobalt focus:outline-none focus:ring-4 focus:ring-cobalt-wash";
