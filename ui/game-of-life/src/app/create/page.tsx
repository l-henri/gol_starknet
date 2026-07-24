"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GolCanvas from "@/components/GolCanvas";
import { useGolSdk } from "@/lib/sdk";
import { useWallet } from "@/lib/wallet";
import { useMint } from "@/lib/useMint";
import { useNutBalance } from "@/lib/useNut";
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

/** A creature's look is no longer chosen in a modal — it's rolled from the palettes at set-free time. */
const pickRandom = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

export default function CreatePage() {
  const { sdk } = useGolSdk();
  const { address, connect, onSepolia, switchToSepolia } = useWallet();
  const { status, error: mintError, mint, mintPath, reset, stalled, continueMint } = useMint();
  const nut = useNutBalance();
  const caps = useGasCaps();
  const router = useRouter();

  const [left, setLeft] = useState<Cells>(EMPTY);        // the drawing (input)
  const [rightRows, setRightRows] = useState<number[]>(() => rowsFromCells(EMPTY)); // the live sim (output)
  const [gen, setGen] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(15);
  const [fate, setFate] = useState<Fate>({ kind: "empty" });

  const [tokenId, setTokenId] = useState<string | null>(null);
  const [already, setAlready] = useState(false);
  const [pathTokenId, setPathTokenId] = useState<string | null>(null);
  const [pathMinted, setPathMinted] = useState(false);

  const [bornPreview, setBornPreview] = useState<Cells>(EMPTY); // what the "it's alive" drop shows
  const [cell, setCell] = useState(CELL_SWATCHES[0]);           // the rolled cell colour (for that drop)
  const [bgc, setBgc] = useState(BG_SWATCHES[1]);               // the rolled background
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

  // opened with a pattern to drop onto the left grid: either raw row bitmasks (?rows=a,b,c… — e.g.
  // a wanderer handing over the loop it's bound for) or a saved Incubator bookmark (?load=<id>).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const rowsParam = params.get("rows");
    if (rowsParam) {
      const rows = rowsParam.split(",").map((n) => Number(n));
      if (rows.length === N && rows.every((n) => Number.isFinite(n) && n >= 0)) setLeft(fromRows(rows));
      window.history.replaceState(null, "", "/create");
      return;
    }
    const loadId = params.get("load");
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
    reset();
    if (isEmptyRows(leftRows)) {
      setFate({ kind: "empty" });
    } else {
      seenRef.current.set(rowsKey(leftRows), 0);
      historyRef.current.push(leftRows);
      setPlaying(true); // any click on the seed plays the right grid immediately (even after one died)
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
      if (!resolvedRef.current) setGen((g) => g + 1); // freeze the counter once it settles/dies
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

  // A birth costs its creature's generations in NUT — exact on-chain: a loop costs its period, a
  // wanderer costs its sequence_length (verified against the mint plan's `approve` amount).
  const loopCost = fate.kind === "loop" ? fate.period : 0;
  const nutShort = nut !== null && loopCost > 0 && nut < loopCost;
  const loopTx = fate.kind === "loop" ? plannedTxCount(fate.period, caps) : 0;
  const pathSteps = fate.kind === "loop" ? fate.steps : fate.kind === "dead" ? fate.steps : 0;
  const pathTx = pathMintable ? plannedPathTxCount(pathSteps, fate.kind === "loop" ? fate.period : 1, caps) : 0;
  const nutShortPath = nut !== null && pathSteps > 0 && nut < pathSteps;

  // roll a random look (cell/bg/speed) and set it free straight away — no modal.
  const rollLook = () => {
    const cellHex = pickRandom(CELL_SWATCHES);
    const bgHex = pickRandom(BG_SWATCHES);
    setCell(cellHex);
    setBgc(bgHex);
    return { bg: hexToInt(bgHex), cell: hexToInt(cellHex), speed: pickRandom(SPEEDS).v };
  };
  const bookmark = (id: string, rows: number[], period: number, kind: "loop" | "path", loopPeriod: number) => {
    try { addBookmark({ id, rows, period, kind, loopPeriod, owner: address ?? undefined, savedAt: Date.now() }); } catch { /* best-effort */ }
  };

  const openLoop = () => {
    if (fate.kind !== "loop" || !tokenId) return;
    // A loop with a transient also yields a wanderer. Hatching the loop redirects away, so keep the
    // wanderer in the incubator (if it's mintable and not already on-chain) instead of losing it.
    if (pathMintable && pathTokenId && !pathMinted) bookmark(pathTokenId, leftRows, pathSteps, "path", fate.period);
    setBornPreview(fromRows(fate.canonical));
    setActiveId(tokenId);
    void mint(fate.canonical, fate.period, rollLook());
  };
  const openPath = () => {
    if (!pathTokenId || fate.kind === "empty" || fate.kind === "watching" || fate.kind === "transient") return;
    const loopPeriod = fate.kind === "loop" ? fate.period : 1;
    // Hatching the wanderer redirects away — keep its terminal loop in the incubator (if it exists
    // as a mintable creature and isn't already on-chain) instead of losing it.
    if (fate.kind === "loop" && tokenId && !already) bookmark(tokenId, fate.canonical, fate.period, "loop", fate.period);
    setBornPreview(left);
    setActiveId(pathTokenId);
    void mintPath(leftRows, pathSteps, loopPeriod, rollLook());
  };

  const sendToIncubator = (id: string, rows: number[], period: number, kind: "loop" | "path", loopPeriod: number) => {
    bookmark(id, rows, period, kind, loopPeriod);
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
          <div className="board-cap">
            <span className="board-gen mono">
              {fate.kind === "loop"
                ? `${fate.steps > 0 ? `wandered ${fate.steps} · ` : ""}${fate.period === 1 ? "still life" : `loops every ${fate.period}`}`
                : fate.kind === "dead"
                ? `gone at gen ${fate.steps}`
                : `generation ${gen}`}
            </span>
            <span className="board-hint dim">its life, played out</span>
          </div>
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
              {busy ? (
                <>
                  <p className="verdict-line"><span className="spinner" /> {status === "signing" ? "Confirm in your wallet…" : "Breathing it to life…"}</p>
                  {stalled && <button className="btn primary" onClick={continueMint}>The wallet didn’t open — knock again</button>}
                </>
              ) : status === "error" ? (
                <>
                  <button className="btn primary" onClick={reset}>Try again</button>
                  {mintError && <p className="breathe-err">{mintError}</p>}
                </>
              ) : (
                <>
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
                      <>
                        <p className="nut-cost mono">This birth costs {loopCost} NUT · you have {nut ?? 0}</p>
                        <button className="btn primary set-free" onClick={openLoop} disabled={nutShort}>Set it free</button>
                        {nutShort && (
                          <p className="nut-note">Not enough NUT yet — breathing life into creatures grows your supply. <Link href="/" className="tx-link">find one that needs a breath →</Link></p>
                        )}
                      </>
                    )
                  )}

                  {pathMintable && !pathMinted && address && onSepolia && pathTokenId && (
                    pathTx > MAX_TX ? null : pathTx > 1 ? (
                      <button className="btn ghost" onClick={() => sendToIncubator(pathTokenId, leftRows, pathSteps, "path", fate.kind === "loop" ? fate.period : 1)}>
                        keep the journey as a Wanderer (Incubator) →
                      </button>
                    ) : (
                      <div className="path-free">
                        <p className="nut-cost mono">the journey costs {pathSteps} NUT · you have {nut ?? 0}</p>
                        <button className="btn ghost" onClick={openPath} disabled={nutShortPath}>keep the journey as a Wanderer</button>
                        {nutShortPath && (
                          <p className="nut-note">Not enough NUT yet — breathing life into creatures grows your supply. <Link href="/" className="tx-link">find one that needs a breath →</Link></p>
                        )}
                      </div>
                    )
                  )}
                  {pathMintable && pathMinted && pathTokenId && (
                    <Link className="btn ghost" href={`/life/${pathTokenId}`}>this wanderer already lives → meet it</Link>
                  )}
                </>
              )}
            </div>
          </div>

          <p className="create-note">When you set it free, it belongs to whoever keeps it alive.</p>
        </div>
      </div>

      {/* ---- it lives: drop into the garden (colours were rolled at set-free) ---- */}
      {born && (
        <div className="free-modal" role="dialog" aria-modal="true" aria-label="It lives">
          <div className="free-overlay" />
          <div className="free-panel born">
            <div className="born-preview drop">
              <GolCanvas cells={bornPreview} cellColor={cell} bg={bgc} size={260} showGrid={false} />
            </div>
            <h2 className="free-title lives">It’s alive.</h2>
            <p className="free-sub">Dropping it into the garden…</p>
          </div>
        </div>
      )}
    </div>
  );
}
