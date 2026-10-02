"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { LOCALE_NAMES, LOCALES, isLocale, pickLocale, translate, type Locale, type MessageKey } from "../lib/i18n";

const STORAGE_KEY = "opus.locale";

const LocaleContext = createContext<{ locale: Locale; setLocale: (locale: Locale) => void }>({
    locale: "en",
    setLocale: () => undefined,
});

/** Starts from a saved choice, else the browser language, and keeps `<html lang>` in step. */
export function LocaleProvider({ children }: { children: ReactNode }) {
    const [locale, setState] = useState<Locale>("en");
    useEffect(() => {
        let saved: string | null = null;
        try {
            saved = window.localStorage.getItem(STORAGE_KEY);
        } catch {
            saved = null;
        }
        setState(isLocale(saved) ? saved : pickLocale(navigator.languages ?? [navigator.language]));
    }, []);
    useEffect(() => {
        document.documentElement.lang = locale === "zh" ? "zh-Hans" : locale;
    }, [locale]);
    const setLocale = useCallback((next: Locale) => {
        setState(next);
        try {
            window.localStorage.setItem(STORAGE_KEY, next);
        } catch {
            // Private windows may refuse storage; the choice still holds for this visit.
        }
    }, []);
    const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);
    return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

/** The reader's language, a setter, and `t(key, vars)` bound to it. */
export function useLocale() {
    const { locale, setLocale } = useContext(LocaleContext);
    const t = useCallback(
        (key: MessageKey, vars?: Record<string, string | number>) => translate(locale, key, vars),
        [locale]
    );
    return { locale, setLocale, t };
}

/** The language menu in the top bar. Each language is named in itself. */
export function LanguageSelect() {
    const { locale, setLocale, t } = useLocale();
    return (
        <select
            aria-label={t("nav.language")}
            className="rounded-md border border-line bg-white py-1 pl-2 pr-7 text-[13px] font-medium text-ink-soft hover:border-ink-soft"
            value={locale}
            onChange={(event) => {
                if (isLocale(event.target.value)) setLocale(event.target.value);
            }}
        >
            {LOCALES.map((code) => (
                <option key={code} value={code}>
                    {LOCALE_NAMES[code]}
                </option>
            ))}
        </select>
    );
}
