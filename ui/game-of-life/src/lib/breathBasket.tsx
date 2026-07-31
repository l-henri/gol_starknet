"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useGolSdk } from "./sdk";
import { useWallet } from "./wallet";
import { useBreathCap } from "./gasCaps";
import { tokenIdDecimal } from "./format";
import { useT, type Dict } from "./i18n";

/* ------------------------------------------------------------------ *
 * THE SHARED BREATH BASKET — one bundle of tap intents across every
 * visible creature. Tapping any creature adds a generation for THAT
 * creature and refills the ONE shared 1-second window; when the window
 * drains, all intents go out as a single multicall transaction (per
 * creature: move_lifeform_forward_n(n-1) + pet — N gens, N NUT, bond
 * renewed — Starknet accounts are natively multicall, so this is one
 * signature). The per-tx feed cap applies to the SUM across creatures:
 * the stepper re-simulates on-chain and the gas budget is per
 * transaction, not per creature. Navigating to another page discards
 * pending taps (no scolding, no surprise wallet prompt); a bundle
 * already signing is left to land.
 * ------------------------------------------------------------------ */

const WINDOW_MS = 1000;

/** This creature's slice of the bundle landed (ok) or the bundle failed. */
export type ExhaledHandler = (n: number, ok: boolean, txHash: string | null, error: string | null) => void;

export interface BasketSnapshot {
  phase: "idle" | "accumulating" | "exhaling";
  /** decimal token id → accumulated generations (kept during exhale so cards can show it) */
  depths: Record<string, number>;
  total: number;
  cap: number;
  /** bumps on every re-arm — remount the CSS drain bar */
  windowKey: number;
  /** performance.now() timestamp when the window sends */
  deadline: number;
}

interface BasketCtx {
  snapshot: BasketSnapshot;
  /** Add one generation of intent for a creature and refill the shared window.
   *  "capped": the bundle is at ×cap (window refilled, nothing added). "busy": a bundle is signing. */
  tap: (creatureId: string, onExhaled?: ExhaledHandler) => "added" | "capped" | "busy";
}

const IDLE: BasketSnapshot = { phase: "idle", depths: {}, total: 0, cap: 10, windowKey: 0, deadline: 0 };
const Ctx = createContext<BasketCtx>({ snapshot: IDLE, tap: () => "busy" });

export const useBreathBasket = () => useContext(Ctx);

/** Normalize any token-id form (0x hex / decimal) to the decimal key the call builders take. */
export function breathKey(creatureId: string): string {
  try { return tokenIdDecimal(creatureId); } catch { return creatureId; }
}

function humanize(e: unknown, t: (d: Dict) => string): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/reject|abort|denied|cancel/i.test(m))
    return t({ fr: "Tu as refusé la signature.", en: "You declined the signature." });
  if (/insufficient|balance|fee|funds/i.test(m))
    return t({ fr: "Pas assez de gas pour nourrir.", en: "Not enough gas to feed." });
  // Some wallets (seen with Xverse) throw a blank error when they fail to broadcast — never show an
  // empty message, or the failure reads as "nothing happened". Give an actionable fallback.
  const msg = m.trim();
  if (!msg)
    return t({
      fr: "Ton portefeuille n'a pas diffusé la transaction. Réessaie, ou utilise un autre portefeuille Starknet (ArgentX, Braavos).",
      en: "Your wallet didn't broadcast the transaction. Try again, or use another Starknet wallet (ArgentX, Braavos).",
    });
  return msg.length > 140 ? msg.slice(0, 137) + "…" : msg;
}

type Entry = { depth: number; onExhaled?: ExhaledHandler };

