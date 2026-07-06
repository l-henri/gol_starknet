"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import Creature from "@/components/Creature";
import { useGolSdk } from "@/lib/sdk";
import { useWallet } from "@/lib/wallet";
import { usePet, daysLeft, type BondState } from "@/lib/usePet";
import { shortAddr } from "@/lib/format";
import { useT } from "@/lib/i18n";
import type { JsLifeform } from "@/lib/types";

interface Ward {
  creatureId: string;
  holder: string;
  bond: BondState;
  lifeform: JsLifeform | null; // null = burned creature (orphaned bond)
}

/** The caretaker page: your wards (bond clocks + pet), and the reaper feed (lapsed bonds). */
export default function PetsPage() {
  const { t } = useT();
  const { sdk } = useGolSdk();
  const { address, connect, onSepolia, switchToSepolia, txEpoch } = useWallet();
  const { status, error, pet, reap, reset } = usePet();
  const [wards, setWards] = useState<Ward[] | null>(null);
  const [reapables, setReapables] = useState<Ward[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  // The caretaker graph: every (creature, holder) that ever petted, filtered by live bond status.
  useEffect(() => {
    if (!sdk) return;
    let cancelled = false;
    (async () => {
      try {
        const pairs = (await sdk.petPairs()) as { creature_id: string; holder: string }[];
        const seen = new Set<string>();
        const active: Ward[] = [];
        for (const p of pairs) {
          const key = `${p.creature_id}:${p.holder}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const b = (await sdk.bondStatus(p.creature_id, p.holder)) as {
            held: boolean;
            last_pet: number;
            reapable: boolean;
          };
          if (!b.held) continue;
          const lifeform = (await sdk.lifeform(p.creature_id).catch(() => null)) as JsLifeform | null;
          active.push({
            creatureId: p.creature_id,
            holder: p.holder,
            bond: { held: b.held, lastPet: b.last_pet, reapable: b.reapable },
            lifeform,
          });
        }
        if (cancelled) return;
        setWards(address ? active.filter((w) => BigInt(w.holder) === BigInt(address)) : []);
        setReapables(active.filter((w) => w.bond.reapable));
      } catch {
        if (!cancelled) {
          setWards([]);
          setReapables([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sdk, address, txEpoch]);

  const busy = status === "signing" || status === "pending";
  const act = useCallback(
    (id: string, fn: () => Promise<boolean>) => {
      setActiveId(id);
      if (status === "error") reset();
      void fn();
    },
    [status, reset]
  );

  const clockLabel = (bond: BondState) => {
    const left = daysLeft(bond);
    if (left === null) return "";
    if (left <= 0) return t({ fr: "lien fané", en: "bond wilted" });
    return left >= 1
      ? t({ fr: `encore ${Math.floor(left)} j`, en: `${Math.floor(left)} days left` })
      : t({ fr: `encore ${Math.max(1, Math.round(left * 24))} h`, en: `${Math.max(1, Math.round(left * 24))} hours left` });
  };

  return (
    <div className="wrap">
      <section className="hero">
        <span className="kicker">{t({ fr: "Le lien qui les garde en vie", en: "The bond that keeps them alive" })}</span>
        <h1>{t({ fr: "Mes protégés", en: "My wards" })}</h1>
        <p className="thesis">
          {t({
            fr: "Une caresse est un souffle : elle nourrit la créature d'une génération, vous rapporte 1 $NUT, et ravive votre lien pour 7 jours. Un lien délaissé fane — et n'importe qui peut le récolter.",
            en: "A pet is a breath: it feeds the creature one generation, earns you 1 $NUT, and renews your bond for 7 days. A neglected bond wilts — and anyone may reap it.",
          })}
        </p>
      </section>

      <h3 className="section-label" style={{ marginTop: 20 }}>{t({ fr: "Protégés", en: "Wards" })}</h3>
      {!address ? (
        <button className="btn primary" onClick={connect}>{t({ fr: "Connectez-vous pour voir vos protégés", en: "Connect to see your wards" })}</button>
      ) : wards === null ? (
        <p className="dim">{t({ fr: "Lecture de la chaîne…", en: "Reading the chain…" })}</p>
      ) : wards.length === 0 ? (
        <p className="dim">
          {t({ fr: "Aucun protégé — adoptez une créature du ", en: "No wards yet — adopt a creature from the " })}
          <Link href="/" className="tx-link">{t({ fr: "jardin", en: "garden" })}</Link>.
        </p>
      ) : (
        <ol className="board">
          {wards.map((w) => (
            <li key={w.creatureId}>
              <span className="board-row">
                <span className="board-thumb">
                  {w.lifeform ? <Creature rows={w.lifeform.current_state} res={96} animate={false} /> : <span className="dim">✕</span>}
                </span>
                <span className="board-what">
                  {w.lifeform ? (
                    <Link href={`/life/${w.creatureId}`} className="tx-link mono">{shortAddr(w.creatureId)}</Link>
                  ) : (
                    <span className="dim">{t({ fr: "créature disparue", en: "creature gone" })}</span>
                  )}
                  <span className={daysLeft(w.bond)! <= 1 ? "breathe-err" : "dim"}> · {clockLabel(w.bond)}</span>
                </span>
                {w.lifeform && onSepolia && (
                  <button
                    className="btn primary"
                    disabled={busy}
                    onClick={() => act(w.creatureId, () => pet(w.creatureId))}
                  >
                    {activeId === w.creatureId && busy
                      ? t({ fr: "Caresse…", en: "Petting…" })
                      : t({ fr: "🤲 Caresser", en: "🤲 Pet" })}
                  </button>
                )}
                {!onSepolia && address && (
                  <button className="btn" onClick={switchToSepolia}>{t({ fr: "Passer sur Sepolia", en: "Switch to Sepolia" })}</button>
                )}
              </span>
              {activeId === w.creatureId && status === "error" && error && <p className="breathe-err">{error}</p>}
            </li>
          ))}
        </ol>
      )}

      <h3 className="section-label" style={{ marginTop: 32 }}>{t({ fr: "À récolter", en: "The reaper's rounds" })}</h3>
      <p className="dim">
        {t({
          fr: "Liens fanés, tous gardiens confondus — récolter un lien délaissé rapporte 1 $NUT.",
          en: "Wilted bonds across all caretakers — reaping a neglected bond earns 1 $NUT.",
        })}
      </p>
      {reapables === null ? (
        <p className="dim">{t({ fr: "Lecture de la chaîne…", en: "Reading the chain…" })}</p>
      ) : reapables.length === 0 ? (
        <p className="dim">{t({ fr: "Tous les liens sont entretenus — le jardin est bien gardé.", en: "Every bond is tended — the garden is well kept." })}</p>
      ) : (
        <ol className="board">
          {reapables.map((w) => (
            <li key={`${w.creatureId}:${w.holder}`}>
              <span className="board-row">
                <span className="board-thumb">
                  {w.lifeform ? <Creature rows={w.lifeform.current_state} res={96} animate={false} /> : <span className="dim">✕</span>}
                </span>
                <span className="board-what">
                  <span className="mono">{shortAddr(w.holder)}</span>
                  <span className="dim"> · {t({ fr: "lien fané sur", en: "wilted bond on" })} </span>
                  <span className="mono">{shortAddr(w.creatureId)}</span>
                </span>
                {address && onSepolia && (
                  <button
                    className="btn"
                    disabled={busy}
                    onClick={() => act(`${w.creatureId}:${w.holder}`, () => reap(w.creatureId, w.holder))}
                  >
                    {activeId === `${w.creatureId}:${w.holder}` && busy
                      ? t({ fr: "Récolte…", en: "Reaping…" })
                      : t({ fr: "Récolter · 1 $NUT", en: "Reap · 1 $NUT" })}
                  </button>
                )}
              </span>
              {activeId === `${w.creatureId}:${w.holder}` && status === "error" && error && (
                <p className="breathe-err">{error}</p>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
