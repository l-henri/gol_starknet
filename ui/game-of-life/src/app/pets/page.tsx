"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Creature from "@/components/Creature";
import BreatheControl from "@/components/BreatheControl";
import { useGolSdk } from "@/lib/sdk";
import { useWallet } from "@/lib/wallet";
import { daysLeft, type BondState } from "@/lib/usePet";
import type { JsLifeform } from "@/lib/types";

/* ------------------------------------------------------------------ *
 * /pets (Wards) — the caretaker home. A windowsill of things you're
 * responsible for. Tender, never a scold. Loss-aversion is the gentle
 * engine; hunger surfaces with warmth (amber), never alarm-red.
 * ------------------------------------------------------------------ */

type RP = { bg: number; cell: number; speed: number };
const sameId = (a: string, b: string) => { try { return BigInt(a) === BigInt(b); } catch { return false; } };
const norm = (id: string) => BigInt(id).toString();
const deriveName = (lf: JsLifeform | null | undefined) =>
  lf === undefined ? "…" : !lf ? "a creature, gone" : lf.is_still ? "Still Life" : lf.is_loop ? `Period-${lf.sequence_length} Loop` : "Lifeform";

/* lf: undefined = still hydrating (batch in flight), null = gone (unminted/burned) */
type Ward = { creatureId: string; lf: JsLifeform | null | undefined; bond: BondState; left: number | null };

function clockLabel(left: number | null): { text: string; hungry: boolean } {
  if (left === null) return { text: "…", hungry: false };
  if (left <= 0) return { text: "wilting, a pet revives it", hungry: true };
  if (left < 1) return { text: `${Math.max(1, Math.round(left * 24))} hours until hungry`, hungry: true };
  const d = Math.floor(left);
  return { text: `${d} day${d === 1 ? "" : "s"} until hungry`, hungry: left <= 2 };
}

/* a live grid thumbnail in the creature's own on-chain colours */
function WardThumb({ lf }: { lf: JsLifeform | null | undefined }) {
  const { sdk } = useGolSdk();
  const [rp, setRp] = useState<RP | null>(null);
  useEffect(() => {
    if (!sdk || !lf) return;
    let c = false;
    sdk.renderParams(lf.token_id).then((p) => { if (!c && p) setRp(p as RP); });
    return () => { c = true; };
  }, [sdk, lf]);
  if (lf === undefined) return <div className="ward-thumb" aria-hidden="true" />; // hydrating
  if (!lf) return <div className="ward-thumb gone">✕</div>;
  return (
    <div className="ward-thumb">
      <Creature rows={lf.current_state} bg={rp?.bg} cell={rp?.cell} speed={rp?.speed} variant={lf.is_dead ? "dead" : "living"} animate={!lf.is_dead} res={200} ariaLabel="ward" />
    </div>
  );
}

/* The per-ward breathe: the same rhythmic tap as the creature page — taps join the SHARED breath
   basket, so tapping several wards bundles them into one multicall tx (per creature: N gens +
   N NUT + bond renewed); a confirmed breath bumps txEpoch, which refreshes the ward list + clocks. */
function WardBreathe({ creatureId, voidMode }: { creatureId: string; voidMode?: boolean }) {
  const { address, onAppChain, connect, switchToAppChain } = useWallet();
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="ward-breathe">
      <BreatheControl
        compact
        creatureId={creatureId}
        connected={!!address}
        onAppChain={onAppChain}
        onConnect={connect}
        onSwitch={switchToAppChain}
        voidMode={voidMode}
        onExhaled={(_n, ok, _hash, error) => setErr(ok ? null : error)}
      />
      {err && <p className="breathe-err">{err}</p>}
    </div>
  );
}

