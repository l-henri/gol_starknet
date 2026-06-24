"use client";

import Link from "next/link";
import { useState } from "react";
import Creature from "./Creature";
import type { BeastSeed } from "@/lib/bestiary";
import type { JsLifeform } from "@/lib/types";
import { ageColor, ageToScale } from "@/lib/creatures";
import { lifeformKind, tokenIdDecimal } from "@/lib/format";

function MintedCard({ lf }: { lf: JsLifeform }) {
  const [engaged, setEngaged] = useState(false);
  const id = tokenIdDecimal(lf.token_id);
  const kind = lifeformKind(lf);
  const dotRgb = lf.is_dead ? [58, 65, 80] : ageColor(ageToScale(lf.age));
  const dotCss = `rgb(${dotRgb.join(",")})`;

  return (
    <Link
      href={`/life/${id}`}
      className="creature-card"
      onMouseEnter={() => setEngaged(true)}
      onMouseLeave={() => setEngaged(false)}
      onFocus={() => setEngaged(true)}
      onBlur={() => setEngaged(false)}
      aria-label={`Lifeform ${id}, ${kind}, age ${lf.age}`}
    >
      <div className="dish">
        <Creature
          rows={lf.current_state}
          age={ageToScale(lf.age)}
          variant={lf.is_dead ? "dead" : "living"}
          engaged={engaged}
          ariaLabel={`${kind} lifeform ${id}`}
        />
      </div>
      <div className="cmeta">
        <span className="cid">#{id}</span>
        <span className="ckind">{kind}</span>
      </div>
      <div className="cfoot">
        <span className="age-dot" style={{ background: dotCss, boxShadow: lf.is_dead ? "none" : `0 0 7px ${dotCss}` }} />
        {lf.is_dead ? "rests" : "living on Starknet"} · age {lf.age}
      </div>
    </Link>
  );
}

function BeastCard({ beast }: { beast: BeastSeed }) {
  const [engaged, setEngaged] = useState(false);
  return (
    <Link
      href={`/life/${beast.key}`}
      className="creature-card potential"
      onMouseEnter={() => setEngaged(true)}
      onMouseLeave={() => setEngaged(false)}
      onFocus={() => setEngaged(true)}
      onBlur={() => setEngaged(false)}
      aria-label={`${beast.name}, ${beast.kind}, not yet minted`}
    >
      <div className="dish">
        <Creature coords={beast.coords} variant="potential" engaged={engaged} ariaLabel={`${beast.name} pattern`} />
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

export default function CreatureCard(props: { lf?: JsLifeform; beast?: BeastSeed }) {
  if (props.lf) return <MintedCard lf={props.lf} />;
  if (props.beast) return <BeastCard beast={props.beast} />;
  return null;
}
