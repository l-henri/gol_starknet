"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "fr" | "en";
/** A single piece of UI copy in both languages, picked by the active language at the call site. */
export type Dict = { fr: string; en: string };

const STORAGE_KEY = "gol-lang";
const LangContext = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({
  lang: "en",
  setLang: () => {},
});

export function LangProvider({ children }: { children: ReactNode }) {
  // "en" on the server AND the first client render (so hydration matches); the real preference
  // (saved choice, else the browser language) is applied in an effect right after mount.
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    let initial: Lang | null = null;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "fr" || saved === "en") initial = saved;
    } catch {
      /* localStorage unavailable — fall through to the browser language */
    }
    if (!initial && typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("fr")) {
      initial = "fr";
    }
    if (initial) {
      setLangState(initial);
      document.documentElement.lang = initial;
    }
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore persistence failures */
    }
    document.documentElement.lang = l;
  };

  return <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>;
}

/** `const { t, lang, setLang } = useT();` then `t({ fr: "…", en: "…" })` at each copy site. */
export function useT() {
  const { lang, setLang } = useContext(LangContext);
  // stable while `lang` is unchanged, so it's safe in hook dependency arrays
  const t = useCallback((d: Dict) => d[lang], [lang]);
  return { t, lang, setLang };
}

/** The FR / EN segmented switch shown in the header. */
export function LangToggle() {
  const { lang, setLang } = useT();
  return (
    <div className="lang-toggle" role="group" aria-label="Language / Langue">
      <button
        type="button"
        className={lang === "fr" ? "on" : ""}
        aria-pressed={lang === "fr"}
        onClick={() => setLang("fr")}
      >
        FR
      </button>
      <button
        type="button"
        className={lang === "en" ? "on" : ""}
        aria-pressed={lang === "en"}
        onClick={() => setLang("en")}
      >
        EN
      </button>
    </div>
  );
}
