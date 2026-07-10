"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GolCanvas from "@/components/GolCanvas";
import { useGolSdk } from "@/lib/sdk";
import { useWallet } from "@/lib/wallet";
import { useMint } from "@/lib/useMint";
import { useGasCaps, plannedTxCount, plannedPathTxCount, MAX_TX } from "@/lib/gasCaps";
import { N, type Cells, fromRows, rowsFromCells } from "@/lib/creatures";
import { addBookmark, listBookmarks } from "@/lib/incubator";

/* ------------------------------------------------------------------ *
 * /create — the "slot machine of life". Two 41×41 grids, a matched
 * pair: draw the seed on the LEFT, watch it come alive on the RIGHT.
 * The right grid steps via the SDK's on-chain stepper (matches the
 * contract exactly); its destiny is read from that live evolution.
 * Kid-first: playful, warm, never punitive.
 * ------------------------------------------------------------------ */

const EMPTY: Cells = new Array(N * N).fill(false);
const CENTER = Math.floor(N / 2);
const WATCH_CAP = 4096; // give up looking for a loop after this many generations

const isEmptyRows = (rows: number[]) => rows.every((r) => r === 0);
const rowsKey = (rows: number[]) => rows.join(",");
const rowsLt = (a: number[], b: number[]) => {
  for (let i = 0; i < N; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
};
const stepRows = (sdk: { stepRows: (r: Float64Array) => unknown }, rows: number[]) =>
  Array.from(sdk.stepRows(new Float64Array(rows)) as ArrayLike<number>);
const hexToInt = (h: string) => parseInt(h.replace("#", ""), 16);

/** Center a small pattern (list of [row,col]) on the grid. */
function place(coords: [number, number][]): Cells {
  const rs = coords.map((c) => c[0]);
  const cs = coords.map((c) => c[1]);
  const or = Math.round((Math.min(...rs) + Math.max(...rs)) / 2);
  const oc = Math.round((Math.min(...cs) + Math.max(...cs)) / 2);
  const cells = EMPTY.slice();
  for (const [r, c] of coords) {
    const rr = CENTER + (r - or);
    const cc = CENTER + (c - oc);
    if (rr >= 0 && rr < N && cc >= 0 && cc < N) cells[rr * N + cc] = true;
  }
  return cells;
}
const PRESETS: { name: string; coords: [number, number][] }[] = [
  { name: "Blinker", coords: [[0, 0], [0, 1], [0, 2]] },
  { name: "Glider", coords: [[0, 1], [1, 2], [2, 0], [2, 1], [2, 2]] },
  { name: "Block", coords: [[0, 0], [0, 1], [1, 0], [1, 1]] },
];

type Fate =
  | { kind: "empty" }
  | { kind: "watching" }
  | { kind: "dead"; steps: number }
  | { kind: "transient" }
  | { kind: "loop"; period: number; steps: number; canonical: number[] };

/* ------- appearance (the owner-defined colours, set at birth) ------- */
const CELL_SWATCHES = ["#22c55e", "#5ad1ff", "#c8ff7a", "#ffb454", "#ff6b6b", "#b98cff", "#ff8fd0", "#f2f2f5"];
const BG_SWATCHES = ["#070709", "#0a0e14", "#0c1416", "#141014", "#0e0a16"];
const SPEEDS = [{ label: "slow", v: 1 }, { label: "medium", v: 2 }, { label: "lively", v: 4 }];

type Free = { kind: "loop" | "path"; tokenId: string; previewCells: Cells; run: (app: { bg: number; cell: number; speed: number }) => void };

export default function CreatePage() {
  const { sdk } = useGolSdk();
  const { address, connect, onSepolia, switchToSepolia } = useWallet();
  const { status, error: mintError, mint, mintPath, reset } = useMint();
  const caps = useGasCaps();
  const router = useRouter();

  const [left, setLeft] = useState<Cells>(EMPTY);        // the drawing (input)
  const [rightRows, setRightRows] = useState<number[]>(() => rowsFromCells(EMPTY)); // the live sim (output)
  const [gen, setGen] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(10);
  const [fate, setFate] = useState<Fate>({ kind: "empty" });

  const [tokenId, setTokenId] = useState<string | null>(null);
  const [already, setAlready] = useState(false);
  const [pathTokenId, setPathTokenId] = useState<string | null>(null);
  const [pathMinted, setPathMinted] = useState(false);

  const [freeing, setFreeing] = useState<Free | null>(null);
  const [cell, setCell] = useState(CELL_SWATCHES[0]);
  const [bgc, setBgc] = useState(BG_SWATCHES[1]);
  const [spd, setSpd] = useState(2);
  const [activeId, setActiveId] = useState<string | null>(null);

  // detection state for the right grid's evolution
  const simRef = useRef<number[]>(rowsFromCells(EMPTY));
  const seenRef = useRef<Map<string, number>>(new Map());
  const historyRef = useRef<number[][]>([]);
  const resolvedRef = useRef(false);

  const leftRows = useMemo(() => rowsFromCells(left), [left]);
  const rightCells = useMemo(() => fromRows(rightRows), [rightRows]);
  const hasDrawing = !isEmptyRows(leftRows);

  const paint = useCallback((i: number, value: boolean) => {
    setLeft((prev) => (prev[i] === value ? prev : prev.map((v, k) => (k === i ? value : v))));
  }, []);

  // opened from the Incubator with a saved pattern (?load=<id>) → drop it onto the left grid
  useEffect(() => {
    if (typeof window === "undefined") return;
    const loadId = new URLSearchParams(window.location.search).get("load");
    if (!loadId) return;
    const bm = listBookmarks().find((b) => b.id === loadId);
    if (bm) setLeft(fromRows(bm.rows));
    window.history.replaceState(null, "", "/create");
  }, []);

  // read the destiny AS the right grid evolves: watch each new generation for a repeat (loop) or
  // an empty grid (goes out). Called once per step, so it's safe from StrictMode double-effects.
  const detect = useCallback((state: number[]) => {
    if (resolvedRef.current) return;
    const idx = historyRef.current.length;
    if (isEmptyRows(state)) { resolvedRef.current = true; setFate({ kind: "dead", steps: idx }); setPlaying(false); return; }
    const key = rowsKey(state);
    const first = seenRef.current.get(key);
    if (first !== undefined && first < idx) {
      const loop = historyRef.current.slice(first);
      let canonical = loop[0] ?? state;
      for (const st of loop) if (rowsLt(st, canonical)) canonical = st;
      resolvedRef.current = true;
      setFate({ kind: "loop", period: idx - first, steps: first, canonical });
      return;
    }
    if (first === undefined) { seenRef.current.set(key, idx); historyRef.current.push(state); }
    if (idx >= WATCH_CAP) { resolvedRef.current = true; setFate({ kind: "transient" }); }
  }, []);

  // the left drawing changed → rewind the right sim to gen 0 (= the seed), restart detection, clear
  // any in-flight mint. The seed itself is recorded as generation 0 so a still-life is caught at once.
  useEffect(() => {
    simRef.current = leftRows;
    setRightRows(leftRows);
    setGen(0);
    seenRef.current = new Map();
    historyRef.current = [];
    resolvedRef.current = false;
    setActiveId(null);
    setFreeing(null);
    reset();
    if (isEmptyRows(leftRows)) {
      setFate({ kind: "empty" });
    } else {
      seenRef.current.set(rowsKey(leftRows), 0);
      historyRef.current.push(leftRows);
      setFate({ kind: "watching" });
    }
  }, [leftRows, reset]);

  // the right grid's evolution — one on-chain generation per tick (matches the contract exactly)
  useEffect(() => {
    if (!sdk || !playing || !hasDrawing) return;
    const id = setInterval(() => {
      const next = stepRows(sdk, simRef.current);
      simRef.current = next;
      setRightRows(next);
      setGen((g) => g + 1);
      detect(next);
    }, Math.max(1000 / speed, 40));
    return () => clearInterval(id);
  }, [sdk, playing, hasDrawing, speed, detect]);

  // the loop it becomes → token id + already-alive check
  useEffect(() => {
    if (!sdk || fate.kind !== "loop") { setTokenId(null); setAlready(false); return; }
    let cancelled = false;
    const id = sdk.familyTokenId(new Float64Array(fate.canonical), fate.period) as string;
    setTokenId(id);
    setAlready(false);
    sdk.lifeform(id).then((lf) => { if (!cancelled && lf) setAlready(true); });
    return () => { cancelled = true; };
  }, [sdk, fate]);

  // the wanderer it is (a transient into a loop, or a dying drawing) → path token id + check
  const pathMintable = (fate.kind === "loop" && fate.steps > 0) || fate.kind === "dead";
  useEffect(() => {
    if (!sdk || !pathMintable) { setPathTokenId(null); setPathMinted(false); return; }
    let cancelled = false;
    const id = sdk.familyTokenId(new Float64Array(leftRows), 0) as string;
    setPathTokenId(id);
    setPathMinted(false);
    sdk.pathLifeform(id).then((p) => { if (!cancelled && p) setPathMinted(true); });
    return () => { cancelled = true; };
  }, [sdk, pathMintable, leftRows]);

  // born → drop into the garden (meet the newborn)
  useEffect(() => {
    if (status === "confirmed" && activeId) {
      const h = setTimeout(() => router.push(`/life/${activeId}`), 1700);
      return () => clearTimeout(h);
    }
  }, [status, activeId, router]);

  const busy = status === "signing" || status === "pending";
  const born = status === "confirmed" && !!activeId;

  const randomize = () => {
    const cells = EMPTY.slice();
    for (let r = 14; r < 27; r++) for (let c = 14; c < 27; c++) if (Math.random() < 0.32) cells[r * N + c] = true;
    setLeft(cells);
    setPlaying(true); // pull the lever → watch it come alive
  };

  const loopTx = fate.kind === "loop" ? plannedTxCount(fate.period, caps) : 0;
  const pathSteps = fate.kind === "loop" ? fate.steps : fate.kind === "dead" ? fate.steps : 0;
  const pathTx = pathMintable ? plannedPathTxCount(pathSteps, fate.kind === "loop" ? fate.period : 1, caps) : 0;

  const openLoop = () => {
    if (fate.kind !== "loop" || !tokenId) return;
    setFreeing({
      kind: "loop",
      tokenId,
      previewCells: fromRows(fate.canonical),
      run: (app) => { setActiveId(tokenId); void mint(fate.canonical, fate.period, app); },
    });
  };
  const openPath = () => {
    if (!pathTokenId || fate.kind === "empty" || fate.kind === "watching" || fate.kind === "transient") return;
    const loopPeriod = fate.kind === "loop" ? fate.period : 1;
    setFreeing({
      kind: "path",
      tokenId: pathTokenId,
      previewCells: left,
      run: (app) => { setActiveId(pathTokenId); void mintPath(leftRows, pathSteps, loopPeriod, app); },
    });
  };

  const sendToIncubator = (id: string, rows: number[], period: number, kind: "loop" | "path", loopPeriod: number) => {
    try { addBookmark({ id, rows, period, kind, loopPeriod, savedAt: Date.now() }); } catch { /* best-effort */ }
    router.push("/incubator");
  };

  const living = fate.kind === "loop";

  return (
    <div className="wrap create">
      <header className="create-lead">
        <span className="eyebrow">Create · the slot machine of life</span>
        <h1 className="create-title">Draw a seed. Watch it come alive.</h1>
        <p className="create-sub">Draw on the left; watch its destiny play out on the right. Some patterns fade. A few find a rhythm and live forever.</p>
      </header>

      <div className="create-stage">
        {/* LEFT — the seed you draw (yours, not yet alive) */}
        <div className="board">
          <div className="board-cap"><span className="board-name">your seed</span><span className="board-hint dim">yours — not yet alive</span></div>
          <div className="create-grid-wrap">
            <GolCanvas cells={left} editable onPaint={paint} cellColor="#9ad1ff" bg="#070709" />
            {!hasDrawing && (
              <div className="create-hint">
                <p>Tap and drag to draw — or</p>
                <button className="btn primary lever" onClick={randomize}>Randomize</button>
              </div>
            )}
          </div>
          <div className="create-tools">
            <button className="btn" onClick={() => setLeft(EMPTY)} disabled={!hasDrawing}>Clear</button>
            <button className="btn" onClick={() => setLeft((l) => l.map((v) => !v))} disabled={!hasDrawing}>Invert</button>
            <button className="btn lever" onClick={randomize}>Randomize</button>
          </div>
          <div className="create-presets">
            <span className="create-tools-label">place</span>
            {PRESETS.map((p) => (
              <button key={p.name} className="chip" onClick={() => setLeft(place(p.coords))}>{p.name}</button>
            ))}
          </div>
        </div>

        {/* RIGHT — its life, stepped on-chain */}
        <div className="board">
          <div className="board-cap"><span className="board-gen mono">generation {gen}</span><span className="board-hint dim">its life, played out</span></div>
          <div className="create-grid-wrap">
            <GolCanvas cells={rightCells} cellColor="#7ef9a0" bg="#070709" />
          </div>
          <div className="create-transport">
            <button className="btn" onClick={() => setPlaying((p) => !p)} disabled={!hasDrawing}>{playing ? "Pause" : "Play"}</button>
            <label className="create-speed">
              speed
              <input type="range" min={2} max={30} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} />
            </label>
          </div>

          {/* verdict — read from the evolution above */}
          <div className={"verdict" + (living ? " lives" : fate.kind === "dead" ? " fades" : "")}>
            {!sdk ? (
              <p className="verdict-line"><span className="spinner" /> waking the petri dish…</p>
            ) : fate.kind === "empty" ? (
              <p className="verdict-line dim">Draw a seed on the left to see its destiny.</p>
            ) : fate.kind === "watching" ? (
              <p className="verdict-line dim">watching it unfold…</p>
            ) : fate.kind === "transient" ? (
              <>
                <p className="verdict-head">Still wandering.</p>
                <p className="verdict-line dim">It hasn’t settled after {WATCH_CAP.toLocaleString()} generations — a restless one. Try a smaller seed.</p>
              </>
            ) : fate.kind === "dead" ? (
              <>
                <p className="verdict-head">It goes out.</p>
                <p className="verdict-line dim">It fades to nothing after {fate.steps} generation{fate.steps === 1 ? "" : "s"} — beautiful while it lasted.</p>
              </>
            ) : (
              <>
                <p className="verdict-head">This one lives.</p>
                <p className="verdict-line">
                  {fate.period === 1
                    ? "It settles into a still life — calm forever."
                    : `It loops forever — a rhythm every ${fate.period} beats.`}
                  {fate.steps > 0 ? ` It gets there after ${fate.steps} generation${fate.steps === 1 ? "" : "s"}.` : ""}
                </p>
              </>
            )}

            <div className="verdict-actions">
              {living && (
                already ? (
                  <Link className="btn primary" href={`/life/${tokenId}`}>This one already lives → meet it</Link>
                ) : !address ? (
                  <button className="btn primary" onClick={connect}>Connect to set it free</button>
                ) : !onSepolia ? (
                  <button className="btn primary" onClick={switchToSepolia}>Switch to Sepolia</button>
                ) : loopTx > MAX_TX ? (
                  <p className="dim">This one’s too big to set free right now (~{loopTx} signatures).</p>
                ) : loopTx > 1 ? (
                  <button className="btn primary" onClick={() => sendToIncubator(tokenId!, fate.canonical, fate.period, "loop", fate.period)}>
                    This one’s big — set it free in the Incubator →
                  </button>
                ) : (
                  <button className="btn primary set-free" onClick={openLoop}>Set it free</button>
                )
              )}

              {pathMintable && !pathMinted && address && onSepolia && pathTokenId && (
                pathTx > MAX_TX ? null : pathTx > 1 ? (
                  <button className="btn ghost" onClick={() => sendToIncubator(pathTokenId, leftRows, pathSteps, "path", fate.kind === "loop" ? fate.period : 1)}>
                    keep the journey as a Wanderer (Incubator) →
                  </button>
                ) : (
                  <button className="btn ghost" onClick={openPath}>keep the journey as a Wanderer</button>
                )
              )}
              {pathMintable && pathMinted && pathTokenId && (
                <Link className="btn ghost" href={`/life/${pathTokenId}`}>this wanderer already lives → meet it</Link>
              )}
            </div>
          </div>

          <p className="create-note">When you set it free, it belongs to whoever keeps it alive.</p>
        </div>
      </div>

      {/* ---- set-free ritual: choose colours, then release ---- */}
      {freeing && !born && (
        <div className="free-modal" role="dialog" aria-modal="true" aria-label="Set it free">
          <div className="free-overlay" onClick={busy ? undefined : () => setFreeing(null)} />
          <div className="free-panel">
            <h2 className="free-title">Set it free</h2>
            <p className="free-sub">Choose how it looks — its colours are yours to pick, and they’re its forever.</p>

            <div className="free-preview">
              <GolCanvas cells={freeing.previewCells} cellColor={cell} bg={bgc} size={300} showGrid={false} />
            </div>

            <div className="free-controls">
              <div className="free-row">
                <span className="free-label">cell</span>
                <div className="swatches">
                  {CELL_SWATCHES.map((c) => (
                    <button key={c} className={"swatch" + (cell === c ? " on" : "")} style={{ background: c }} aria-label={c} onClick={() => setCell(c)} />
                  ))}
                </div>
              </div>
              <div className="free-row">
                <span className="free-label">back</span>
                <div className="swatches">
                  {BG_SWATCHES.map((c) => (
                    <button key={c} className={"swatch" + (bgc === c ? " on" : "")} style={{ background: c }} aria-label={c} onClick={() => setBgc(c)} />
                  ))}
                </div>
              </div>
              <div className="free-row">
                <span className="free-label">pace</span>
                <div className="segmented">
                  {SPEEDS.map((s) => (
                    <button key={s.v} className={"seg" + (spd === s.v ? " on" : "")} onClick={() => setSpd(s.v)}>{s.label}</button>
                  ))}
                </div>
              </div>
            </div>

            {status === "error" && mintError && <p className="breathe-err">{mintError}</p>}

            <div className="free-buttons">
              {!busy && status !== "confirmed" && (
                <button className="btn" onClick={() => setFreeing(null)}>Back</button>
              )}
              <button
                className="btn primary set-free"
                disabled={busy}
                onClick={() => freeing.run({ bg: hexToInt(bgc), cell: hexToInt(cell), speed: spd })}
              >
                {status === "signing" ? "Confirm in your wallet…"
                  : status === "pending" ? "Breathing it to life…"
                  : status === "error" ? "Try again"
                  : "Release it →"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---- it lives: drop into the garden ---- */}
      {born && (
        <div className="free-modal" role="dialog" aria-modal="true" aria-label="It lives">
          <div className="free-overlay" />
          <div className="free-panel born">
            <div className="born-preview drop">
              <GolCanvas cells={freeing?.previewCells ?? rightCells} cellColor={cell} bg={bgc} size={260} showGrid={false} />
            </div>
            <h2 className="free-title lives">It’s alive.</h2>
            <p className="free-sub">Dropping it into the garden…</p>
          </div>
        </div>
      )}
    </div>
  );
}
