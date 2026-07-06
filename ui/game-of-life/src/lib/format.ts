import type { JsLifeform } from "./types";
import type { Dict } from "./i18n";

export const shortAddr = (a: string): string =>
  a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;

/** token_id hex -> decimal string (the display id, e.g. "98307"). */
export const tokenIdDecimal = (hex: string): string => BigInt(hex).toString();

/** A lifeform's kind as a bilingual pair — translate at the call site with `t(...)`. */
export function lifeformKind(
  lf: Pick<JsLifeform, "is_loop" | "is_still" | "is_dead" | "sequence_length">
): Dict {
  if (lf.is_dead) return { fr: "Éteinte", en: "Dead" };
  if (lf.is_still) return { fr: "Nature morte", en: "Still life" };
  // The period is shown as its own trait now, so the kind label stays clean ("Loop", not "Loop · period N").
  if (lf.is_loop) return { fr: "Boucle", en: "Loop" };
  return { fr: "Chemin", en: "Path" };
}

/** NUT hex balance -> human number with up to 2 decimals. */
export function formatNut(hex: string): string {
  const wei = BigInt(hex);
  const whole = wei / 10n ** 18n;
  const frac = (wei % 10n ** 18n) / 10n ** 16n; // 2 dp
  return frac > 0n ? `${whole}.${frac.toString().padStart(2, "0")}` : `${whole}`;
}
