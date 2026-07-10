"use client";

import { useEffect, useMemo, useState } from "react";
import { BacteriaTile, WandererTile, FeatureTile, type JsPath, type FeatureData } from "./CreatureCard";
import { useGolSdk } from "@/lib/sdk";
import type { JsLifeform } from "@/lib/types";
import { daysLeft } from "@/lib/usePet";

const SCAN = 120; // how deep to read the mint feed
const HUNGRY_DAYS = 2; // a bond within 2 days of wilting reads as "hungry"
const PAGE = 8; // fewer, bigger tiles — reveal the rest on demand
const FEATURE_POOL = 10; // the "creature of the moment" is drawn from the top-N fed loops / longest journeys

/** Normalise a token id (hex or decimal) to a comparable key. */
const norm = (id: string) => BigInt(id).toString();

/** Run `worker` over `items` with bounded concurrency (kinder to the public RPC gateway). */
async function runPool<T>(items: T[], concurrency: number, worker: (t: T, i: number) => Promise<void>) {
  let next = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await worker(items[i], i);
    }
  });
  await Promise.all(runners);
}

export default function Garden() {
  const { sdk, error } = useGolSdk();
  const [loops, setLoops] = useState<JsLifeform[] | null>(null);
  const [paths, setPaths] = useState<JsPath[] | null>(null);
  const [hungry, setHungry] = useState<Set<string>>(new Set());
  const [featured, setFeatured] = useState<FeatureData | null>(null);
  const [bactLimit, setBactLimit] = useState(PAGE);
  const [wndrLimit, setWndrLimit] = useState(PAGE);

  // The living loops (Digital Bacteria) — one confirmed-live scan, newest first.
  useEffect(() => {
    if (!sdk) return;
    let cancelled = false;
    sdk
      .recentLifeforms(SCAN)
      .then((r) => { if (!cancelled) setLoops((r as JsLifeform[]) ?? []); })
      .catch(() => { if (!cancelled) setLoops([]); });
    return () => { cancelled = true; };
  }, [sdk]);

  // The wanderers (Digital Wanderers) — ids are fast; hydrate each, dropping burned ones, keeping order.
  useEffect(() => {
    if (!sdk) return;
    let cancelled = false;
    (async () => {
      try {
        const ids = ((await sdk.recentPathTokenIds(SCAN)) as string[]) ?? [];
        const slots = new Array<JsPath | null>(ids.length).fill(null);
        await runPool(ids, 8, async (id, i) => {
          slots[i] = (await sdk.pathLifeform(id).catch(() => null)) as JsPath | null;
        });
        if (!cancelled) setPaths(slots.filter((p): p is JsPath => p !== null));
      } catch {
        if (!cancelled) setPaths([]);
      }
    })();
    return () => { cancelled = true; };
  }, [sdk]);

  // "Hungry" isn't a creature flag — it lives on the caretaker bonds. Walk the bond graph once and
  // mark any creature whose keeper is letting the 7-day clock run down (or already lapsed).
  useEffect(() => {
    if (!sdk) return;
    let cancelled = false;
    (async () => {
      try {
        const pairs = ((await sdk.petPairs()) as { creature_id: string; holder: string }[]) ?? [];
        const seen = new Set<string>();
        const uniq = pairs.filter((p) => {
          const k = `${norm(p.creature_id)}:${norm(p.holder)}`;
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
        const hs = new Set<string>();
        await runPool(uniq, 8, async (p) => {
          try {
            const b = (await sdk.bondStatus(p.creature_id, p.holder)) as { held: boolean; last_pet: number; reapable: boolean };
            if (!b.held) return;
            const left = daysLeft({ held: true, lastPet: b.last_pet, reapable: b.reapable });
            if (b.reapable || (left !== null && left <= HUNGRY_DAYS)) hs.add(norm(p.creature_id));
          } catch { /* skip this bond */ }
        });
        if (!cancelled) setHungry(hs);
      } catch { /* no bonds yet / offline — nobody's hungry */ }
    })();
    return () => { cancelled = true; };
  }, [sdk]);

  // The "creature of the moment": one of the most-breathed living loops, or one of the longest
  // journeys (methuselahs). Picked once the chain's been read, so the spotlight stays put for the
  // visit but rotates between visits — always something notable, never the same face every time.
  useEffect(() => {
    if (featured || loops === null || paths === null) return;
    const topFed = loops
      .filter((l) => !l.is_dead)
      .sort((a, b) => b.age - a.age)
      .slice(0, FEATURE_POOL)
      .map((lf): FeatureData => ({ kind: "loop", lf }));
    const methuselahs = paths
      .filter((p) => p.life_state !== "dead")
      .sort((a, b) => b.sequence_length - a.sequence_length)
      .slice(0, FEATURE_POOL)
      .map((pf): FeatureData => ({ kind: "path", pf }));
    const pool = [...topFed, ...methuselahs];
    if (pool.length) setFeatured(pool[Math.floor(Math.random() * pool.length)]);
  }, [loops, paths, featured]);

  // The walls, newest first — excluding whoever's in the spotlight so nobody appears twice.
  const bactWall = useMemo(() => {
    const arr = loops ?? [];
    return featured?.kind === "loop" ? arr.filter((l) => l.token_id !== featured.lf.token_id) : arr;
  }, [loops, featured]);
  const wndrWall = useMemo(() => {
    const arr = paths ?? [];
    return featured?.kind === "path" ? arr.filter((p) => p.token_id !== featured.pf.token_id) : arr;
  }, [paths, featured]);

  const featuredHungry = featured?.kind === "loop" && hungry.has(norm(featured.lf.token_id));

  const booting = !sdk && !error;
  const scanning = !!sdk && loops === null && paths === null && !error;
  const anyReady = (loops !== null || paths !== null) && !error;
  const bothLoaded = loops !== null && paths !== null;
  const total = (loops?.length ?? 0) + (paths?.length ?? 0);

  return (
    <div className="wrap">
      {booting && <p className="status-line"><span className="spinner" /> warming up the petri dish…</p>}
      {scanning && <p className="status-line"><span className="spinner" /> scanning the chain for life…</p>}
      {error && <p className="status-line">the petri dish is offline — {error}</p>}

      {anyReady && (
        <>
          {bothLoaded && total === 0 && (
            <p className="status-line">the dish is empty — be the first to set a creature free.</p>
          )}

          {featured && <FeatureTile data={featured} hungry={!!featuredHungry} />}

          {bactWall.length > 0 && (
            <section className="collection">
              <div className="collection-head">
                <h2>Digital Bacteria</h2>
                <span className="desc">living loops — kept alive by breath</span>
                <span className="count">{loops?.length ?? 0}</span>
              </div>
              <div className="petri-grid">
                {bactWall.slice(0, bactLimit).map((lf) => (
                  <BacteriaTile key={lf.token_id} lf={lf} hungry={hungry.has(norm(lf.token_id))} />
                ))}
              </div>
              {bactWall.length > bactLimit && (
                <div className="petri-more">
                  <button className="lens-btn" onClick={() => setBactLimit((n) => n + PAGE)}>show more</button>
                </div>
              )}
            </section>
          )}

          {wndrWall.length > 0 && (
            <section className="collection">
              <div className="collection-head">
                <h2>Digital Wanderers</h2>
                <span className="desc">travelling portraits — a moment on the way to a loop</span>
                <span className="count">{paths?.length ?? 0}</span>
              </div>
              <div className="petri-grid">
                {wndrWall.slice(0, wndrLimit).map((pf) => <WandererTile key={pf.token_id} pf={pf} />)}
              </div>
              {wndrWall.length > wndrLimit && (
                <div className="petri-more">
                  <button className="lens-btn" onClick={() => setWndrLimit((n) => n + PAGE)}>show more</button>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
