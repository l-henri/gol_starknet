"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Creature from "@/components/Creature";
import { useGolSdk } from "@/lib/sdk";
import { liveCountRows } from "@/lib/creatures";
import { shortAddr } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { JsLifeform } from "@/lib/types";

// Starknet Sepolia produces a block every ~30s → ~20k blocks ≈ one week. The "discovery of the
// week" window is block-based (no per-block timestamp fetches), anchored on the newest mint seen.
const WEEK_BLOCKS = 20_000;
const TOP = 10;

interface JsPathLite {
  token_id: string;
  life_state: string;
  sequence_length: number;
  start_state: number[];
}

interface Mint {
  token_id: string;
  block: number;
}

interface Breather {
  address: string;
  generations: number;
}

type Fresh = { id: string; kind: "loop" | "path"; length: number; block: number; rows: number[] };

export default function LeaderboardsPage() {
  const { t } = useT();
  const { sdk, error: sdkError } = useGolSdk();

  const [loops, setLoops] = useState<JsLifeform[] | null>(null);
  const [paths, setPaths] = useState<JsPathLite[] | null>(null);
  const [breathers, setBreathers] = useState<Breather[] | null>(null);
  const [caretakers, setCaretakers] = useState<Breather[] | null>(null); // address + active bonds
  const [loopMints, setLoopMints] = useState<Mint[] | null>(null);
  const [pathMints, setPathMints] = useState<Mint[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sdk) return;
    let cancelled = false;
    const guard = <T,>(set: (v: T) => void) => (v: T) => {
      if (!cancelled) set(v);
    };
    sdk.recentLifeforms(0).then(guard(setLoops)).catch(() => guard(setError)(t({ fr: "la boîte de Pétri est hors ligne", en: "the petri dish is offline" })));
    sdk
      .recentPathTokenIds(0)
      .then(async (ids: string[]) => {
        const hydrated = await Promise.all(ids.map((id) => sdk.pathLifeform(id).catch(() => null)));
        guard(setPaths)(hydrated.filter(Boolean) as JsPathLite[]); // burned paths hydrate to null
      })
      .catch(() => guard(setPaths)([]));
    sdk.topBreathers().then(guard(setBreathers)).catch(() => guard(setBreathers)([]));
    // caretakers: active bonds per holder (petPairs deduped, filtered by live bond status)
    sdk
      .petPairs()
      .then(async (pairs: { creature_id: string; holder: string }[]) => {
        const counts = new Map<string, number>();
        const seen = new Set<string>();
        for (const p of pairs) {
          const key = `${p.creature_id}:${p.holder}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const b = (await sdk.bondStatus(p.creature_id, p.holder)) as { held: boolean };
          if (b.held) counts.set(p.holder, (counts.get(p.holder) ?? 0) + 1);
        }
        guard(setCaretakers)(
          Array.from(counts, ([address, generations]) => ({ address, generations })).sort(
            (a, b) => b.generations - a.generations,
          ),
        );
      })
      .catch(() => guard(setCaretakers)([]));
    sdk.recentMints().then(guard(setLoopMints)).catch(() => guard(setLoopMints)([]));
    sdk.recentPathMints().then(guard(setPathMints)).catch(() => guard(setPathMints)([]));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t is render-stable enough for error copy
  }, [sdk]);

  const longestLoops = useMemo(
    () => (loops ?? []).slice().sort((a, b) => b.sequence_length - a.sequence_length).slice(0, TOP),
    [loops],
  );

  // Methuselah score: longest life from the smallest seed (distance-to-loop ÷ starting cells).
  const methuselahs = useMemo(
    () =>
      (paths ?? [])
        .map((p) => ({ ...p, seedCells: Math.max(1, liveCountRows(p.start_state)) }))
        .sort(
          (a, b) =>
            b.sequence_length / b.seedCells - a.sequence_length / a.seedCells ||
            b.sequence_length - a.sequence_length,
        )
        .slice(0, TOP),
    [paths],
  );

  // This week's best discoveries, loops and paths together, ranked by sequence length.
  const fresh: Fresh[] | null = useMemo(() => {
    if (!loopMints || !pathMints || !loops || !paths) return null;
    const newest = Math.max(0, ...loopMints.map((m) => m.block), ...pathMints.map((m) => m.block));
    const floor = newest - WEEK_BLOCKS;
    const byId = new Map(loops.map((l) => [l.token_id, l]));
    const pById = new Map(paths.map((p) => [p.token_id, p]));
    const out: Fresh[] = [];
    for (const m of loopMints) {
      const lf = byId.get(m.token_id);
      if (m.block >= floor && lf)
        out.push({ id: m.token_id, kind: "loop", length: lf.sequence_length, block: m.block, rows: lf.current_state });
    }
    for (const m of pathMints) {
      const p = pById.get(m.token_id);
      if (m.block >= floor && p)
        out.push({ id: m.token_id, kind: "path", length: p.sequence_length, block: m.block, rows: p.start_state });
    }
    return out.sort((a, b) => b.length - a.length || b.block - a.block).slice(0, TOP);
  }, [loopMints, pathMints, loops, paths]);

  const loading = t({ fr: "on scrute la chaîne à la recherche de vie…", en: "scanning the chain for life…" });
  const nobody = t({ fr: "Personne encore — sois le premier.", en: "Nobody yet — be the first." });

  return (
    <>
      <section className="hero wrap">
        <span className="kicker">{t({ fr: "Les records du jardin", en: "Garden records" })}</span>
        <h1>{t({ fr: "Palmarès", en: "Leaderboards" })}</h1>
        <p className="thesis">
          {t({
            fr: "Chaque score se gagne sur la chaîne : découvrir une longue boucle, suivre une vagabonde au long cours, ou donner du souffle aux créatures des autres.",
            en: "Every score is earned on-chain: discover a long loop, follow a far-travelled wanderer, or breathe life into other people’s creatures.",
          })}
        </p>
      </section>

      <section className="garden-section wrap">
        <span className="section-label">{t({ fr: "Boucles les plus longues", en: "Longest loops" })}</span>
        {loops === null && !error && <p className="dim">{loading}</p>}
        {error && <p className="dim">{error}</p>}
        {loops !== null && longestLoops.length === 0 && <p className="dim">{nobody}</p>}
        <ol className="board">
          {longestLoops.map((lf, i) => (
            <li key={lf.token_id}>
              <Link href={`/life/${lf.token_id}`} className="board-row">
                <span className="board-rank mono">{i + 1}</span>
                <span className="board-thumb">
                  <Creature rows={lf.current_state} res={96} animate={i === 0} />
                </span>
                <span className="board-what">
                  {t({ fr: "période", en: "period" })} <strong>{lf.sequence_length}</strong>
                  <span className="dim"> · {t({ fr: "âge", en: "age" })} {lf.age}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section className="garden-section wrap">
        <span className="section-label">{t({ fr: "Mathusalems (vagabondes)", en: "Methuselahs (wanderers)" })}</span>
        <p className="dim">
          {t({
            fr: "La plus longue vie depuis la plus petite graine : distance à la boucle ÷ cellules de départ.",
            en: "The longest life from the smallest seed: distance to the loop ÷ starting cells.",
          })}
        </p>
        {paths === null && <p className="dim">{loading}</p>}
        {paths !== null && methuselahs.length === 0 && <p className="dim">{nobody}</p>}
        <ol className="board">
          {methuselahs.map((p, i) => (
            <li key={p.token_id}>
              <Link href={`/life/${p.token_id}`} className="board-row">
                <span className="board-rank mono">{i + 1}</span>
                <span className="board-thumb">
                  <Creature rows={p.start_state} res={96} animate={false} />
                </span>
                <span className="board-what">
                  {t({ fr: "score", en: "score" })}{" "}
                  <strong>{(p.sequence_length / p.seedCells).toFixed(2)}</strong>
                  <span className="dim">
                    {" "}· {p.sequence_length} {t({ fr: "générations depuis", en: "generations from" })} {p.seedCells}{" "}
                    {t({ fr: "cellules", en: "cells" })}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      <section className="garden-section wrap">
        <span className="section-label">{t({ fr: "Grands souffleurs", en: "Top breathers" })}</span>
        <p className="dim">
          {t({
            fr: "Générations offertes aux créatures du jardin — le geste qui les garde en vie.",
            en: "Generations gifted to the garden’s creatures — the act that keeps them alive.",
          })}
        </p>
        {breathers === null && <p className="dim">{loading}</p>}
        {breathers !== null && breathers.length === 0 && <p className="dim">{nobody}</p>}
        <ol className="board">
          {breathers?.slice(0, TOP).map((b, i) => (
            <li key={b.address}>
              <span className="board-row">
                <span className="board-rank mono">{i + 1}</span>
                <span className="board-what mono">{shortAddr(b.address)}</span>
                <span className="board-what">
                  <strong>{b.generations.toLocaleString()}</strong> {t({ fr: "générations", en: "generations" })}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="garden-section wrap">
        <span className="section-label">{t({ fr: "Gardiens", en: "Caretakers" })}</span>
        <p className="dim">
          {t({
            fr: "Liens de caresse entretenus en ce moment — les créatures qu'ils gardent en vie, semaine après semaine.",
            en: "Caretaker bonds tended right now — the creatures they keep alive, week after week.",
          })}
        </p>
        {caretakers === null && <p className="dim">{loading}</p>}
        {caretakers !== null && caretakers.length === 0 && <p className="dim">{nobody}</p>}
        <ol className="board">
          {caretakers?.slice(0, TOP).map((c, i) => (
            <li key={c.address}>
              <span className="board-row">
                <span className="board-rank mono">{i + 1}</span>
                <span className="board-what mono">{shortAddr(c.address)}</span>
                <span className="board-what">
                  <strong>{c.generations}</strong>{" "}
                  {t({ fr: c.generations === 1 ? "protégé" : "protégés", en: c.generations === 1 ? "ward" : "wards" })}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="garden-section wrap">
        <span className="section-label">{t({ fr: "Découvertes de la semaine", en: "Discoveries of the week" })}</span>
        {fresh === null && !error && <p className="dim">{loading}</p>}
        {fresh !== null && fresh.length === 0 && (
          <p className="dim">{t({ fr: "Rien de neuf cette semaine — à toi de jouer.", en: "Nothing new this week — your move." })}</p>
        )}
        <ol className="board">
          {fresh?.map((f, i) => (
            <li key={f.id}>
              <Link href={`/life/${f.id}`} className="board-row">
                <span className="board-rank mono">{i + 1}</span>
                <span className="board-thumb">
                  <Creature rows={f.rows} res={96} animate={false} />
                </span>
                <span className="board-what">
                  {f.kind === "loop"
                    ? t({ fr: "boucle, période", en: "loop, period" })
                    : t({ fr: "vagabonde, longueur", en: "wanderer, length" })}{" "}
                  <strong>{f.length}</strong>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </section>
      {sdkError && <p className="wrap dim">{sdkError}</p>}
    </>
  );
}
