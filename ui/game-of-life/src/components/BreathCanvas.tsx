"use client";

import { useEffect, useRef } from "react";
import { N, type Cells, fromRows, step } from "@/lib/creatures";

// The single-creature stage. Renders a creature in ITS OWN on-chain colours (bg/cell) — never
// restyled — and can: autoplay its cycle at the on-chain speed, hold a scrubbed generation, and
// play the "breath" — exactly one Conway generation revealed with a soft ripple from the centre.
// One rAF per instance; all changing props are read through refs so the loop never re-subscribes.

const intToCss = (n: number) => "#" + (n & 0xffffff).toString(16).padStart(6, "0");
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

const GATHER = 0.34; // fraction of the breath spent drawing in before the ripple
const CENTER = (N - 1) / 2;
const MAXDIST = Math.hypot(CENTER, CENTER);
const RING = 7; // ripple front width, in cells

function stepN(cells: Cells, k: number): Cells {
  let c = cells;
  for (let i = 0; i < k; i++) c = step(c);
  return c;
}

export interface BreathCanvasProps {
  rows: number[];
  bg: number;
  cell: number;
  speed: number;
  playing: boolean;
  scrubGen: number | null; // null = live/autoplay; number = hold that generation
  breathSignal: number; // increment to play a breath
  breathDepth?: number; // generations a breath advances (a deeper breath = a longer, faster exhale)
  onBreathDone?: () => void;
  res?: number;
}

