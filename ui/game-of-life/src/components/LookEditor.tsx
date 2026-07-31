"use client";

import { useRef, useState } from "react";
import { useWallet } from "@/lib/wallet";

/* ------------------------------------------------------------------ *
 * The owner's discreet edit surface for a creature's on-chain look
 * (RenderParams). The traits themselves become the controls: click a
 * swatch and the colour palette opens; click the pace and the number
 * becomes a field. Edits preview live; nothing touches the chain until
 * the owner makes the new look permanent (one `set_render_params` tx).
 * Contract invariants: bg != cell, 0 < speed < SPEED_MAX.
 * ------------------------------------------------------------------ */

export type Look = { bg: number; cell: number; speed: number };

/** exclusive upper bound — mirrors SPEED_MAX in src/interfaces_v2.cairo */
export const SPEED_MAX = 200;

const toHex = (n: number) => "#" + (n & 0xffffff).toString(16).padStart(6, "0");

const chipStyle = (hex: string): React.CSSProperties => ({
  display: "inline-block",
  width: 14,
  height: 14,
  borderRadius: 4,
  background: hex,
  border: "1px solid rgba(255,255,255,0.2)",
});

/** A colour trait. Read-only for visitors; for the owner, clicking it opens the palette. */
export function EditableSwatch({ color, editable, onPick }: { color: number; editable: boolean; onPick: (c: number) => void }) {
  // the input's value while the palette is being dragged — commits to the draft debounced,
  // so the live preview doesn't re-render on every picker tick
  const [local, setLocal] = useState<string | null>(null);
  const timer = useRef<number>(0);
  const hex = local ?? toHex(color);

  if (!editable) {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <span style={chipStyle(hex)} />
        <span className="mono">{hex}</span>
      </span>
    );
  }
  return (
    <label className="swatch-edit" title="Click to choose a new colour">
      <input
        type="color"
        value={hex}
        onChange={(e) => {
          const v = e.target.value;
          setLocal(v);
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => {
            onPick(parseInt(v.slice(1), 16));
            setLocal(null);
          }, 200);
        }}
      />
      <span style={chipStyle(hex)} />
      <span className="mono">{hex}</span>
      <span className="swatch-edit-hint" aria-hidden="true">✎</span>
    </label>
  );
}

/** The pace trait. For the owner, the number itself is clickable and becomes a field. */
export function EditablePace({ speed, editable, onPick }: { speed: number; editable: boolean; onPick: (s: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");

  if (!editable) return <>{speed} gen/s</>;

  const commit = () => {
    setEditing(false);
    const n = Math.round(Number(val));
    if (Number.isFinite(n) && n >= 1 && n < SPEED_MAX && n !== speed) onPick(n);
  };

  return editing ? (
    <span className="pace-edit-box">
      <input
        type="number"
        min={1}
        max={SPEED_MAX - 1}
        value={val}
        autoFocus
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          else if (e.key === "Escape") setEditing(false);
        }}
      />{" "}
      gen/s
    </span>
  ) : (
    <button type="button" className="pace-edit" title="Click to change the pace" onClick={() => { setVal(String(speed)); setEditing(true); }}>
      {speed} gen/s
    </button>
  );
}

/**
 * Sign + send the owner's new look. `build` turns the look into the wallet calls
 * (setRenderParamsCall / setPathRenderParamsCall); `onSaved` receives the look the
 * chain just accepted so the page can adopt it without an extra read.
 */
export function useLookApply(build: (d: Look) => unknown, onSaved: (d: Look) => void) {
  const { execute, waitForTx } = useWallet();
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const apply = async (d: Look) => {
    setErr(null);
    if ((d.bg & 0xffffff) === (d.cell & 0xffffff)) {
      setErr("The cells and the background must be two different colours.");
      return;
    }
    if (!(d.speed >= 1 && d.speed < SPEED_MAX)) {
      setErr(`The pace must be between 1 and ${SPEED_MAX - 1} gen/s.`);
      return;
    }
    setSaving(true);
    try {
      const hash = await execute(build(d));
      await waitForTx(hash);
      onSaved(d);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setErr(/reject|abort|denied|cancel/i.test(m) ? "You declined the signature." : m.length > 140 ? m.slice(0, 137) + "…" : m);
    } finally {
      setSaving(false);
    }
  };

  return { apply, saving, err };
}

/** The quiet bar that appears once the previewed look differs from the chain. */
export function LookBar({ dirty, saving, err, onApply, onDiscard }: {
  dirty: boolean;
  saving: boolean;
  err: string | null;
  onApply: () => void;
  onDiscard: () => void;
}) {
  if (!dirty && !err) return null;
  return (
    <div className="look-bar">
      {dirty && (
        <>
          <span className="look-bar-note">a new look, previewed — not yet on-chain</span>
          <button className="btn set-free" onClick={onApply} disabled={saving}>
            {saving ? "the chain is writing…" : "make it permanent"}
          </button>
          <button className="lens-btn" onClick={onDiscard} disabled={saving}>discard</button>
        </>
      )}
      {err && <p className="breathe-err">{err}</p>}
    </div>
  );
}
