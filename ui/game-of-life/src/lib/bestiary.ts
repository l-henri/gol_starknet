// A curated reservoir of known-valid Conway lifeforms, rendered as living-but-not-yet-born
// creatures in the Garden. Each is a doorway into discover-&-mint: "be the first to set it free."
// Patterns are defined compactly, then centered on the v2 41x41 toroidal grid.

import { N } from "./creatures";

export interface BeastSeed {
  key: string; // url slug
  name: string;
  kind: string; // human label
  family: "still" | "oscillator" | "spaceship";
  coords: [number, number][]; // centered on the 41x41 grid
}

interface Base {
  key: string;
  name: string;
  kind: string;
  family: "still" | "oscillator" | "spaceship";
  cells: [number, number][]; // compact pattern, top-left anchored
}

const BASE: Base[] = [
  { key: "blinker", name: "Blinker", kind: "Oscillator · period 2", family: "oscillator", cells: [[0, 0], [0, 1], [0, 2]] },
  { key: "toad", name: "Toad", kind: "Oscillator · period 2", family: "oscillator", cells: [[0, 1], [0, 2], [0, 3], [1, 0], [1, 1], [1, 2]] },
  { key: "beacon", name: "Beacon", kind: "Oscillator · period 2", family: "oscillator", cells: [[0, 0], [0, 1], [1, 0], [1, 1], [2, 2], [2, 3], [3, 2], [3, 3]] },
  { key: "beehive", name: "Beehive", kind: "Still life", family: "still", cells: [[0, 1], [0, 2], [1, 0], [1, 3], [2, 1], [2, 2]] },
  { key: "loaf", name: "Loaf", kind: "Still life", family: "still", cells: [[0, 1], [0, 2], [1, 0], [1, 3], [2, 1], [2, 3], [3, 2]] },
  { key: "glider", name: "Glider", kind: "Spaceship · traveller", family: "spaceship", cells: [[0, 1], [1, 2], [2, 0], [2, 1], [2, 2]] },
];

// Center a pattern's bounding box on the 41x41 grid (so it renders mid-dish, not in a corner).
function center(cells: [number, number][]): [number, number][] {
  const rs = cells.map((c) => c[0]);
  const cs = cells.map((c) => c[1]);
  const dr = Math.round((N - 1) / 2 - (Math.min(...rs) + Math.max(...rs)) / 2);
  const dc = Math.round((N - 1) / 2 - (Math.min(...cs) + Math.max(...cs)) / 2);
  return cells.map(([r, c]) => [r + dr, c + dc]);
}

export const BESTIARY: BeastSeed[] = BASE.map(({ cells, ...rest }) => ({ ...rest, coords: center(cells) }));

export const findBeast = (key: string): BeastSeed | undefined => BESTIARY.find((b) => b.key === key);
