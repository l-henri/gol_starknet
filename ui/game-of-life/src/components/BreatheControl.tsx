"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useBreathBasket, breathKey, type ExhaledHandler } from "@/lib/breathBasket";

// RHYTHMIC BREATH — tapping "Breathe" adds a generation for THIS creature to the shared breath
// basket (lib/breathBasket) and refills its 1-second window; tapping other creatures' controls adds
// their generations to the SAME bundle. When the window empties, the whole basket is sent as ONE
// multicall transaction (per creature: N generations, N NUT, bond renewed — never auto-signed
// beyond the user's wallet prompt). Tapping is care intensity, not batching: the ×cap is the
// per-TRANSACTION budget shared across the bundle, no "max", no per-tx optimisation.
//
// Motion = computation: taps only pulse the button (and shimmer the grid via onTap) — the grid does
// NOT step during accumulation; it fast-forwards only on the confirmed exhale (the parent drives
// that via onExhaled). Respects prefers-reduced-motion (no pulses; the window becomes a numeric
// countdown).

export interface BreatheControlProps {
  /** the creature this control feeds (decimal or 0x hex token id) */
  creatureId: string;
  connected: boolean;
  onSepolia: boolean;
  onConnect: () => void;
  onSwitch: () => void;
  /** this creature's slice of the bundle confirmed (ok) or the bundle failed */
  onExhaled?: ExhaledHandler;
  onTap?: () => void;                          // parent: one-cell shimmer on the grid
  disabled?: boolean;
  compact?: boolean;                           // Garden-tile variant
  /** the creature has gone out (the empty grid): feeding still works on-chain, but the ritual
   *  changes register — offerings to the void, not breaths into a living thing */
  voidMode?: boolean;
}

export default function BreatheControl({ creatureId, connected, onSepolia, onConnect, onSwitch, onExhaled, onTap, disabled = false, compact = false, voidMode = false }: BreatheControlProps) {
  const { snapshot, tap } = useBreathBasket();
  const [remainMs, setRemainMs] = useState(0); // reduced-motion numeric countdown
  const [reduced, setReduced] = useState(false);

  const key = breathKey(creatureId);
  const depth = snapshot.depths[key] ?? 0;
  const inBundle = depth > 0;
  const busy = snapshot.phase === "exhaling"; // the basket is signing — every control waits
  const phase = busy ? (inBundle ? "exhaling" : "idle") : inBundle ? "accumulating" : "idle";
  const atCap = snapshot.total >= snapshot.cap;
  const others = snapshot.total - depth; // generations queued for OTHER creatures in this breath

  const btnRef = useRef<HTMLButtonElement>(null);
  const countRef = useRef<HTMLSpanElement>(null);
  const onExhaledRef = useRef<ExhaledHandler | undefined>(onExhaled);
  useEffect(() => { onExhaledRef.current = onExhaled; }, [onExhaled]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);

  // reduced-motion: tick down toward the shared deadline while this card is in the bundle
  useEffect(() => {
    if (!reduced || phase !== "accumulating" || !snapshot.deadline) return;
    setRemainMs(Math.max(0, snapshot.deadline - performance.now()));
    const tick = setInterval(() => {
      const r = Math.max(0, snapshot.deadline - performance.now());
      setRemainMs(r);
      if (r <= 0) clearInterval(tick);
    }, 100);
    return () => clearInterval(tick);
  }, [reduced, phase, snapshot.deadline]);

  const handleTap = useCallback(() => {
    if (disabled || busy) return;
    if (!connected) return onConnect();
    if (!onSepolia) return onSwitch();
    if (!reduced) btnRef.current?.animate([{ transform: "scale(1)" }, { transform: "scale(1.06)" }, { transform: "scale(1)" }], { duration: 150, easing: "ease-out" });
    onTap?.();
    const r = tap(creatureId, (n, ok, hash, error) => onExhaledRef.current?.(n, ok, hash, error));
    if (r === "capped" && !reduced) { // at the shared cap: pulse the counter, nothing added
      countRef.current?.animate([{ transform: "translateX(0)" }, { transform: "translateX(-3px)" }, { transform: "translateX(3px)" }, { transform: "translateX(0)" }], { duration: 180 });
    }
  }, [disabled, busy, connected, onSepolia, onConnect, onSwitch, reduced, onTap, tap, creatureId]);

  const label = phase === "exhaling" ? (voidMode ? "the void receives…" : "exhaling…")
    : !connected ? (voidMode ? "Connect to make an offering" : "Connect to breathe")
    : !onSepolia ? "Switch to Sepolia"
    : voidMode ? "Make an offering to the void"
    : "Breathe life";
  const hint = phase === "exhaling" ? (voidMode ? "carrying your offering…" : "sending your breath…")
    : busy ? (voidMode ? "an offering is on its way…" : "a breath is on its way…")
    : phase === "idle" ? (voidMode ? "tap to make an offering" : "tap to give a breath")
    : atCap ? (voidMode ? "a full offering, release to send" : "a full breath, release to send")
    : others > 0 ? `×${snapshot.total} of ×${snapshot.cap} in this breath, across creatures`
    : voidMode ? `tap again to deepen the offering (up to ×${snapshot.cap})`
    : `tap again to breathe deeper (up to ×${snapshot.cap})`;

  return (
    <div className={"breathe" + (compact ? " compact" : "")}>
      <div className="breathe-row">
        <button
          ref={btnRef}
          type="button"
          className="btn set-free breathe-act"
          onClick={handleTap}
          onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); handleTap(); } }}
          disabled={disabled || busy}
        >
          {label}
        </button>
        {inBundle && (
          <span ref={countRef} key={depth} className={"breathe-count mono" + (atCap ? " full" : "")} aria-live="polite">×{depth}</span>
        )}
      </div>

      {phase === "accumulating" && (
        reduced ? (
          <div className="breathe-countdown mono">sends in {(remainMs / 1000).toFixed(1)}s, tap to keep it open</div>
        ) : (
          <div className="breathe-bar" aria-hidden="true"><span key={snapshot.windowKey} className="breathe-bar-fill" /></div>
        )
      )}

      <p className="breathe-hint mono">{hint}</p>
    </div>
  );
}
