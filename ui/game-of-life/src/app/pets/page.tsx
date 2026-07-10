"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import Creature from "@/components/Creature";
import { useGolSdk } from "@/lib/sdk";
import { useWallet } from "@/lib/wallet";
import { usePet, daysLeft, type BondState } from "@/lib/usePet";
import type { JsLifeform } from "@/lib/types";

/* ------------------------------------------------------------------ *
 * /pets (Wards) — the caretaker home. A windowsill of things you're
 * responsible for. Tender, never a scold. Loss-aversion is the gentle
 * engine; hunger surfaces with warmth (amber), never alarm-red.
 * ------------------------------------------------------------------ */

type RP = { bg: number; cell: number; speed: number };
const sameId = (a: string, b: string) => { try { return BigInt(a) === BigInt(b); } catch { return false; } };
const norm = (id: string) => BigInt(id).toString();
const deriveName = (lf: JsLifeform | null) => (!lf ? "a creature, gone" : lf.is_still ? "Still Life" : lf.is_loop ? `Period-${lf.sequence_length} Loop` : "Lifeform");

async function runPool<T>(items: T[], n: number, worker: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) await worker(items[i++]);
  }));
}

// A hand-off (daycare loan) looks identical on-chain to a lapse: both leave you no longer holding the
// bond. Remember what you lent so the UI can tell "being pet-sat" from "the reaper passed."
const LENT_KEY = "gol:lent";
const readLent = (): Set<string> => { try { return new Set(JSON.parse(localStorage.getItem(LENT_KEY) || "[]")); } catch { return new Set(); } };
const addLent = (id: string) => { const s = readLent(); s.add(norm(id)); localStorage.setItem(LENT_KEY, JSON.stringify([...s])); };
const isLent = (id: string) => readLent().has(norm(id));

type Ward = { creatureId: string; lf: JsLifeform | null; bond: BondState; pettedByMe: boolean; left: number | null; lent: boolean };

function clockLabel(left: number | null): { text: string; hungry: boolean } {
  if (left === null) return { text: "—", hungry: false };
  if (left <= 0) return { text: "wilting — a pet revives it", hungry: true };
  if (left < 1) return { text: `${Math.max(1, Math.round(left * 24))} hours until hungry`, hungry: true };
  const d = Math.floor(left);
  return { text: `${d} day${d === 1 ? "" : "s"} until hungry`, hungry: left <= 2 };
}

/* a live grid thumbnail in the creature's own on-chain colours */
function WardThumb({ lf }: { lf: JsLifeform | null }) {
  const { sdk } = useGolSdk();
  const [rp, setRp] = useState<RP | null>(null);
  useEffect(() => {
    if (!sdk || !lf) return;
    let c = false;
    sdk.renderParams(lf.token_id).then((p) => { if (!c && p) setRp(p as RP); });
    return () => { c = true; };
  }, [sdk, lf]);
  if (!lf) return <div className="ward-thumb gone">✕</div>;
  return (
    <div className="ward-thumb">
      <Creature rows={lf.current_state} bg={rp?.bg} cell={rp?.cell} speed={rp?.speed} variant={lf.is_dead ? "dead" : "living"} animate={!lf.is_dead} res={200} ariaLabel="ward" />
    </div>
  );
}