export function BreathBasketProvider({ children }: { children: ReactNode }) {
  const { t } = useT();
  const { sdk } = useGolSdk();
  const { execute, waitForTx } = useWallet();
  const cap = useBreathCap();
  const pathname = usePathname();

  const entriesRef = useRef<Map<string, Entry>>(new Map());
  const phaseRef = useRef<BasketSnapshot["phase"]>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const windowKeyRef = useRef(0);
  const [snapshot, setSnapshot] = useState<BasketSnapshot>(IDLE);

  const publish = useCallback((deadline: number) => {
    const depths: Record<string, number> = {};
    let total = 0;
    for (const [k, e] of entriesRef.current) { depths[k] = e.depth; total += e.depth; }
    setSnapshot({ phase: phaseRef.current, depths, total, cap, windowKey: windowKeyRef.current, deadline });
  }, [cap]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }, []);

  const discard = useCallback(() => {
    clearTimer();
    entriesRef.current.clear();
    phaseRef.current = "idle";
    publish(0);
  }, [clearTimer, publish]);

  const send = useCallback(async () => {
    clearTimer();
    const entries = [...entriesRef.current.entries()].filter(([, e]) => e.depth > 0);
    if (!sdk || entries.length === 0) { discard(); return; }
    phaseRef.current = "exhaling";
    publish(0); // depths stay visible on the cards while the tx signs
    let hash: string | null = null;
    let error: string | null = null;
    try {
      // Per creature: `pet` is the ceremonial 1-generation breath that opens/refreshes the 7-day
      // bond (and mints 1 NUT); a deeper breath prepends move_lifeform_forward_n for the other
      // n-1 generations. The whole basket is ONE invoke — Starknet multicall.
      const calls = entries.flatMap(([id, e]) =>
        e.depth > 1 ? [...(sdk.breatheLifeCall(id, e.depth - 1) as unknown[]), ...(sdk.petCall(id) as unknown[])] : (sdk.petCall(id) as unknown[])
      );
      const h = await execute(calls);
      if (!h) throw new Error("Wallet returned no transaction hash (the breath was not broadcast).");
      hash = h;
      await waitForTx(h); // bumps txEpoch on confirm → ward clocks / NUT chip refresh themselves
    } catch (e) {
      console.error("[breath-basket] bundled feed failed:", e);
      error = humanize(e, t);
    }
    for (const [, entry] of entries) {
      try { entry.onExhaled?.(entry.depth, error === null, hash, error); } catch { /* a card unmounted mid-flight */ }
    }
    entriesRef.current.clear();
    phaseRef.current = "idle";
    publish(0);
  }, [sdk, execute, waitForTx, t, clearTimer, discard, publish]);

  // keep the timer's closure on the LATEST send (sdk/wallet can change between taps)
  const sendRef = useRef(send);
  useEffect(() => { sendRef.current = send; }, [send]);

  const armWindow = useCallback(() => {
    clearTimer();
    windowKeyRef.current += 1;
    const deadline = performance.now() + WINDOW_MS;
    timerRef.current = setTimeout(() => { void sendRef.current(); }, WINDOW_MS);
    publish(deadline);
  }, [clearTimer, publish]);

  const tap = useCallback<BasketCtx["tap"]>((creatureId, onExhaled) => {
    if (phaseRef.current === "exhaling") return "busy";
    const key = breathKey(creatureId);
    const entries = entriesRef.current;
    const entry = entries.get(key) ?? { depth: 0 };
    entry.onExhaled = onExhaled ?? entry.onExhaled;
    let total = 0;
    for (const e of entries.values()) total += e.depth;
    if (total >= cap) { // the shared per-tx budget is full: refill the window, add nothing
      entries.set(key, entry);
      phaseRef.current = "accumulating";
      armWindow();
      return "capped";
    }
    entry.depth += 1;
    entries.set(key, entry);
    phaseRef.current = "accumulating";
    armWindow();
    return "added";
  }, [cap, armWindow]);

  // Route change: discard un-sent taps (never carry a pending wallet prompt to another page).
  // A bundle already signing is in the wallet's hands — let it land.
  const prevPath = useRef(pathname);
  useEffect(() => {
    if (prevPath.current === pathname) return;
    prevPath.current = pathname;
    if (phaseRef.current === "accumulating") discard();
  }, [pathname, discard]);

  useEffect(() => clearTimer, [clearTimer]);

  return <Ctx.Provider value={{ snapshot, tap }}>{children}</Ctx.Provider>;
}
