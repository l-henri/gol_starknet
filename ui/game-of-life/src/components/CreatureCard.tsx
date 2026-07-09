"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Creature from "./Creature";
import { useGolSdk } from "@/lib/sdk";
import type { JsLifeform } from "@/lib/types";
import { ageToScale } from "@/lib/creatures";
import { shortAddr } from "@/lib/format";

// The site owns only the FRAME (backdrop / border / petri texture, in globals.css). The render
// inside each tile is the creature's OWN on-chain look — bg/cell/speed come from the chain and are
// passed straight through to <Creature>. Never recolor or restyle it here.
interface RenderParams { bg: number; cell: number; speed: number; }

/** A wanderer (path creature): a static, travelling portrait — never fed, never petted. */
export type JsPath = {
  token_id: string;
  owner: string;
  life_state: string; // "alive" | "frozen" | "dead"
  sequence_length: number;
  start_state: number[];
  target_loop_id: string;
  target_period: number;
  minted_at: number;
  escrow: string;
};

type TileState = "alive" | "hungry" | "gone";
const STATE_WORD: Record<TileState, string> = { alive: "alive", hungry: "hungry", gone: "gone out" };

/**
 * DIGITAL BACTERIA — a living loop. Pettable, so a living tile carries the quiet "breathe"
 * affordance that appears on hover (an invitation; the tile itself leads to the creature).
 */
export function BacteriaTile({ lf, hungry }: { lf: JsLifeform; hungry: boolean }) {
  const { sdk } = useGolSdk();
  const [rp, setRp] = useState<RenderParams | null>(null);
  const id = shortAddr(lf.token_id);
  const state: TileState = lf.is_dead ? "gone" : hungry ? "hungry" : "alive";
  const living = state !== "gone";

  // the token's on-chain look (bg/cell colour + speed) — the real palette its owner chose
  useEffect(() => {
    if (!sdk) return;
    let cancelled = false;
    sdk.renderParams(lf.token_id).then((p) => { if (!cancelled && p) setRp(p as RenderParams); });
    return () => { cancelled = true; };
  }, [sdk, lf.token_id]);

  return (
    <Link href={`/life/${lf.token_id}`} className="petri-tile" data-state={state} aria-label={`Bacteria ${id} — ${STATE_WORD[state]}`}>
      <div className="petri-dish">
        <div className="petri-render">
          <Creature
            rows={lf.current_state}
            age={ageToScale(lf.age)}
            bg={rp?.bg}
            cell={rp?.cell}
            speed={rp?.speed}
            variant={lf.is_dead ? "dead" : "living"}
            animate={!lf.is_dead}
            res={280}
            ariaLabel={`bacteria ${id}`}
          />
        </div>
        {living && (
          <span className="petri-breathe" aria-hidden="true"><span className="ring" />breathe</span>
        )}
      </div>
      <div className="petri-meta">
        <span className="petri-dot" />
        <span className="petri-state">{STATE_WORD[state]}</span>
        <span className="petri-id mono">{id}</span>
      </div>
    </Link>
  );
}

/**
 * DIGITAL WANDERERS — a captured moment of a pattern still travelling toward its loop. A static
 * portrait: no stepping, no care affordance. It shows its on-chain palette, held still.
 */
export function WandererTile({ pf }: { pf: JsPath }) {
  const { sdk } = useGolSdk();
  const [rp, setRp] = useState<RenderParams | null>(null);
  const id = shortAddr(pf.token_id);
  const dead = pf.life_state === "dead";
  const state: TileState = dead ? "gone" : "alive";

  useEffect(() => {
    if (!sdk) return;
    let cancelled = false;
    sdk.pathRenderParams(pf.token_id).then((p) => { if (!cancelled && p) setRp(p as RenderParams); });
    return () => { cancelled = true; };
  }, [sdk, pf.token_id]);

  return (
    <Link href={`/life/${pf.token_id}`} className="petri-tile" data-state={state} aria-label={`Wanderer ${id} — ${STATE_WORD[state]}`}>
      <div className="petri-dish">
        <div className="petri-render">
          <Creature
            rows={pf.start_state}
            bg={rp?.bg}
            cell={rp?.cell}
            speed={rp?.speed}
            variant={dead ? "dead" : "living"}
            animate={false}
            res={280}
            ariaLabel={`wanderer ${id}`}
          />
        </div>
        {/* no breathe affordance — a wanderer is a portrait, not a pet */}
      </div>
      <div className="petri-meta">
        <span className="petri-dot" />
        <span className="petri-state">{STATE_WORD[state]}</span>
        <span className="petri-id mono">{id}</span>
      </div>
    </Link>
  );
}