export default function BreathCanvas(props: BreathCanvasProps) {
  const { res = 560 } = props;
  const ref = useRef<HTMLCanvasElement>(null);

  // live prop mirrors for the rAF loop
  const bgRef = useRef(props.bg);
  const cellRef = useRef(props.cell);
  const speedRef = useRef(props.speed);
  const playingRef = useRef(props.playing);
  const scrubRef = useRef(props.scrubGen);
  const breathRef = useRef(props.breathSignal);
  const depthRef = useRef(props.breathDepth ?? 1);
  const doneRef = useRef(props.onBreathDone);
  bgRef.current = props.bg;
  cellRef.current = props.cell;
  speedRef.current = props.speed;
  playingRef.current = props.playing;
  scrubRef.current = props.scrubGen;
  depthRef.current = props.breathDepth ?? 1;
  doneRef.current = props.onBreathDone;

  const baseRef = useRef<Cells>(fromRows(props.rows)); // the current on-chain state
  const displayRef = useRef<Cells>(baseRef.current); // what's shown (autoplay advances this)
  const scrubCellsRef = useRef<Cells>(baseRef.current);
  const animRef = useRef<{ start: number; from: Cells; to: Cells; dur: number } | null>(null);
  const reelRef = useRef<{ remaining: number; perGen: number } | null>(null);
  const lastStepRef = useRef(0);
  const lastBreathRef = useRef(props.breathSignal);

  // when the on-chain state changes (refetch after a breath), reset the base + display (unless mid-breath)
  const rowsKey = props.rows.join(",");
  useEffect(() => {
    baseRef.current = fromRows(props.rows);
    scrubCellsRef.current = scrubRef.current != null ? stepN(baseRef.current, scrubRef.current) : baseRef.current;
    if (!animRef.current) displayRef.current = baseRef.current.slice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowsKey]);

  // recompute the scrubbed frame when the scrubber moves
  useEffect(() => {
    scrubCellsRef.current = props.scrubGen != null ? stepN(baseRef.current, props.scrubGen) : baseRef.current;
  }, [props.scrubGen, rowsKey]);

  // the breath signal is read in the loop
  useEffect(() => { breathRef.current = props.breathSignal; }, [props.breathSignal]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width;
    const px = W / N;

    const reduced =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const drawCell = (r: number, c: number, scale: number, alpha: number, glow: number, css: string) => {
      const pad = px * 0.12;
      const s = (px - 2 * pad) * scale;
      const cx = c * px + px / 2;
      const cy = r * px + px / 2;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = css;
      ctx.shadowColor = css;
      ctx.shadowBlur = glow;
      const rad = Math.min(s * 0.28, px * 0.25);
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(cx - s / 2, cy - s / 2, s, s, rad);
      else ctx.rect(cx - s / 2, cy - s / 2, s, s);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    };

    const clear = () => {
      ctx.fillStyle = intToCss(bgRef.current);
      ctx.fillRect(0, 0, W, W);
    };

    const drawStatic = (cells: Cells, scale = 1, alpha = 1, glowScale = 1) => {
      clear();
      const css = intToCss(cellRef.current);
      const glow = px * 0.22 * glowScale;
      for (let r = 0; r < N; r++)
        for (let c = 0; c < N; c++)
          if (cells[r * N + c]) drawCell(r, c, scale, alpha, glow, css);
    };

    const drawBreath = (from: Cells, to: Cells, p: number) => {
      const css = intToCss(cellRef.current);
      if (p < GATHER) {
        // draw breath in: the living cells shrink and dim slightly toward the pattern
        const t = easeInOut(p / GATHER);
        drawStatic(from, 1 - 0.16 * t, 1 - 0.38 * t, 1 + 0.4 * t);
      } else {
        // exhale: the next generation blooms outward in a ripple from the centre
        const t = easeOut((p - GATHER) / (1 - GATHER));
        clear();
        const front = t * (MAXDIST + RING);
        for (let r = 0; r < N; r++) {
          for (let c = 0; c < N; c++) {
            if (!to[r * N + c]) continue;
            const dist = Math.hypot(r - CENTER, c - CENTER);
            const reveal = Math.max(0, Math.min(1, (front - dist) / RING));
            if (reveal <= 0) continue;
            drawCell(r, c, 0.45 + 0.55 * reveal, reveal, px * (0.22 + 0.5 * (1 - reveal)), css);
          }
        }
        // the ripple front, a faint expanding breath
        if (t < 1) {
          ctx.globalAlpha = 0.22 * (1 - t);
          ctx.strokeStyle = css;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(W / 2, W / 2, front * px, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
    };

    let raf = 0;
    const loop = (now: number) => {
      // start a breath (of `depth` generations — a deeper breath is a longer, faster fast-forward)?
      if (breathRef.current !== lastBreathRef.current) {
        lastBreathRef.current = breathRef.current;
        const depth = Math.max(1, Math.round(depthRef.current));
        if (reduced) {
          displayRef.current = stepN(displayRef.current, depth);
          reelRef.current = null;
          animRef.current = null;
          doneRef.current?.();
        } else {
          // ~250ms per generation (a fuller single breath at ×1); deep breaths reel faster so the
          // whole exhale stays under ~6s.
          const perGen = depth === 1 ? 900 : Math.max(60, Math.min(250, 6000 / depth));
          reelRef.current = { remaining: depth, perGen };
          const from = displayRef.current.slice();
          animRef.current = { start: now, from, to: step(from), dur: perGen };
        }
      }

      if (animRef.current) {
        const a = animRef.current;
        const p = (now - a.start) / a.dur;
        if (p >= 1) {
          displayRef.current = a.to;
          const reel = reelRef.current;
          if (reel && reel.remaining > 1) {
            reel.remaining -= 1; // keep exhaling the next generation
            const from = displayRef.current.slice();
            animRef.current = { start: now, from, to: step(from), dur: reel.perGen };
          } else {
            reelRef.current = null;
            animRef.current = null;
            drawStatic(displayRef.current);
            doneRef.current?.();
          }
        } else {
          drawBreath(a.from, a.to, p);
        }
      } else if (scrubRef.current != null) {
        drawStatic(scrubCellsRef.current);
      } else {
        if (!reduced && playingRef.current) {
          const interval = 1000 / Math.max(1, Math.min(60, speedRef.current));
          if (now - lastStepRef.current >= interval) {
            displayRef.current = step(displayRef.current);
            lastStepRef.current = now;
          }
        }
        drawStatic(displayRef.current);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={ref}
      width={res}
      height={res}
      role="img"
      aria-label="Creature render"
      style={{ display: "block", width: "100%", height: "100%" }}
    />
  );
}
