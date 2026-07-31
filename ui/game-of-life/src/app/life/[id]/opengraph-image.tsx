import { ImageResponse } from "next/og";
import { loadPreview, type PreviewData } from "@/lib/linkPreview";
import { N } from "@/lib/creatures";

// The link-preview card for /life/[id]: the creature's current frame in its own on-chain palette,
// framed like the microscope slide on the page. Satori renders the JSX; the grid itself is one
// embedded SVG <img> (a per-cell <div> tree would be hundreds of nodes for a dense pattern).

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "a creature from petri, the garden of digital bacteria living on Starknet";

const toHex = (n: number) => "#" + (n & 0xffffff).toString(16).padStart(6, "0");

// site palette (globals.css)
const VOID = "#07090d";
const INK = "#e8eef6";
const INK_DIM = "#8a96a8";
const LINE = "#1c2430";
const LIFE = "#34e2c4";
const ACCENT = "#5ad1ff"; // the bestiary's "potential" glow

/**
 * The grid as an SVG data URI — same look as the on-chain renderer (12px cells, 1px gap), but the
 * viewBox zooms to the creature's bounding box (padded, min 15-cell window) so a small pattern
 * fills the card instead of being a speck on the 41×41 dish. An empty or edge-wrapping pattern
 * falls back to the full dish.
 */
function gridUri(rows: number[], bgHex: string, cellHex: string): string {
  const px = 12;
  let cells = "";
  let minR = N, maxR = -1, minC = N, maxC = -1;
  for (let r = 0; r < N; r++) {
    const row = rows[r] ?? 0;
    for (let c = 0; c < N; c++) {
      if (Math.floor(row / 2 ** c) % 2) {
        cells += `<rect x="${c * px}" y="${r * px}" width="${px - 1}" height="${px - 1}" fill="${cellHex}"/>`;
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
        if (c < minC) minC = c;
        if (c > maxC) maxC = c;
      }
    }
  }
  // window: bounding box + padding, at least 15 cells, square, clamped to the dish
  let vb = { x: 0, y: 0, s: N };
  if (maxR >= 0) {
    const span = Math.min(N, Math.max(15, Math.max(maxR - minR + 1, maxC - minC + 1) + 4));
    const clamp = (v: number) => Math.max(0, Math.min(N - span, v));
    vb = { x: clamp(Math.round((minC + maxC + 1) / 2 - span / 2)), y: clamp(Math.round((minR + maxR + 1) / 2 - span / 2)), s: span };
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${vb.s * px}" height="${vb.s * px}" viewBox="${vb.x * px} ${vb.y * px} ${vb.s * px} ${vb.s * px}"><rect x="${vb.x * px}" y="${vb.y * px}" width="${vb.s * px}" height="${vb.s * px}" fill="${bgHex}"/>${cells}</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function card(p: PreviewData) {
  if (p.kind === "none") {
    return (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: VOID, color: INK, gap: 20 }}>
        <div style={{ fontSize: 84, display: "flex" }}>petri</div>
        <div style={{ fontSize: 30, color: INK_DIM, display: "flex" }}>a garden of digital bacteria, living on Starknet</div>
      </div>
    );
  }

  const bgHex = p.kind === "beast" ? "#070709" : toHex(p.bg);
  const cellHex = p.kind === "beast" ? ACCENT : toHex(p.cell);
  const eyebrow =
    p.kind === "beast"
      ? "waiting to be discovered · not yet on chain"
      : p.kind === "path"
        ? "a wanderer · a journey toward a loop"
        : p.isDead
          ? "gone out · resting on Starknet"
          : "alive · living on Starknet";
  const name = p.kind === "beast" ? p.name : p.kind === "path" ? `Wanderer ${p.idShort}` : `${p.name} ${p.idShort}`;
  const fact =
    p.kind === "beast"
      ? p.kindLabel
      : p.kind === "path"
        ? `${p.journey.toLocaleString("en-US")} generations of travel`
        : `${p.age.toLocaleString("en-US")} generation${p.age === 1 ? "" : "s"} lived`;

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", background: VOID, color: INK }}>
      {/* the slide: creature centered on its own background color */}
      <div style={{ width: 630, height: 630, display: "flex", alignItems: "center", justifyContent: "center", background: bgHex, borderRight: `2px solid ${LINE}` }}>
        <img src={gridUri(p.rows, bgHex, cellHex)} width={540} height={540} alt="" />
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 52px", gap: 22 }}>
        <div style={{ fontSize: 21, letterSpacing: 4, textTransform: "uppercase", color: INK_DIM, display: "flex" }}>{eyebrow}</div>
        <div style={{ fontSize: 54, lineHeight: 1.15, display: "flex" }}>{name}</div>
        <div style={{ fontSize: 30, color: p.kind === "beast" ? ACCENT : LIFE, display: "flex" }}>{fact}</div>
        <div style={{ marginTop: 44, fontSize: 23, color: INK_DIM, display: "flex" }}>petri · a garden of digital bacteria on Starknet</div>
      </div>
    </div>
  );
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await loadPreview(id);
  return new ImageResponse(card(p), size);
}
