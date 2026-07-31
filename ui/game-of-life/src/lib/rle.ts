/* RLE (Run Length Encoded) — the pattern format used by Golly, LifeViewer and
 * the conwaylife.com forums. `b`/`.` = dead, `o` = alive, a digit prefix is a
 * run count, `$` ends a row, `!` ends the pattern. `#` lines are comments; the
 * `x = …, y = …, rule = …` header line is optional (we size by the live cells
 * actually present, not by what the header claims). */

export type RleParse =
  | { ok: true; coords: [number, number][]; width: number; height: number }
  | { ok: false; why: "unreadable" }
  | { ok: false; why: "rule"; rule: string }
  | { ok: false; why: "empty" };

const CONWAY_RULES = new Set(["b3/s23", "s23/b3", "23/3"]);

export function parseRle(input: string): RleParse {
  const lines = input
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
  if (lines.length === 0) return { ok: false, why: "unreadable" };

  let start = 0;
  const header = lines[0].match(/^x\s*=\s*\d+\s*,\s*y\s*=\s*\d+(?:\s*,\s*rule\s*=\s*(\S+))?/i);
  if (header) {
    start = 1;
    const rule = header[1];
    if (rule && !CONWAY_RULES.has(rule.toLowerCase())) return { ok: false, why: "rule", rule };
  }

  const body = lines.slice(start).join("");
  const coords: [number, number][] = [];
  let row = 0;
  let col = 0;
  let count = 0;
  let ended = false;
  for (const ch of body) {
    if (ended) break;
    if (ch >= "0" && ch <= "9") { count = count * 10 + Number(ch); continue; }
    const run = count || 1;
    count = 0;
    if (ch === "b" || ch === ".") { col += run; continue; }
    if (ch === "$") { row += run; col = 0; continue; }
    if (ch === "!") { ended = true; continue; }
    // any other letter is a live cell ('o' in plain Life; multistate exports use A–X)
    if (/[a-zA-Z]/.test(ch)) { for (let k = 0; k < run; k++) coords.push([row, col++]); continue; }
    return { ok: false, why: "unreadable" };
  }
  if (!ended && !header) return { ok: false, why: "unreadable" }; // neither header nor '!' — probably not RLE
  if (coords.length === 0) return { ok: false, why: "empty" };

  const rs = coords.map((c) => c[0]);
  const cs = coords.map((c) => c[1]);
  return {
    ok: true,
    coords,
    width: Math.max(...cs) - Math.min(...cs) + 1,
    height: Math.max(...rs) - Math.min(...rs) + 1,
  };
}
