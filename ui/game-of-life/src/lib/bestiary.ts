// A curated reservoir of known-valid Conway lifeforms, rendered as living-but-not-yet-born
// creatures in the Garden. Each is a doorway into discover-&-mint: "be the first to set it free."
// Coordinates are verified to animate correctly on the 15x15 toroidal grid.

export interface BeastSeed {
  key: string; // url slug
  name: string;
  kind: string; // human label
  family: "still" | "oscillator" | "spaceship";
  coords: [number, number][];
}

export const BESTIARY: BeastSeed[] = [
  { key: "blinker", name: "Blinker", kind: "Oscillator · period 2", family: "oscillator", coords: [[6, 5], [6, 6], [6, 7]] },
  { key: "toad", name: "Toad", kind: "Oscillator · period 2", family: "oscillator", coords: [[6, 6], [6, 7], [6, 8], [7, 5], [7, 6], [7, 7]] },
  { key: "beacon", name: "Beacon", kind: "Oscillator · period 2", family: "oscillator", coords: [[4, 4], [4, 5], [5, 4], [5, 5], [6, 6], [6, 7], [7, 6], [7, 7]] },
  { key: "beehive", name: "Beehive", kind: "Still life", family: "still", coords: [[5, 6], [5, 7], [6, 5], [6, 8], [7, 6], [7, 7]] },
  { key: "loaf", name: "Loaf", kind: "Still life", family: "still", coords: [[4, 6], [4, 7], [5, 5], [5, 8], [6, 6], [6, 8], [7, 7]] },
  { key: "glider", name: "Glider", kind: "Spaceship · traveller", family: "spaceship", coords: [[1, 2], [2, 3], [3, 1], [3, 2], [3, 3]] },
];

export const findBeast = (key: string): BeastSeed | undefined => BESTIARY.find((b) => b.key === key);
