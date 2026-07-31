"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Creature from "./Creature";
import BreatheControl from "./BreatheControl";
import { useGolSdk } from "@/lib/sdk";
import { useWallet } from "@/lib/wallet";
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
 * DIGITAL BACTERIA — a living loop. The tile is a link to the creature; on hover a compact rhythmic
 * BREATHE control appears (same tap mechanic as the creature page), so you can give a breath from
 * the gallery. The control sits OUTSIDE the link so tapping it never navigates.
 */
export function BacteriaTile({ lf, hungry }: { lf: JsLifeform; hungry: boolean }) {
  const { sdk } = useGolSdk();
  const { address, onAppChain, connect, switchToAppChain } = useWallet();
  const [rp, setRp] = useState<RenderParams | null>(null);
  const id = shortAddr(lf.token_id);
  const state: TileState = lf.is_dead ? "gone" : hungry ? "hungry" : "alive";

  // the token's on-chain look (bg/cell colour + speed) — the real palette its owner chose
  useEffect(() => {
    if (!sdk) return;
    let cancelled = false;
    sdk.renderParams(lf.token_id).then((p) => { if (!cancelled && p) setRp(p as RenderParams); });
    return () => { cancelled = true; };
  }, [sdk, lf.token_id]);

  return (
    <div className="petri-tile" data-state={state}>
      <Link href={`/life/${lf.token_id}`} className="petri-tile-link" aria-label={`Bacteria ${id}, ${STATE_WORD[state]}`}>
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
              res={440}
              ariaLabel={`bacteria ${id}`}
            />
          </div>
        </div>
        <div className="petri-meta">
          <span className="petri-dot" />
          <span className="petri-state">{STATE_WORD[state]}</span>
          <span className="petri-id mono">{id}</span>
        </div>
      </Link>
      {/* dead loops (the empty grid) stay feedable — the one dead thing that accepts offerings */}
      <div className="petri-hover-breathe">
        <BreatheControl
          compact
          creatureId={lf.token_id}
          connected={!!address}
          onAppChain={onAppChain}
          onConnect={connect}
          onSwitch={switchToAppChain}
          voidMode={lf.is_dead}
        />
      </div>
    </div>
  );
}

/** The creature-of-the-moment can be a living loop (most-breathed) or a wanderer (longest journey). */
export type FeatureData =
  | { kind: "loop"; lf: JsLifeform }
  | { kind: "path"; pf: JsPath };

/**
 * CREATURE OF THE MOMENT — one creature given room to be watched: a large render beside a quiet
 * caption. Drawn from the dish's most-breathed loops or its longest journeys (see Garden). A loop
 * cycles in place; a wanderer plays out its journey from where it began.
 */
export function FeatureTile({ data, hungry }: { data: FeatureData; hungry?: boolean }) {
  const { sdk } = useGolSdk();
  const [rp, setRp] = useState<RenderParams | null>(null);
  const isLoop = data.kind === "loop";
  const tokenId = isLoop ? data.lf.token_id : data.pf.token_id;
  const id = shortAddr(tokenId);
  const dead = isLoop ? data.lf.is_dead : data.pf.life_state === "dead";
  const state: TileState = dead ? "gone" : isLoop && hungry ? "hungry" : "alive";

  const name = isLoop ? (data.lf.is_still ? "Still Life" : `Period-${data.lf.sequence_length} Loop`) : "Wanderer";
  const line = isLoop
    ? (hungry
        ? "One of the dish’s elders, now growing hungry. A breath keeps it going."
        : `One of the most popular creatures, ${data.lf.age.toLocaleString("en-US")} generations and counting.`)
    : `One of the longest journeys, ${data.pf.sequence_length.toLocaleString("en-US")} generations before it settles into a loop.`;
  const rows = isLoop ? data.lf.current_state : data.pf.start_state;

  useEffect(() => {
    if (!sdk) return;
    let cancelled = false;
    const call = isLoop ? sdk.renderParams(tokenId) : sdk.pathRenderParams(tokenId);
    call.then((p) => { if (!cancelled && p) setRp(p as RenderParams); });
    return () => { cancelled = true; };
  }, [sdk, tokenId, isLoop]);

  return (
    <Link href={`/life/${tokenId}`} className="petri-feature" data-state={state} aria-label={`Creature of the moment: ${name} ${id}`}>
      <div className="feature-dish">
        <div className="feature-render">
          <Creature rows={rows} age={isLoop ? ageToScale(data.lf.age) : undefined} bg={rp?.bg} cell={rp?.cell} speed={rp?.speed} variant={dead ? "dead" : "living"} animate={!dead} res={560} ariaLabel={`${name} ${id}`} />
        </div>
      </div>
      <div className="feature-caption">
        <span className="feature-eyebrow">Creature of the moment</span>
        <h3 className="feature-name">{name} <span className="feature-id">{id}</span></h3>
        <p className="feature-line">{line}</p>
        <div className="feature-state"><span className="feature-dot" />{STATE_WORD[state]}</div>
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
    <Link href={`/life/${pf.token_id}`} className="petri-tile" data-state={state} aria-label={`Wanderer ${id}, ${STATE_WORD[state]}`}>
      <div className="petri-dish">
        <div className="petri-render">
          <Creature
            rows={pf.start_state}
            bg={rp?.bg}
            cell={rp?.cell}
            speed={rp?.speed}
            variant={dead ? "dead" : "living"}
            animate={false}
            res={440}
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
