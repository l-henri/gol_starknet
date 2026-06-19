"use client";

import { useEffect, useRef } from "react";
import {
  type Cells,
  type RGB,
  ageColor,
  BREATH,
  fromCoords,
  N,
  step,
  STEP_AMBIENT,
  STEP_ENGAGED,
  unpack,
} from "@/lib/creatures";

type Variant = "living" | "potential" | "dead";

interface Inst {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  cells: Cells;
  rgb: RGB;
  variant: Variant;
  animate: boolean;
  interval: number;
  target: number;
  baseAmbient: number;
  lastStep: number;
  phase: number;
  visible: boolean;
}

// ---- shared render bus: one rAF drives every creature on the page ----
const POTENTIAL: RGB = [90, 209, 255]; // accent blue — a latent, not-yet-born glow
const DEAD: RGB = [58, 65, 80];

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
  ctx.fillStyle = "#0a0e14";
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
      inst.interval += (inst.target - inst.interval) * 0.14;
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
  if (props.state) return unpack(props.state);
  if (props.coords) return fromCoords(props.coords);
  return new Array<boolean>(N * N).fill(false);
}

export interface CreatureProps {
  /** one of: explicit cells, a packed state hex, or live-cell coordinates */
  cells?: Cells;
  state?: string;
  coords?: [number, number][];
  /** colour age 0..100 (living variant only) */
  age?: number;
  variant?: Variant;
  /** accelerate the simulation (hover / focus / detail) */
  engaged?: boolean;
  /** false = hold current state, no stepping */
  animate?: boolean;
  /** internal canvas resolution (px, square) */
  res?: number;
  className?: string;
  ariaLabel?: string;
}

export default function Creature(props: CreatureProps) {
  const { age = 0, variant = "living", engaged = false, animate = true, res = 360 } = props;
  const ref = useRef<HTMLCanvasElement>(null);
  const instRef = useRef<Inst | null>(null);
  // re-seed when the pattern identity changes
  const seedKey = props.state ?? (props.coords ? JSON.stringify(props.coords) : "");

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rgb: RGB = variant === "potential" ? POTENTIAL : variant === "dead" ? DEAD : ageColor(age);
    const base = STEP_AMBIENT;
    const inst: Inst = {
      canvas,
      ctx,
      cells: initialCells(props),
      rgb,
      variant,
      animate,
      interval: base,
      target: engaged ? STEP_ENGAGED : base,
      baseAmbient: base,
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
  }, [seedKey, variant, age, res]);

  // engage / disengage without re-seeding
  useEffect(() => {
    const inst = instRef.current;
    if (inst) inst.target = engaged ? STEP_ENGAGED : inst.baseAmbient;
  }, [engaged]);

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
