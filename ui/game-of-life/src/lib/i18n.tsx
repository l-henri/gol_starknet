"use client";

import { createContext, useCallback, useContext, type ReactNode } from "react";

export type Lang = "fr" | "en";
/** A single piece of UI copy in both languages, picked by the active language at the call site. */
export type Dict = { fr: string; en: string };

// French is temporarily disabled — the FR wording needs a rewrite before we show it again.
// Every call site still carries its `fr:` string, so bringing French back is just a matter of
// restoring the language state + detection here and re-adding <LangToggle /> to the header.
// See git history of this file for the previous localStorage / navigator.language implementation.
const LangContext = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({
  lang: "en",
  setLang: () => {},
});

// Pinned to English. Stable reference so context consumers don't re-render needlessly.
const VALUE: { lang: Lang; setLang: (l: Lang) => void } = { lang: "en", setLang: () => {} };

export function LangProvider({ children }: { children: ReactNode }) {
  return <LangContext.Provider value={VALUE}>{children}</LangContext.Provider>;
}

/** `const { t, lang, setLang } = useT();` then `t({ fr: "…", en: "…" })` at each copy site. */
export function useT() {
  const { lang, setLang } = useContext(LangContext);
  // stable while `lang` is unchanged, so it's safe in hook dependency arrays
  const t = useCallback((d: Dict) => d[lang], [lang]);
  return { t, lang, setLang };
}