export default function WardsPage() {
  const { sdk } = useGolSdk();
  const { address, connect, onSepolia, switchToSepolia, execute, waitForTx, txEpoch } = useWallet();
  const { status: petStatus, error: petError, pet, reset: petReset } = usePet();

  const [entries, setEntries] = useState<Ward[] | null>(null);
  const [epoch, setEpoch] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(null);

  // daycare transfer (per-card)
  const [dcId, setDcId] = useState<string | null>(null);
  const [dcTo, setDcTo] = useState("");
  const [dcStatus, setDcStatus] = useState<"idle" | "signing" | "pending" | "confirmed" | "error">("idle");
  const [dcErr, setDcErr] = useState<string | null>(null);

  // walk the bond graph: for every creature with bond activity, is it held by me? did I pet it?
  useEffect(() => {
    if (!sdk || !address) { setEntries(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const pairs = ((await sdk.petPairs()) as { creature_id: string; holder: string }[]) ?? [];
        const myPetted = new Set(pairs.filter((p) => sameId(p.holder, address)).map((p) => norm(p.creature_id)));
        const origById = new Map<string, string>();
        for (const p of pairs) { const k = norm(p.creature_id); if (!origById.has(k)) origById.set(k, p.creature_id); }
        const out: Ward[] = [];
        await runPool([...origById.keys()], 6, async (key) => {
          const cid = origById.get(key)!;
          try {
            const b = (await sdk.bondStatus(cid, address)) as { held: boolean; last_pet: number; reapable: boolean };
            const pettedByMe = myPetted.has(key);
            if (!b.held && !pettedByMe) return;
            const lf = (await sdk.lifeform(cid).catch(() => null)) as JsLifeform | null;
            const bond: BondState = { held: b.held, lastPet: b.last_pet, reapable: b.reapable };
            out.push({ creatureId: cid, lf, bond, pettedByMe, left: b.held ? daysLeft(bond) : null, lent: !b.held && isLent(cid) });
          } catch { /* skip this creature */ }
        });
        if (!cancelled) setEntries(out);
      } catch { if (!cancelled) setEntries([]); }
    })();
    return () => { cancelled = true; };
  }, [sdk, address, epoch, txEpoch]);

  // a confirmed pet → refresh the clocks
  useEffect(() => {
    if (petStatus === "confirmed") {
      setEpoch((e) => e + 1);
      const t = setTimeout(() => petReset(), 1800);
      return () => clearTimeout(t);
    }
  }, [petStatus, petReset]);

  const wards = useMemo(() => (entries ?? []).filter((e) => e.bond.held && e.pettedByMe).sort((a, b) => (a.left ?? 0) - (b.left ?? 0)), [entries]);
  const sitting = useMemo(() => (entries ?? []).filter((e) => e.bond.held && !e.pettedByMe).sort((a, b) => (a.left ?? 0) - (b.left ?? 0)), [entries]);
  const reaped = useMemo(() => (entries ?? []).filter((e) => !e.bond.held && e.pettedByMe && !e.lent), [entries]);
  const lentOut = useMemo(() => (entries ?? []).filter((e) => !e.bond.held && e.pettedByMe && e.lent), [entries]);

  const petBusy = petStatus === "signing" || petStatus === "pending";
  const doPet = useCallback((cid: string) => { setActiveId(cid); if (petStatus === "error") petReset(); void pet(cid); }, [pet, petStatus, petReset]);

  const doTransfer = async (cid: string) => {
    if (!sdk || !dcTo.trim()) return;
    setDcErr(null); setDcStatus("signing");
    try {
      const hash = await execute(sdk.transferBondCall(cid, dcTo.trim()));
      setDcStatus("pending");
      await waitForTx(hash);
      addLent(cid);
      setDcStatus("confirmed");
      setTimeout(() => { setDcId(null); setDcTo(""); setDcStatus("idle"); setEpoch((e) => e + 1); }, 1200);
    } catch (e) {
      setDcErr(e instanceof Error ? e.message.slice(0, 140) : String(e));
      setDcStatus("error");
    }
  };

  const petLabel = (cid: string, adopt = false) => {
    if (activeId === cid && petStatus === "signing") return "Confirm…";
    if (activeId === cid && petStatus === "pending") return "A breath…";
    if (activeId === cid && petStatus === "error") return "Try again";
    return adopt ? "Adopt again" : "Pet";
  };

  const petAction = (cid: string, adopt = false) =>
    !onSepolia ? (
      <button className="btn" onClick={switchToSepolia}>Switch to Sepolia</button>
    ) : (
      <button className="btn set-free" disabled={petBusy && activeId !== cid} onClick={() => doPet(cid)}>{petLabel(cid, adopt)}</button>
    );

  const daycareControl = (cid: string, verb: string) =>
    dcId === cid ? (
      <div className="daycare">
        <input className="dc-input" placeholder="0x… friend's address" value={dcTo} onChange={(e) => setDcTo(e.target.value)} />
        <div className="daycare-row">
          <button className="btn set-free" disabled={dcStatus === "signing" || dcStatus === "pending" || !dcTo.trim()} onClick={() => doTransfer(cid)}>
            {dcStatus === "signing" ? "Confirm…" : dcStatus === "pending" ? "Handing over…" : dcStatus === "confirmed" ? "Handed over" : verb}
          </button>
          <button className="btn ghost" onClick={() => { setDcId(null); setDcErr(null); }}>Cancel</button>
        </div>
        {dcErr && dcId === cid && <p className="breathe-err">{dcErr}</p>}
      </div>
    ) : (
      <button className="btn ghost" onClick={() => { setDcId(cid); setDcErr(null); setDcTo(""); }}>{verb} →</button>
    );

  return (
    <div className="wrap wards">
      <header className="wards-lead">
        <span className="eyebrow">Wards</span>
        <h1 className="wards-title">The ones you keep alive.</h1>
        <p className="wards-sub">A windowsill of small creatures in your care. Pet one and its clock resets for another seven days. NUT is a small thank-you for the breath — nothing more.</p>
      </header>

      {!address ? (
        <div className="wards-connect">
          <button className="btn set-free" onClick={connect}>Connect to see your wards</button>
        </div>
      ) : entries === null ? (
        <p className="dim" style={{ marginTop: 24 }}><span className="spinner" /> reading the pack…</p>
      ) : wards.length === 0 && sitting.length === 0 && reaped.length === 0 && lentOut.length === 0 ? (
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
                            {petAction(w.creatureId)}
                            {daycareControl(w.creatureId, "hand to daycare")}
                          </div>
                        )}
                        {activeId === w.creatureId && petStatus === "error" && petError && <p className="breathe-err">{petError}</p>}
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
              <div className="wards-group-head"><h2>The reaper’s rounds</h2><span className="desc">bonds that lapsed — the creatures live on</span></div>
              <div className="ward-grid">
                {reaped.map((w) => (
                  <div key={w.creatureId} className="ward-card reaped">
                    <Link href={`/life/${w.creatureId}`}><WardThumb lf={w.lf} /></Link>
                    <div className="ward-body">
                      <Link href={`/life/${w.creatureId}`} className="ward-name">{deriveName(w.lf)}</Link>
                      <p className="reaper-note">The reaper passed. You’re no longer its keeper — but it lives on if others tend it.</p>
                      {w.lf && <div className="ward-actions">{petAction(w.creatureId, true)}</div>}
                      {activeId === w.creatureId && petStatus === "error" && petError && <p className="breathe-err">{petError}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* DAYCARE */}
          <section className="wards-group">
            <div className="wards-group-head"><h2>Daycare</h2><span className="desc">hand a bond to a friend to pet-sit while you’re away</span></div>
            <p className="dim" style={{ maxWidth: "56ch", marginTop: "-0.4em" }}>
              Hand a ward to a friend and they keep it alive (and get the small NUT for each breath), then hand it back whenever. Use “hand to daycare” on any ward above.
            </p>

            {sitting.length > 0 && (
              <>
                <h3 className="wards-h3">Sitting for a friend</h3>
                <div className="ward-grid">
                  {sitting.map((w) => {
                    const clk = clockLabel(w.left);
                    return (
                      <div key={w.creatureId} className={"ward-card" + (clk.hungry ? " hungry" : "")}>
                        <Link href={`/life/${w.creatureId}`}><WardThumb lf={w.lf} /></Link>
                        <div className="ward-body">
                          <Link href={`/life/${w.creatureId}`} className="ward-name">{deriveName(w.lf)}</Link>
                          <div className={"ward-clock" + (clk.hungry ? " hungry" : "")}><span className="ward-clock-dot" /> {clk.text}</div>
                          {w.lf && <div className="ward-actions">{petAction(w.creatureId)}{daycareControl(w.creatureId, "hand back")}</div>}
                          {activeId === w.creatureId && petStatus === "error" && petError && <p className="breathe-err">{petError}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {lentOut.length > 0 && (
              <>
                <h3 className="wards-h3">Out at daycare</h3>
                <ul className="lent-list">
                  {lentOut.map((w) => (
                    <li key={w.creatureId}>
                      <Link href={`/life/${w.creatureId}`} className="ward-name-sm">{deriveName(w.lf)}</Link>
                      <span className="dim"> · with a friend, being kept alive</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
