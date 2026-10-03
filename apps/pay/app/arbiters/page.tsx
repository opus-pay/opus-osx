"use client";

import type { ReactNode } from "react";

import { useLocale } from "../../src/components/locale";
import { Stage, fieldClass, primaryButtonClass } from "../../src/components/stage";

/** Arbiter applications are not open yet. The form is shown, disabled, so people know it is coming. */
export default function ArbitersPage() {
    const { t } = useLocale();
    const disabledField = `${fieldClass} cursor-not-allowed bg-canvas`;
    return (
        <Stage
            title={t("arbiter.title")}
            footer={
                <>
                    <button className={primaryButtonClass} type="button" disabled>
                        {t("arbiter.submit")}
                    </button>
                    <span className="rounded-full bg-canvas px-2 py-0.5 text-[12.5px] font-semibold text-muted">
                        {t("soon")}
                    </span>
                </>
            }
        >
            <p className="m-0 mb-5 text-ink-soft">{t("arbiter.intro")}</p>
            <fieldset className="m-0 flex flex-col gap-5 border-0 p-0 opacity-60" disabled>
                <Field label={t("arbiter.name")}>
                    <input className={disabledField} />
                </Field>
                <Field label={t("arbiter.fields")}>
                    <input className={disabledField} />
                </Field>
                <Field label={t("arbiter.languages")}>
                    <input className={disabledField} />
                </Field>
                <Field label={t("arbiter.wallet")}>
                    <input className={`${disabledField} font-mono`} placeholder="0x…" />
                </Field>
                <label className="flex items-start gap-2 text-[15px] text-ink-soft">
                    <input type="checkbox" className="mt-1.5" />
                    {t("arbiter.pledge")}
                </label>
            </fieldset>
        </Stage>
    );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <label className="block">
            <span className="text-[14.5px] font-semibold text-ink-soft">{label}</span>
            {children}
        </label>
    );
}
