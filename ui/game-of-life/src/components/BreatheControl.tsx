"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// RHYTHMIC BREATH — tapping "Breathe" opens a 1-second window; each further tap within it adds a
// generation and refills the window; when the window empties, the accumulated breath is sent as ONE
// transaction (N generations, N NUT, bond renewed — never auto-signed beyond the user's wallet
// prompt). Tapping is care intensity, not batching: capped, no "max", no per-tx optimisation.
//
// Motion = computation: taps only pulse the button (and shimmer the grid via onTap) — the grid does
// NOT step during accumulation; it fast-forwards only on the confirmed exhale (the parent drives
// that). Respects prefers-reduced-motion (no pulses; the window becomes a numeric countdown).

const WINDOW_MS = 1000;

export interface BreatheControlProps {
  cap: number;                                 // ×MAX — the wallet's deepest single breath
  connected: boolean;
  onSepolia: boolean;
  onConnect: () => void;
  onSwitch: () => void;
  /** send the accumulated breath; resolves true on confirm, false on reject/error */
  onExhale: (depth: number) => Promise<boolean>;
  onTap?: () => void;                          // parent: one-cell shimmer on the grid
  disabled?: boolean;                          // e.g. a creature that has gone out
  compact?: boolean;                           // Garden-tile variant
}

type Phase = "idle" | "accumulating" | "exhaling";

export default function BreatheControl({ cap, connected, onSepolia, onConnect, onSwitch, onExhale, onTap, disabled = false, compact = false }: BreatheControlProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [depth, setDepth] = useState(0);
  const [windowKey, setWindowKey] = useState(0); // remount the bar → restart its CSS drain
  const [remainMs, setRemainMs] = useState(WINDOW_MS); // reduced-motion numeric countdown
  const [reduced, setReduced] = useState(false);

  const depthRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const deadlineRef = useRef(0);
  const btnRef = useRef<HTMLButtonElement>(null);
  const countRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);

  const clearTimers = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
  }, []);
  useEffect(() => clearTimers, [clearTimers]);

  const send = useCallback(async () => {
    clearTimers();
    const n = depthRef.current;
    if (n < 1) { setPhase("idle"); return; }
    setPhase("exhaling");
    await onExhale(n); // confirm OR reject → either way return to idle, depth discarded (no scolding)
    depthRef.current = 0;
    setDepth(0);
    setPhase("idle");
  }, [clearTimers, onExhale]);

  const armWindow = useCallback(() => {
    clearTimers();
    setWindowKey((k) => k + 1);
    deadlineRef.current = performance.now() + WINDOW_MS;
    timerRef.current = setTimeout(() => { void send(); }, WINDOW_MS);
    if (reduced) {
      setRemainMs(WINDOW_MS);
      tickRef.current = setInterval(() => {
        const r = Math.max(0, deadlineRef.current - performance.now());
        setRemainMs(r);
        if (r <= 0) { if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; } }
      }, 100);
    }
  }, [clearTimers, send, reduced]);

  const tap = useCallback(() => {
    if (disabled || phase === "exhaling") return;
    if (!connected) return onConnect();
    if (!onSepolia) return onSwitch();
    if (!reduced) btnRef.current?.animate([{ transform: "scale(1)" }, { transform: "scale(1.06)" }, { transform: "scale(1)" }], { duration: 150, easing: "ease-out" });
    onTap?.();
    if (phase === "idle") {
      depthRef.current = 1; setDepth(1); setPhase("accumulating"); armWindow();
      return;
    }
    if (depthRef.current >= cap) { // at cap: pulse the counter, refill the window, but don't add
      if (!reduced) countRef.current?.animate([{ transform: "translateX(0)" }, { transform: "translateX(-3px)" }, { transform: "translateX(3px)" }, { transform: "translateX(0)" }], { duration: 180 });
      armWindow();
      return;
    }
    depthRef.current += 1; setDepth(depthRef.current); armWindow();
  }, [disabled, phase, connected, onSepolia, onConnect, onSwitch, reduced, onTap, cap, armWindow]);

  const atCap = depth >= cap;
  const label = phase === "exhaling" ? "exhaling…"
    : !connected ? "Connect to breathe"
    : !onSepolia ? "Switch to Sepolia"
    : "Breathe life";
  const hint = phase === "exhaling" ? "sending your breath…"
    : phase === "idle" ? "tap to give a breath"
    : atCap ? "a full breath — release to send"
    : `tap again to breathe deeper (up to ×${cap})`;

  return (
    <div className={"breathe" + (compact ? " compact" : "")}>
      <div className="breathe-row">
        <button
          ref={btnRef}
          type="button"
          className="btn set-free breathe-act"
          onClick={tap}
          onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); tap(); } }}
          disabled={disabled || phase === "exhaling"}
        >
          {label}
        </button>
        {phase !== "idle" && (
          <span ref={countRef} key={depth} className={"breathe-count mono" + (atCap ? " full" : "")} aria-live="polite">×{depth}</span>
        )}
      </div>

      {phase === "accumulating" && (
        reduced ? (
          <div className="breathe-countdown mono">sends in {(remainMs / 1000).toFixed(1)}s — tap to keep it open</div>
        ) : (
          <div className="breathe-bar" aria-hidden="true"><span key={windowKey} className="breathe-bar-fill" /></div>
        )
      )}

      <p className="breathe-hint mono">{hint}</p>
    </div>
  );
}