export default function WardsPage() {
  const { sdk } = useGolSdk();
  const { address, connect, txEpoch } = useWallet();

  const [entries, setEntries] = useState<Ward[] | null>(null);

  // Only creatures I'VE petted can appear on this page (wards = held bonds, the reaper's rounds =
  // lapsed ones), so the sweep is wallet-sized, never dish-sized. Two batched round-trips: all bond
  // clocks in one JSON-RPC batch, then all lifeform states in one more. Clocks render as soon as
  // the bonds land; thumbnails hydrate right after.
  useEffect(() => {
    if (!sdk || !address) { setEntries(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const pairs = ((await sdk.petPairs()) as { creature_id: string; holder: string }[]) ?? [];
        const seen = new Set<string>();
        const mine: string[] = [];
        for (const p of pairs) {
          if (!sameId(p.holder, address)) continue;
          const k = norm(p.creature_id);
          if (!seen.has(k)) { seen.add(k); mine.push(p.creature_id); }
        }
        if (mine.length === 0) { if (!cancelled) setEntries([]); return; }

        const bonds = ((await sdk.bondStatuses(mine, address)) ?? []) as { creature_id: string; held: boolean; last_pet: number; reapable: boolean }[];
        const base: Ward[] = bonds.map((b, i) => {
          const bond: BondState = { held: b.held, lastPet: b.last_pet, reapable: b.reapable };
          return { creatureId: mine[i], lf: undefined, bond, left: b.held ? daysLeft(bond) : null };
        });
        if (cancelled) return;
        setEntries(base);

        const lfs = ((await sdk.lifeformsBatch(mine)) ?? []) as JsLifeform[];
        if (cancelled) return;
        const byId = new Map(lfs.map((lf) => [norm(lf.token_id), lf]));
        setEntries(base.map((w) => ({ ...w, lf: byId.get(norm(w.creatureId)) ?? null })));
      } catch { if (!cancelled) setEntries([]); }
    })();
    return () => { cancelled = true; };
  }, [sdk, address, txEpoch]);

  const wards = useMemo(() => (entries ?? []).filter((e) => e.bond.held).sort((a, b) => (a.left ?? 0) - (b.left ?? 0)), [entries]);
  const reaped = useMemo(() => (entries ?? []).filter((e) => !e.bond.held), [entries]);

  return (
    <div className="wrap wards">
      <header className="wards-lead">
        <span className="eyebrow">Wards</span>
        <h1 className="wards-title">The ones you keep alive.</h1>
        <p className="wards-sub">A windowsill of small creatures in your care. Breathe one (tap, tap again to go deeper) and its clock resets for another seven days. NUT is a small thank-you for the breath, nothing more.</p>
      </header>

      {!address ? (
        <div className="wards-connect">
          <button className="btn set-free" onClick={connect}>Connect to see your wards</button>
        </div>
      ) : entries === null ? (
        <p className="dim" style={{ marginTop: 24 }}><span className="spinner" /> reading the pack…</p>
      ) : wards.length === 0 && reaped.length === 0 ? (
        <div className="wards-empty">
          <p className="wards-empty-line">No wards yet.</p>
          <p className="wards-empty-sub">Pet a creature in the <Link href="/" className="tx-link">garden</Link> to take one into your care.</p>
        </div>
      ) : (
        <>
          {/* YOUR WARDS */}
          {wards.length > 0 && (
            <section className="wards-group">
              <div className="wards-group-head"><h2>Your wards</h2><span className="desc">soonest to go hungry, first</span></div>
              <div className="ward-grid">
                {wards.map((w) => {
                  const clk = clockLabel(w.left);
                  return (
                    <div key={w.creatureId} className={"ward-card" + (clk.hungry ? " hungry" : "")}>
                      <Link href={`/life/${w.creatureId}`}><WardThumb lf={w.lf} /></Link>
                      <div className="ward-body">
                        <Link href={`/life/${w.creatureId}`} className="ward-name">{deriveName(w.lf)}</Link>
                        <div className={"ward-clock" + (clk.hungry ? " hungry" : "")}>
                          <span className="ward-clock-dot" /> {clk.text}
                        </div>
                        {w.lf && (
                          <div className="ward-actions">
                            <WardBreathe creatureId={w.creatureId} voidMode={!!w.lf?.is_dead} />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* THE REAPER'S ROUNDS */}
          {reaped.length > 0 && (
            <section className="wards-group reaper">
              <div className="wards-group-head"><h2>The reaper’s rounds</h2><span className="desc">bonds that lapsed; the creatures live on</span></div>
              <div className="ward-grid">
                {reaped.map((w) => (
                  <div key={w.creatureId} className="ward-card reaped">
                    <Link href={`/life/${w.creatureId}`}><WardThumb lf={w.lf} /></Link>
                    <div className="ward-body">
                      <Link href={`/life/${w.creatureId}`} className="ward-name">{deriveName(w.lf)}</Link>
                      <p className="reaper-note">The reaper passed. You’re no longer its keeper, but it lives on if others tend it. A breath takes it back into your care.</p>
                      {w.lf && <div className="ward-actions"><WardBreathe creatureId={w.creatureId} voidMode={!!w.lf?.is_dead} /></div>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
