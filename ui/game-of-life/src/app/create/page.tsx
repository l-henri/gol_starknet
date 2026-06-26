"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import GolCanvas from "@/components/GolCanvas";
import { useGolSdk } from "@/lib/sdk";
import { useWallet } from "@/lib/wallet";
import { useMint } from "@/lib/useMint";
import { N, type Cells, fromRows, rowsFromCells } from "@/lib/creatures";
import { shortAddr } from "@/lib/format";
import { explorerTxUrl } from "@/lib/config";

const EMPTY: Cells = new Array(N * N).fill(false);
const isEmpty = (rows: number[]) => rows.every((r) => r === 0);
const rowsKey = (rows: number[]) => rows.join(",");
const rowsLt = (a: number[], b: number[]) => {
  for (let i = 0; i < N; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
};
const step = (sdk: { stepRows: (r: Float64Array) => unknown }, rows: number[]) =>
  Array.from(sdk.stepRows(new Float64Array(rows)) as ArrayLike<number>);

type Fate =
  | { kind: "empty" }
  | { kind: "computing" }
  | { kind: "dead"; steps: number }
  | { kind: "transient" }
  | { kind: "loop"; period: number; steps: number; canonical: number[] };

export default function CreatePage() {
  const { sdk } = useGolSdk();
  const { address, connect, onSepolia, switchToSepolia } = useWallet();
  const { status, txHash, error: mintError, mint, reset } = useMint();
  const router = useRouter();

  const [left, setLeft] = useState<Cells>(EMPTY);
  const [rightRows, setRightRows] = useState<number[]>(() => rowsFromCells(EMPTY));
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(15);
  const [gen, setGen] = useState(0);
  const [fate, setFate] = useState<Fate>({ kind: "empty" });
  const [tokenId, setTokenId] = useState<string | null>(null);
  const [alreadyMinted, setAlreadyMinted] = useState(false);

  const paint = useCallback((i: number, value: boolean) => {
    setLeft((prev) => (prev[i] === value ? prev : prev.map((v, k) => (k === i ? value : v))));
  }, []);

  const leftRows = useMemo(() => rowsFromCells(left), [left]);
  // the right sim only runs once there's a drawing — so it stays idle on page load and after Clear,
  // and only begins after the first left-grid interaction.
  const hasDrawing = useMemo(() => !isEmpty(leftRows), [leftRows]);

  // restart the live sim whenever the drawing changes
  useEffect(() => {
    setRightRows(leftRows);
    setGen(0);
    reset();
  }, [leftRows, reset]);

  // live evolution — the SDK's on-chain stepper, so it matches the contract exactly
  useEffect(() => {
    if (!sdk || !playing || !hasDrawing) return;
    const id = setInterval(() => {
      setRightRows((prev) => step(sdk, prev));
      setGen((g) => g + 1);
    }, Math.max(1000 / speed, 16));
    return () => clearInterval(id);
  }, [sdk, playing, speed, hasDrawing]);

  // fate (debounced): step until the drawing settles into a loop or dies, to find the mintable loop
  useEffect(() => {
    if (!sdk) return;
    if (isEmpty(leftRows)) {
      setFate({ kind: "empty" });
      return;
    }
    setFate({ kind: "computing" });
    const t = setTimeout(() => {
      let cur = leftRows;
      const seen = new Map<string, number>();
      const history: number[][] = [];
      // a 41×41 torus is finite so it must eventually cycle; search far enough to catch patterns
      // that wander for thousands of generations before settling into their loop.
      const CAP = 10000;
      let result: Fate = { kind: "transient" };
      for (let s = 0; s < CAP; s++) {
        if (isEmpty(cur)) {
          result = { kind: "dead", steps: s };
          break;
        }
        const key = rowsKey(cur);
        const first = seen.get(key);
        if (first !== undefined) {
          const loop = history.slice(first);
          let canonical = loop[0];
          for (const st of loop) if (rowsLt(st, canonical)) canonical = st;
          result = { kind: "loop", period: history.length - first, steps: first, canonical };
          break;
        }
        seen.set(key, s);
        history.push(cur);
        cur = step(sdk, cur);
      }
      setFate(result);
    }, 250);
    return () => clearTimeout(t);
  }, [leftRows, sdk]);

  // token id + already-minted check, once the drawing settles into a loop
  useEffect(() => {
    if (!sdk || fate.kind !== "loop") {
      setTokenId(null);
      setAlreadyMinted(false);
      return;
    }
    let cancelled = false;
    const id = sdk.tokenIdForRows(new Float64Array(fate.canonical)) as string;
    setTokenId(id);
    setAlreadyMinted(false);
    sdk.lifeform(id).then((lf) => {
      if (!cancelled && lf) setAlreadyMinted(true);
    });
    return () => {
      cancelled = true;
    };
  }, [sdk, fate]);

  // on a confirmed mint, send them to their newborn creature
  useEffect(() => {
    if (status === "confirmed" && tokenId) {
      const t = setTimeout(() => router.push(`/life/${tokenId}`), 1200);
      return () => clearTimeout(t);
    }
  }, [status, tokenId, router]);

  const rightCells = useMemo(() => fromRows(rightRows), [rightRows]);
  const busy = status === "signing" || status === "pending";
  const loop = fate.kind === "loop" ? fate : null;

  // Once the right grid enters its loop (or dies), freeze the generation count and show the
  // position within the loop instead — the grid keeps cycling, the indicator tracks where it is.
  const rightLabel =
    loop && gen >= loop.steps
      ? `gen ${loop.steps} · loop step ${((gen - loop.steps) % loop.period) + 1}/${loop.period}`
      : fate.kind === "dead" && gen >= fate.steps
        ? `died after ${fate.steps} gen`
        : `gen ${gen}`;

  return (
    <div className="wrap">
      <div className="head">
        <div className="section-label">Create</div>
        <Link href="/" className="note">← the garden</Link>
      </div>
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start", margin: "18px 0" }}>
        <div style={{ flex: "1 1 360px", maxWidth: 540 }}>
          <div className="note" style={{ marginBottom: 6 }}>your drawing</div>
          <GolCanvas cells={left} editable onPaint={paint} cellColor="#9ad1ff" />
        </div>
        <div style={{ flex: "1 1 360px", maxWidth: 540 }}>
          <div className="note" style={{ marginBottom: 6 }}>{rightLabel}</div>
          <GolCanvas cells={rightCells} cellColor="#7ef9a0" />
        </div>
      </div>

      <div className="toggle-row" style={{ alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <button className="btn" onClick={() => setLeft(EMPTY)}>Clear</button>
        <button className="btn" onClick={() => setPlaying((p) => !p)}>{playing ? "Pause" : "Play"}</button>
        <label className="note" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          speed
          <input type="range" min={1} max={30} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} />
          {speed}/s
        </label>
      </div>

      <div className="callout" style={{ marginTop: 16 }}>
        {!sdk ? (
          <span><span className="spinner" /> warming up the engine…</span>
        ) : fate.kind === "empty" ? (
          <span>Draw something on the left to begin.</span>
        ) : fate.kind === "computing" ? (
          <span><span className="spinner" /> tracing its fate…</span>
        ) : fate.kind === "dead" ? (
          <span>Dies out after {fate.steps} generations — nothing to spawn. Try another pattern.</span>
        ) : fate.kind === "transient" ? (
          <span>Still evolving after 10,000 generations — no loop found yet.</span>
        ) : loop ? (
          <div>
            <div>
              Settles into a <b>period-{loop.period}</b> {loop.period === 1 ? "still life" : "loop"}
              {loop.steps > 0 ? ` after ${loop.steps} generations` : " right away"} — a creature you can spawn.
              {tokenId && <> · <span className="mono">{shortAddr(tokenId)}</span></>}
            </div>
            <div style={{ marginTop: 12 }}>
              {alreadyMinted ? (
                <Link className="btn primary" href={`/life/${tokenId}`}>Already discovered → meet it</Link>
              ) : !address ? (
                <button className="btn" onClick={connect}>Connect to spawn</button>
              ) : !onSepolia ? (
                <button className="btn primary" onClick={switchToSepolia}>Switch to Sepolia to spawn</button>
              ) : (
                <button className="btn primary breathe-btn" onClick={() => (status === "error" ? reset() : mint(loop.canonical, loop.period))} disabled={busy}>
                  {status === "signing"
                    ? "Confirm in your wallet…"
                    : status === "pending"
                      ? "Spawning… (tx pending)"
                      : status === "confirmed"
                        ? "✓ Spawned — taking you there…"
                        : status === "error"
                          ? "Try again"
                          : `Spawn · ${loop.period} NUT`}
                </button>
              )}
              {txHash && (status === "pending" || status === "confirmed") && (
                <a className="tx-link" href={explorerTxUrl(txHash)} target="_blank" rel="noreferrer" style={{ marginLeft: 12 }}>view tx ↗</a>
              )}
              {status === "error" && mintError && <p className="breathe-err">{mintError}</p>}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
