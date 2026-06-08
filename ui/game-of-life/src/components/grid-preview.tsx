"use client";

import { GRID_SIZE, idToGrid } from "@/lib/gameOfLife";

/** Read-only render of a packed grid id as a small grid. */
export default function GridPreview({ id, cell = 8 }: { id: bigint; cell?: number }) {
  const grid = idToGrid(id);
  return (
    <div
      className="inline-grid gap-px bg-gray-200 border border-gray-300 shrink-0"
      style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, ${cell}px)` }}
    >
      {grid.flatMap((row, r) =>
        row.map((alive, c) => (
          <div
            key={`${r}-${c}`}
            style={{ width: cell, height: cell }}
            className={alive ? "bg-black" : "bg-white"}
          />
        )),
      )}
    </div>
  );
}
