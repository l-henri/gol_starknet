"use client";

import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { N, type Cells } from "@/lib/creatures";

/**
 * A 41×41 Game of Life grid on a canvas. Pure render of `cells`; in `editable` mode, pointer
 * down/drag paints cells via `onPaint(index, value)` (the first cell toggled sets the paint value,
 * so a drag either fills or clears consistently).
 */
export default function GolCanvas({
  cells,
  editable = false,
  onPaint,
  size = 520,
  bg = "#0b0b0f",
  cellColor = "#7ef9a0",
  showGrid = true,
}: {
  cells: Cells;
  editable?: boolean;
  onPaint?: (index: number, value: boolean) => void;
  size?: number;
  bg?: string;
  cellColor?: string;
  showGrid?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const paint = useRef<{ active: boolean; value: boolean }>({ active: false, value: true });

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const px = size / N;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, size, size);
    if (showGrid) {
      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      ctx.lineWidth = 1;
      for (let i = 1; i < N; i++) {
        const p = Math.round(i * px) + 0.5;
        ctx.beginPath();
        ctx.moveTo(p, 0);
        ctx.lineTo(p, size);
        ctx.moveTo(0, p);
        ctx.lineTo(size, p);
        ctx.stroke();
      }
    }
    ctx.fillStyle = cellColor;
    const pad = px * 0.08;
    const s = px - 2 * pad;
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (cells[r * N + c]) ctx.fillRect(c * px + pad, r * px + pad, s, s);
      }
    }
  }, [cells, size, bg, cellColor, showGrid]);

  function cellAt(e: ReactPointerEvent): number | null {
    const cv = ref.current;
    if (!cv) return null;
    const rect = cv.getBoundingClientRect();
    const c = Math.floor(((e.clientX - rect.left) / rect.width) * N);
    const r = Math.floor(((e.clientY - rect.top) / rect.height) * N);
    if (r < 0 || r >= N || c < 0 || c >= N) return null;
    return r * N + c;
  }

  const down = (e: ReactPointerEvent) => {
    if (!editable || !onPaint) return;
    const i = cellAt(e);
    if (i == null) return;
    paint.current = { active: true, value: !cells[i] };
    onPaint(i, paint.current.value);
    (e.currentTarget as HTMLCanvasElement).setPointerCapture?.(e.pointerId);
  };
  const move = (e: ReactPointerEvent) => {
    if (!editable || !onPaint || !paint.current.active) return;
    const i = cellAt(e);
    if (i != null) onPaint(i, paint.current.value);
  };
  const up = () => {
    paint.current.active = false;
  };

  return (
    <canvas
      ref={ref}
      width={size}
      height={size}
      onPointerDown={editable ? down : undefined}
      onPointerMove={editable ? move : undefined}
      onPointerUp={editable ? up : undefined}
      onPointerLeave={editable ? up : undefined}
      style={{
        width: "100%",
        maxWidth: size,
        aspectRatio: "1 / 1",
        borderRadius: 10,
        cursor: editable ? "crosshair" : "default",
        touchAction: "none",
        background: bg,
      }}
    />
  );
}
