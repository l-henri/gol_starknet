// The Conway engine that powers every render. Pure logic — no DOM.
// v2: the grid is 41x41. An on-chain lifeform's `current_state` is the 41 row bitmasks (row r,
// bit k = the cell at row r, col k); see `fromRows`. Stepping/fate here back the bestiary previews;
// chain identity (token id) is the SDK's Poseidon hash, not this grid's packing.

export const N = 41;
export const STEP_AMBIENT = 1500; // ms — gallery generational step
export const STEP_ENGAGED = 160; // ms — hovered / focused step
export const BREATH = 3600; // ms — ambient glow sine period

export type Cells = boolean[]; // length N*N, index = row*N + col
export type RGB = [number, number, number];

export function fromCoords(coords: [number, number][]): Cells {
  const c = new Array<boolean>(N * N).fill(false);
  for (const [r, k] of coords) c[r * N + k] = true;
  return c;
}

/** Build the grid from a v2 lifeform's `current_state` — the 41 row bitmasks (bit k of row r). */
export function fromRows(rows: number[]): Cells {
  const c = new Array<boolean>(N * N).fill(false);
  for (let r = 0; r < N; r++) {
    const v = BigInt(rows[r] ?? 0);
    for (let k = 0; k < N; k++) c[r * N + k] = ((v >> BigInt(k)) & 1n) === 1n;
  }
  return c;
}

/** Pack a grid back into the canonical state integer. */
export function pack(cells: Cells): bigint {
  let s = 0n;
  for (let i = N * N - 1; i >= 0; i--) s = (s << 1n) | (cells[i] ? 1n : 0n);
  return s;
}

/** One Conway generation with toroidal wrap (matches the on-chain engine). */
export function step(cells: Cells): Cells {
  const nx = new Array<boolean>(N * N);
  for (let r = 0; r < N; r++) {
    for (let k = 0; k < N; k++) {
      let n = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dk = -1; dk <= 1; dk++) {
          if (!dr && !dk) continue;
          if (cells[((r + dr + N) % N) * N + ((k + dk + N) % N)]) n++;
        }
      }
      const a = cells[r * N + k];
      nx[r * N + k] = a ? n === 2 || n === 3 : n === 3;
    }
  }
  return nx;
}

export function population(cells: Cells): number {
  let p = 0;
  for (const c of cells) if (c) p++;
  return p;
}

// colour: age 0..100 -> teal -> green -> amber (hue encodes age)
const hexToRgb = (h: string): RGB => {
  h = h.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};
const STOPS: [number, RGB][] = [
  [0, hexToRgb("#34e2c4")],
  [40, hexToRgb("#6fe39b")],
  [100, hexToRgb("#ffb454")],
];
export function ageColor(age: number): RGB {
  age = Math.max(0, Math.min(100, age));
  let a = STOPS[0];
  let b = STOPS[STOPS.length - 1];
  for (let i = 0; i < STOPS.length - 1; i++) {
    if (age >= STOPS[i][0] && age <= STOPS[i + 1][0]) {
      a = STOPS[i];
      b = STOPS[i + 1];
      break;
    }
  }
  const t = (age - a[0]) / (b[0] - a[0] || 1);
  return a[1].map((v, i) => Math.round(v + (b[1][i] - v) * t)) as RGB;
}

/**
 * Map a raw on-chain age (generations advanced, unbounded) to the 0..100 colour scale.
 * A soft curve so even a few breaths visibly warm the hue.
 */
export function ageToScale(age: number): number {
  return Math.min(100, Math.round(100 * (1 - Math.exp(-age / 40))));
}

export interface Fate {
  alive: boolean; // converges to a non-empty loop
  loopLength: number; // period of the terminal loop (1 = still life)
  smallestHex: string; // smallest state in the loop — the canonical loop id
  stepsToLoop: number; // generations before entering the loop
}

/** Simulate a pattern to its destiny: the loop it falls into (or death). */
export function detectFate(start: Cells, maxGen = 4096): Fate {
  const seen = new Map<string, number>();
  let cells = start;
  let gen = 0;
  while (gen < maxGen) {
    const key = pack(cells).toString(16);
    const first = seen.get(key);
    if (first !== undefined) {
      // found a cycle from `first`..`gen`; collect its states to find the smallest
      let cur = start;
      for (let i = 0; i < first; i++) cur = step(cur);
      let smallest = pack(cur);
      let probe = cur;
      const loopLength = gen - first;
      for (let i = 0; i < loopLength; i++) {
        const v = pack(probe);
        if (v < smallest) smallest = v;
        probe = step(probe);
      }
      return {
        alive: smallest !== 0n,
        loopLength,
        smallestHex: "0x" + smallest.toString(16),
        stepsToLoop: first,
      };
    }
    seen.set(key, gen);
    cells = step(cells);
    gen++;
  }
  return { alive: false, loopLength: 0, smallestHex: "0x0", stepsToLoop: gen };
}
