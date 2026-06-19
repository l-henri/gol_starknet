import type { JsLifeform } from "./types";

export const shortAddr = (a: string): string =>
  a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;

/** token_id hex -> decimal string (the display id, e.g. "98307"). */
export const tokenIdDecimal = (hex: string): string => BigInt(hex).toString();

export function lifeformKind(lf: Pick<JsLifeform, "is_loop" | "is_still" | "is_dead" | "sequence_length">): string {
  if (lf.is_dead) return "Dead";
  if (lf.is_still) return "Still life";
  if (lf.is_loop) return lf.sequence_length > 1 ? `Loop · period ${lf.sequence_length}` : "Loop";
  return "Path";
}

/** NUT hex balance -> human number with up to 2 decimals. */
export function formatNut(hex: string): string {
  const wei = BigInt(hex);
  const whole = wei / 10n ** 18n;
  const frac = (wei % 10n ** 18n) / 10n ** 16n; // 2 dp
  return frac > 0n ? `${whole}.${frac.toString().padStart(2, "0")}` : `${whole}`;
}
