"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Creature from "@/components/Creature";
import { useGolSdk } from "@/lib/sdk";
import { shortAddr } from "@/lib/format";
import type { JsLifeform } from "@/lib/types";

/* ------------------------------------------------------------------ *
 * /leaderboards (Records) — the garden's discovery census & hall of
 * fame. Celebratory and communal, never a competition for money.
 * Three toggleable boards; all values from chain. No medals, no money.
 * ------------------------------------------------------------------ */

const TOP = 25;
type RP = { bg: number; cell: number; speed: number };
type Board = "lived" | "methuselah" | "caretakers";
const BOARDS: { key: Board; label: string; desc: string }[] = [
  { key: "lived", label: "Oldest loops", desc: "Creatures by the generations they’ve lived." },
  { key: "methuselah", label: "Oldest wanderers", desc: "The longest journeys before settling, the census the cellular-automata world has always loved." },
  { key: "caretakers", label: "Most devoted", desc: "Breaths given to keep the garden’s creatures alive." },
];

type PathLite = { token_id: string; sequence_length: number; start_state: number[] };
type Breather = { address: string; generations: number };
const deriveName = (lf: JsLifeform) => (lf.is_still ? "Still Life" : lf.is_loop ? `Period-${lf.sequence_length} Loop` : "Lifeform");

/* a tiny live thumbnail in the creature's own on-chain colours */
function RecordThumb({ tokenId, rows, kind, big }: { tokenId: string; rows: number[]; kind: "loop" | "path"; big?: boolean }) {
  const { sdk } = useGolSdk();
  const [rp, setRp] = useState<RP | null>(null);
  useEffect(() => {
    if (!sdk) return;
    let c = false;
    const call = kind === "path" ? sdk.pathRenderParams(tokenId) : sdk.renderParams(tokenId);
    call.then((p) => { if (!c && p) setRp(p as RP); });
    return () => { c = true; };
  }, [sdk, tokenId, kind]);
  return (
    <span className={"record-thumb" + (big ? " big" : "")}>
      <Creature rows={rows} bg={rp?.bg} cell={rp?.cell} speed={rp?.speed} res={140} animate={!!big} ariaLabel="creature" />
    </span>
  );
}

export default function RecordsPage() {
  const { sdk, error: sdkError } = useGolSdk();
  const [board, setBoard] = useState<Board>("lived");

  const [loops, setLoops] = useState<JsLifeform[] | null>(null);
  const [paths, setPaths] = useState<PathLite[] | null>(null);
  const [breathers, setBreathers] = useState<Breather[] | null>(null);

  useEffect(() => {
    if (!sdk) return;
    let cancelled = false;
    const guard = <T,>(set: (v: T) => void) => (v: T) => { if (!cancelled) set(v); };
    sdk.recentLifeforms(0).then(guard(setLoops)).catch(() => guard(setLoops)([]));
    sdk.recentPathTokenIds(0)
      .then(async (ids: string[]) => {
        const hydrated = await Promise.all(ids.map((id) => sdk.pathLifeform(id).catch(() => null)));
        guard(setPaths)(hydrated.filter(Boolean) as PathLite[]);
      })
      .catch(() => guard(setPaths)([]));
    sdk.topBreathers().then(guard(setBreathers)).catch(() => guard(setBreathers)([]));
    return () => { cancelled = true; };
  }, [sdk]);

  const lived = useMemo(() => (loops ?? []).slice().sort((a, b) => b.age - a.age).slice(0, TOP), [loops]);
  const methuselahs = useMemo(() => (paths ?? []).slice().sort((a, b) => b.sequence_length - a.sequence_length).slice(0, TOP), [paths]);
  const caretakers = useMemo(() => (breathers ?? []).slice().sort((a, b) => b.generations - a.generations).slice(0, TOP), [breathers]);

  const ready = board === "lived" ? loops !== null : board === "methuselah" ? paths !== null : breathers !== null;
  const rows = board === "lived" ? lived : board === "methuselah" ? methuselahs : caretakers;
  const desc = BOARDS.find((b) => b.key === board)!.desc;

  return (
    <div className="wrap records">
      <header className="records-lead">
        <span className="eyebrow">Records</span>
        <h1 className="records-title">The garden’s census.</h1>
        <p className="records-sub">A quiet hall of fame: the longest lives, the farthest journeys, the most devoted hands. Every number is earned on-chain. Nothing here is bought.</p>
      </header>

      <div className="records-toggle" role="group" aria-label="Choose a board">
        {BOARDS.map((b) => (
          <button key={b.key} type="button" className={"rec-tab" + (board === b.key ? " on" : "")} aria-pressed={board === b.key} onClick={() => setBoard(b.key)}>
            {b.label}
          </button>
        ))}
      </div>
      <p className="records-desc">{desc}</p>

      <div className="records-panel">
        {!ready && !sdkError && <p className="records-empty"><span className="spinner" /> scanning the chain…</p>}
        {sdkError && <p className="records-empty">the petri dish is offline: {sdkError}</p>}
        {ready && rows.length === 0 && <p className="records-empty">Nobody yet. Be the first.</p>}

        {board === "lived" && lived.map((lf, i) => (
          <Link key={lf.token_id} href={`/life/${lf.token_id}`} className={"record-row" + (i === 0 ? " top1" : "")}>
            <span className="record-rank">{i + 1}</span>
            <RecordThumb tokenId={lf.token_id} rows={lf.current_state} kind="loop" big={i === 0} />
            <span className="record-who"><span className="record-name">{deriveName(lf)}</span> <span className="record-id">{shortAddr(lf.token_id)}</span></span>
            <span className="record-metric">{lf.age.toLocaleString("en-US")} <span className="record-unit">gen</span></span>
          </Link>
        ))}

        {board === "methuselah" && methuselahs.map((p, i) => (
          <Link key={p.token_id} href={`/life/${p.token_id}`} className={"record-row" + (i === 0 ? " top1" : "")}>
            <span className="record-rank">{i + 1}</span>
            <RecordThumb tokenId={p.token_id} rows={p.start_state} kind="path" big={i === 0} />
            <span className="record-who"><span className="record-name">Wanderer</span> <span className="record-id">{shortAddr(p.token_id)}</span></span>
            <span className="record-metric">{p.sequence_length.toLocaleString("en-US")} <span className="record-unit">gen</span></span>
          </Link>
        ))}

        {board === "caretakers" && caretakers.map((c, i) => (
          <div key={c.address} className={"record-row" + (i === 0 ? " top1" : "")}>
            <span className="record-rank">{i + 1}</span>
            <span className="record-who"><span className="record-name mono">{shortAddr(c.address)}</span></span>
            <span className="record-metric">{c.generations.toLocaleString("en-US")} <span className="record-unit">breaths</span></span>
          </div>
        ))}
      </div>
    </div>
  );
}
