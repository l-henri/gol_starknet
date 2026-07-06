"use client";

import { useEffect, useRef } from "react";
import {
  type Cells,
  type RGB,
  ageColor,
  BREATH,
  fromCoords,
  fromRows,
  N,
  step,
  STEP_AMBIENT,
} from "@/lib/creatures";

type Variant = "living" | "potential" | "dead";

interface Inst {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  cells: Cells;
  rgb: RGB;
  bgCss: string;
  variant: Variant;
  animate: boolean;
  interval: number;
  lastStep: number;
  phase: number;
  visible: boolean;
}

// ---- shared render bus: one rAF drives every creature on the page ----
const POTENTIAL: RGB = [90, 209, 255]; // accent blue — a latent, not-yet-born glow
const DEAD: RGB = [58, 65, 80];

// 0xRRGGBB -> rgb / css (for a token's on-chain RenderParams)
const intToRgb = (n: number): RGB => [(n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const intToCss = (n: number): string => "#" + (n & 0xffffff).toString(16).padStart(6, "0");

const insts = new Set<Inst>();
let running = false;
let reduced = false;

if (typeof window !== "undefined") {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  reduced = mq.matches;
  mq.addEventListener?.("change", (e) => (reduced = e.matches));
}

function draw(inst: Inst, now: number) {
  const { ctx, canvas } = inst;
  const W = canvas.width;
  const cell = W / N;
  ctx.clearRect(0, 0, W, W);
  ctx.fillStyle = inst.bgCss;
  ctx.fillRect(0, 0, W, W);

  const [r, g, b] = inst.rgb;
  let glow: number;
  let alpha: number;
  if (inst.variant === "dead") {
    glow = 0;
    alpha = 0.42;
  } else if (reduced || !inst.animate) {
    glow = cell * 0.26;
    alpha = inst.variant === "potential" ? 0.72 : 1;
  } else {
    const ph = (now / BREATH) * Math.PI * 2 + inst.phase;
    const f = 0.5 + 0.5 * Math.sin(ph);
    glow = cell * 0.2 + cell * (inst.variant === "potential" ? 0.3 : 0.42) * f;
    alpha = (inst.variant === "potential" ? 0.6 : 0.85) + 0.15 * f;
  }

  ctx.shadowColor = inst.variant === "dead" ? "rgba(0,0,0,0)" : `rgba(${r},${g},${b},0.85)`;
  ctx.shadowBlur = glow;
  ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
  const pad = cell * 0.13;
  const rad = cell * 0.22;
  for (let i = 0; i < N * N; i++) {
    if (!inst.cells[i]) continue;
    const row = Math.floor(i / N);
    const col = i % N;
    const x = col * cell + pad;
    const y = row * cell + pad;
    const s = cell - 2 * pad;
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(x, y, s, s, rad);
    } else {
      ctx.beginPath();
      ctx.rect(x, y, s, s);
    }
    ctx.fill();
  }
  ctx.shadowBlur = 0;
}

function tick(now: number) {
  for (const inst of insts) {
    if (!inst.visible) continue;
    if (!reduced && inst.animate && inst.variant !== "dead") {
      if (now - inst.lastStep >= inst.interval) {
        inst.cells = step(inst.cells);
        inst.lastStep = now;
      }
    }
    draw(inst, now);
  }
  if (insts.size > 0) {
    requestAnimationFrame(tick);
  } else {
    running = false;
  }
}

function ensureRunning() {
  if (!running) {
    running = true;
    requestAnimationFrame(tick);
  }
}

function initialCells(props: CreatureProps): Cells {
  if (props.cells) return props.cells.slice();
  if (props.rows) return fromRows(props.rows);
  if (props.coords) return fromCoords(props.coords);
  return new Array<boolean>(N * N).fill(false);
}

export interface CreatureProps {
  /** one of: explicit cells, a v2 lifeform's row bitmasks, or live-cell coordinates */
  cells?: Cells;
  rows?: number[];
  coords?: [number, number][];
  /** colour age 0..100 (living variant only; ignored when `cell` is given) */
  age?: number;
  /** on-chain RenderParams: bg/cell are 0xRRGGBB, speed is generations/second */
  bg?: number;
  cell?: number;
  speed?: number;
  variant?: Variant;
  /** deprecated/ignored: hover no longer changes speed — a creature always runs at its own cadence */
  engaged?: boolean;
  /** false = hold current state, no stepping */
  animate?: boolean;
  /** internal canvas resolution (px, square) */
  res?: number;
  className?: string;
  ariaLabel?: string;
}

export default function Creature(props: CreatureProps) {
  const { age = 0, variant = "living", animate = true, res = 360 } = props;
  const ref = useRef<HTMLCanvasElement>(null);
  const instRef = useRef<Inst | null>(null);
  // re-seed when the pattern identity changes
  const seedKey = props.rows ? props.rows.join(",") : props.coords ? JSON.stringify(props.coords) : "";

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // living creatures use their on-chain cell colour when given, else the age gradient.
    const livingRgb: RGB = props.cell != null ? intToRgb(props.cell) : ageColor(age);
    const rgb: RGB = variant === "potential" ? POTENTIAL : variant === "dead" ? DEAD : livingRgb;
    const bgCss = props.bg != null && variant === "living" ? intToCss(props.bg) : "#0a0e14";
    // honour the token's on-chain speed (generations/second) as the step cadence.
    const base =
      variant === "living" && props.speed && props.speed > 0 ? 1000 / props.speed : STEP_AMBIENT;
    const inst: Inst = {
      canvas,
      ctx,
      cells: initialCells(props),
      rgb,
      bgCss,
      variant,
      animate,
      interval: base,
      lastStep: 0,
      phase: Math.random() * Math.PI * 2,
      visible: true,
    };
    instRef.current = inst;
    insts.add(inst);
    ensureRunning();

    let io: IntersectionObserver | null = null;
    if ("IntersectionObserver" in window) {
      io = new IntersectionObserver(
        (entries) => entries.forEach((e) => (inst.visible = e.isIntersecting)),
        { rootMargin: "120px" }
      );
      io.observe(canvas);
    }

    return () => {
      insts.delete(inst);
      io?.disconnect();
      instRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey, variant, age, res, props.bg, props.cell, props.speed]);

  useEffect(() => {
    const inst = instRef.current;
    if (inst) inst.animate = animate;
  }, [animate]);

  return (
    <canvas
      ref={ref}
      className={"creature" + (props.className ? " " + props.className : "")}
      width={res}
      height={res}
      role="img"
      aria-label={props.ariaLabel ?? "A Game of Life lifeform"}
    />
  );
}
