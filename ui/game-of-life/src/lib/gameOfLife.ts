// Pure Conway's Game of Life core, mirroring the on-chain Cairo logic
// (15x15 toroidal grid, cell (row, col) -> bit row*GRID_SIZE + col).

export const GRID_SIZE = 15;
export type Grid = boolean[][];

export function emptyGrid(): Grid {
  return Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => false),
  );
}

export function randomGrid(density = 0.3): Grid {
  return Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => Math.random() < density),
  );
}

export function gridToId(grid: Grid): bigint {
  let id = 0n;
  let power = 1n;
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      if (grid[row][col]) id += power;
      power *= 2n;
    }
  }
  return id;
}

export function idToGrid(id: bigint): Grid {
  const grid = emptyGrid();
  let remaining = id;
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      if (remaining & 1n) grid[row][col] = true;
      remaining >>= 1n;
    }
  }
  return grid;
}

/** One Conway step with toroidal wrapping. */
export function nextGrid(grid: Grid): Grid {
  const next = emptyGrid();
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      let neighbours = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const r = (row + dr + GRID_SIZE) % GRID_SIZE;
          const c = (col + dc + GRID_SIZE) % GRID_SIZE;
          if (grid[r][c]) neighbours++;
        }
      }
      next[row][col] = grid[row][col]
        ? neighbours === 2 || neighbours === 3
        : neighbours === 3;
    }
  }
  return next;
}

export interface Fate {
  found: boolean;
  /** True when the initial state is already part of the loop (no transient path). */
  isLoop: boolean;
  loopLength: number;
  /** Canonical (smallest) state id in the loop — what `mint_loop` expects. */
  smallestLoopId: bigint;
  /** First state that belongs to the loop (the loop entry point). */
  loopEntryId: bigint;
  /** Transient length before entering the loop — what `mint_path` expects. */
  generationsToLoop: number;
  /** How far the search ran. */
  checkedGenerations: number;
}

/**
 * Deterministically evolve `initialId` until a state repeats (a loop is found) or
 * `maxGenerations` is exhausted. This is a pure function — no React state, no animation —
 * so the values it produces are exactly what the mint calls need.
 */
export function computeFate(initialId: bigint, maxGenerations = 20000): Fate {
  const seenAt = new Map<bigint, number>();
  const history: bigint[] = [];
  let grid = idToGrid(initialId);
  let generation = 0;

  while (generation <= maxGenerations) {
    const id = gridToId(grid);
    const firstSeen = seenAt.get(id);
    if (firstSeen !== undefined) {
      const loopLength = generation - firstSeen;
      let smallest = history[firstSeen];
      for (let i = firstSeen; i < generation; i++) {
        if (history[i] < smallest) smallest = history[i];
      }
      return {
        found: true,
        isLoop: firstSeen === 0,
        loopLength,
        smallestLoopId: smallest,
        loopEntryId: history[firstSeen],
        generationsToLoop: firstSeen,
        checkedGenerations: generation,
      };
    }
    seenAt.set(id, generation);
    history.push(id);
    grid = nextGrid(grid);
    generation++;
  }

  return {
    found: false,
    isLoop: false,
    loopLength: 0,
    smallestLoopId: 0n,
    loopEntryId: 0n,
    generationsToLoop: 0,
    checkedGenerations: maxGenerations,
  };
}
