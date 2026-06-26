"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Creature from "./Creature";
import { useGolSdk } from "@/lib/sdk";
import type { BeastSeed } from "@/lib/bestiary";
import type { JsLifeform } from "@/lib/types";
import { ageColor, ageToScale } from "@/lib/creatures";
import { lifeformKind, tokenIdDecimal } from "@/lib/format";

interface RenderParams { bg: number; cell: number; speed: number; }

function MintedCard({ lf }: { lf: JsLifeform }) {
  const { sdk } = useGolSdk();
  const [rp, setRp] = useState<RenderParams | null>(null);
  const id = tokenIdDecimal(lf.token_id);
  const kind = lifeformKind(lf);
  const dotRgb = lf.is_dead ? [58, 65, 80] : ageColor(ageToScale(lf.age));
  const dotCss = `rgb(${dotRgb.join(",")})`;

  // the token's on-chain look (bg/cell colour + speed), so the gallery shows the real palette
  useEffect(() => {
    if (!sdk) return;
    let cancelled = false;
    sdk.renderParams(lf.token_id).then((p) => { if (!cancelled && p) setRp(p as RenderParams); });
    return () => { cancelled = true; };
  }, [sdk, lf.token_id]);

  return (
    <Link
      href={`/life/${lf.token_id}`}
      className="creature-card"
      aria-label={`Lifeform ${id}, ${kind}, age ${lf.age}`}
    >
      <div className="dish">
        <Creature
          rows={lf.current_state}
          age={ageToScale(lf.age)}
          bg={rp?.bg}
          cell={rp?.cell}
          speed={rp?.speed}
          variant={lf.is_dead ? "dead" : "living"}
          ariaLabel={`${kind} lifeform ${id}`}
        />
      </div>
      <div className="cmeta">
        <span className="ckind">{kind}</span>
      </div>
      <div className="cfoot">
        <span className="age-dot" style={{ background: dotCss, boxShadow: lf.is_dead ? "none" : `0 0 7px ${dotCss}` }} />
        {lf.is_dead ? "rests" : "alive"} · age {lf.age}
      </div>
    </Link>
  );
}

function BeastCard({ beast }: { beast: BeastSeed }) {
  return (
    <Link
      href={`/life/${beast.key}`}
      className="creature-card potential"
      aria-label={`${beast.name}, ${beast.kind}, not yet minted`}
    >
      <div className="dish">
        <Creature coords={beast.coords} variant="potential" ariaLabel={`${beast.name} pattern`} />
      </div>
      <div className="cmeta">
        <span className="cid">{beast.name}</span>
        <span className="ckind">{beast.kind.split(" · ")[0]}</span>
      </div>
      <div className="cfoot">
        <span className="age-dot" style={{ background: "var(--ink-faint)" }} />
        waiting to be discovered
      </div>
    </Link>
  );
}

// Given just a token id, hydrate the creature on its own (so the gallery fills in progressively),
// showing a skeleton until its data lands.
function LazyMintedCard({ tokenId }: { tokenId: string }) {
  const { sdk } = useGolSdk();
  const [lf, setLf] = useState<JsLifeform | null>(null);

  useEffect(() => {
    if (!sdk) return;
    let cancelled = false;
    sdk.lifeform(tokenId).then((l) => { if (!cancelled && l) setLf(l as JsLifeform); });
    return () => { cancelled = true; };
  }, [sdk, tokenId]);

  if (lf) return <MintedCard lf={lf} />;
  return (
    <div className="creature-card" aria-busy="true">
      <div className="dish" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span className="spinner" />
      </div>
      <div className="cmeta">
        <span className="cid">summoning…</span>
      </div>
    </div>
  );
}

export default function CreatureCard(props: { lf?: JsLifeform; beast?: BeastSeed; tokenId?: string }) {
  if (props.lf) return <MintedCard lf={props.lf} />;
  if (props.tokenId) return <LazyMintedCard tokenId={props.tokenId} />;
  if (props.beast) return <BeastCard beast={props.beast} />;
  return null;
}
