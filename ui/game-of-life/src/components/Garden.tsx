"use client";

import { useEffect, useMemo, useState } from "react";
import { BacteriaTile, WandererTile, type JsPath } from "./CreatureCard";
import { useGolSdk } from "@/lib/sdk";
import type { JsLifeform } from "@/lib/types";
import { daysLeft } from "@/lib/usePet";

type Lens = "newly" | "oldest" | "hungry";
const LENS_LABEL: Record<Lens, string> = { newly: "newly set free", oldest: "oldest", hungry: "hungry" };

const SCAN = 120; // how deep to read the mint feed
const HUNGRY_DAYS = 2; // a bond within 2 days of wilting reads as "hungry"

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
  const [lens, setLens] = useState<Lens>("newly");

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

  const orderedLoops = useMemo(() => {
    if (!loops) return null;
    if (lens === "hungry") return loops.filter((lf) => !lf.is_dead && hungry.has(norm(lf.token_id)));
    if (lens === "oldest") return [...loops].reverse(); // earliest set free first — the garden's elders
    return loops; // newly set free (newest first)
  }, [loops, lens, hungry]);

  const orderedPaths = useMemo(() => {
    if (!paths) return null;
    if (lens === "hungry") return []; // wanderers hold no bond — they're never hungry
    if (lens === "oldest") return [...paths].reverse();
    return paths;
  }, [paths, lens]);

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
          <div className="lens" role="group" aria-label="View the garden by">
            {(["newly", "oldest", "hungry"] as Lens[]).map((l) => (
              <button key={l} type="button" className={"lens-btn" + (lens === l ? " on" : "")} aria-pressed={lens === l} onClick={() => setLens(l)}>
                {LENS_LABEL[l]}
              </button>
            ))}
          </div>

          {bothLoaded && total === 0 && (
            <p className="status-line">the dish is empty — be the first to set a creature free.</p>
          )}

          {orderedLoops && orderedLoops.length > 0 && (
            <section className="collection">
              <div className="collection-head">
                <h2>Digital Bacteria</h2>
                <span className="desc">living loops — kept alive by breath</span>
                <span className="count">{orderedLoops.length}</span>
              </div>
              <div className="petri-grid">
                {orderedLoops.map((lf) => (
                  <BacteriaTile key={lf.token_id} lf={lf} hungry={hungry.has(norm(lf.token_id))} />
                ))}
              </div>
            </section>
          )}

          {lens === "hungry" && orderedLoops && orderedLoops.length === 0 && (
            <p className="status-line">every bond is fresh — the garden is well tended.</p>
          )}

          {orderedPaths && orderedPaths.length > 0 && (
            <section className="collection">
              <div className="collection-head">
                <h2>Digital Wanderers</h2>
                <span className="desc">travelling portraits — a moment on the way to a loop</span>
                <span className="count">{orderedPaths.length}</span>
              </div>
              <div className="petri-grid">
                {orderedPaths.map((pf) => <WandererTile key={pf.token_id} pf={pf} />)}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
