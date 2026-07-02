"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Creature from "./Creature";
import { useGolSdk } from "@/lib/sdk";
import type { BeastSeed } from "@/lib/bestiary";
import type { JsLifeform } from "@/lib/types";
import { ageColor, ageToScale } from "@/lib/creatures";
import { lifeformKind, tokenIdDecimal } from "@/lib/format";
import { useT } from "@/lib/i18n";

interface RenderParams { bg: number; cell: number; speed: number; }

function MintedCard({ lf }: { lf: JsLifeform }) {
  const { t } = useT();
  const { sdk } = useGolSdk();
  const [rp, setRp] = useState<RenderParams | null>(null);
  const id = tokenIdDecimal(lf.token_id);
  const kind = t(lifeformKind(lf));
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
      aria-label={t({ fr: `Créature ${id}, ${kind}, âge ${lf.age}`, en: `Lifeform ${id}, ${kind}, age ${lf.age}` })}
    >
      <div className="dish">
        <Creature
          rows={lf.current_state}
          age={ageToScale(lf.age)}
          bg={rp?.bg}
          cell={rp?.cell}
          speed={rp?.speed}
          variant={lf.is_dead ? "dead" : "living"}
          ariaLabel={t({ fr: `créature ${kind} ${id}`, en: `${kind} lifeform ${id}` })}
        />
      </div>
      <div className="cmeta">
        <span className="ckind">{kind}</span>
      </div>
      <div className="cfoot">
        <span className="age-dot" style={{ background: dotCss, boxShadow: lf.is_dead ? "none" : `0 0 7px ${dotCss}` }} />
        {lf.is_dead ? t({ fr: "au repos", en: "rests" }) : t({ fr: "en vie", en: "alive" })} · {t({ fr: "âge", en: "age" })} {lf.age}
      </div>
    </Link>
  );
}

function BeastCard({ beast }: { beast: BeastSeed }) {
  const { t } = useT();
  return (
    <Link
      href={`/life/${beast.key}`}
      className="creature-card potential"
      aria-label={t({ fr: `${beast.name}, ${beast.kind}, pas encore née`, en: `${beast.name}, ${beast.kind}, not yet minted` })}
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
        {t({ fr: "en attente de découverte", en: "waiting to be discovered" })}
      </div>
    </Link>
  );
}

// Given just a token id, hydrate the creature on its own (so the gallery fills in progressively),
// showing a skeleton until its data lands.
function LazyMintedCard({ tokenId }: { tokenId: string }) {
  const { t } = useT();
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
        <span className="cid">{t({ fr: "invocation…", en: "summoning…" })}</span>
      </div>
    </div>
  );
}

/* ---------- path creatures (a transient into a loop, on the separate path NFT) ---------- */
type JsPath = {
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

function PathCard({ pf }: { pf: JsPath }) {
  const { t } = useT();
  const { sdk } = useGolSdk();
  const [rp, setRp] = useState<RenderParams | null>(null);
  const id = tokenIdDecimal(pf.token_id);
  const dead = pf.life_state === "dead";

  useEffect(() => {
    if (!sdk) return;
    let cancelled = false;
    sdk.pathRenderParams(pf.token_id).then((p) => { if (!cancelled && p) setRp(p as RenderParams); });
    return () => { cancelled = true; };
  }, [sdk, pf.token_id]);

  return (
    <Link
      href={`/life/${pf.token_id}`}
      className="creature-card"
      aria-label={t({ fr: `Chemin ${id}, longueur ${pf.sequence_length}`, en: `Path ${id}, length ${pf.sequence_length}` })}
    >
      <div className="dish">
        <Creature
          rows={pf.start_state}
          bg={rp?.bg}
          cell={rp?.cell}
          speed={rp?.speed}
          variant={dead ? "dead" : "living"}
          ariaLabel={t({ fr: `chemin ${id}`, en: `path ${id}` })}
        />
      </div>
      <div className="cmeta">
        <span className="ckind">{t({ fr: "Chemin", en: "Path" })}</span>
      </div>
      <div className="cfoot">
        <span className="age-dot" style={{ background: dead ? "rgb(58,65,80)" : "var(--nut)" }} />
        {dead ? t({ fr: "mort", en: "dead" }) : t({ fr: "chemin", en: "path" })} · {t({ fr: "longueur", en: "length" })} {pf.sequence_length}
      </div>
    </Link>
  );
}

function LazyPathCard({ tokenId }: { tokenId: string }) {
  const { t } = useT();
  const { sdk } = useGolSdk();
  const [pf, setPf] = useState<JsPath | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!sdk) return;
    let cancelled = false;
    sdk.pathLifeform(tokenId).then((p) => {
      if (!cancelled) {
        setPf((p as JsPath) ?? null);
        setDone(true);
      }
    });
    return () => { cancelled = true; };
  }, [sdk, tokenId]);

  if (pf) return <PathCard pf={pf} />;
  if (done) return null; // burned / not found — drop it from the gallery
  return (
    <div className="creature-card" aria-busy="true">
      <div className="dish" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span className="spinner" />
      </div>
      <div className="cmeta">
        <span className="cid">{t({ fr: "invocation…", en: "summoning…" })}</span>
      </div>
    </div>
  );
}

export default function CreatureCard(props: { lf?: JsLifeform; beast?: BeastSeed; tokenId?: string; kind?: "loop" | "path" }) {
  if (props.lf) return <MintedCard lf={props.lf} />;
  if (props.tokenId) return props.kind === "path" ? <LazyPathCard tokenId={props.tokenId} /> : <LazyMintedCard tokenId={props.tokenId} />;
  if (props.beast) return <BeastCard beast={props.beast} />;
  return null;
}
