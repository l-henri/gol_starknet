"use client";

import { useEffect, useState } from "react";
import CreatureCard from "./CreatureCard";
import { useGolSdk } from "@/lib/sdk";
import { useT } from "@/lib/i18n";

export default function Garden() {
  const { t } = useT();
  const { sdk, error } = useGolSdk();
  // The fast scan returns just the token ids; each card then hydrates itself, so creatures appear
  // as they're detected instead of all-at-once after a long sequential wait.
  const [ids, setIds] = useState<string[] | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!sdk) return;
    sdk
      .recentTokenIds(60)
      .then((r: unknown) => {
        if (!cancelled) setIds((r as string[]) ?? []);
      })
      .catch((e: unknown) => {
        if (!cancelled) setScanError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [sdk]);

  const initialising = !sdk && !error;
  const scanning = !!sdk && ids === null && !scanError;

  return (
    <div className="wrap">
      <section className="garden-section">
        <div className="head">
          {ids && ids.length > 0 && (
            <span className="note">
              {t({ fr: `les ${ids.length} créatures nées sur Sepolia`, en: `showing all ${ids.length} minted on Sepolia` })}
            </span>
          )}
        </div>

        {initialising && (
          <p className="status-line">
            <span className="spinner" /> {t({ fr: "préchauffage de la boîte de Pétri…", en: "warming up the petri dish…" })}
          </p>
        )}
        {scanning && (
          <p className="status-line">
            <span className="spinner" /> {t({ fr: "on scrute la chaîne à la recherche de vie…", en: "scanning the chain for life…" })}
          </p>
        )}
        {error && (
          <p className="status-line">{t({ fr: "la boîte de Pétri est hors ligne — ", en: "the petri dish is offline — " })}{error}</p>
        )}
        {scanError && (
          <p className="status-line">{t({ fr: "impossible de scruter la chaîne — ", en: "couldn’t scan the chain — " })}{scanError}</p>
        )}

        {ids && ids.length === 0 && !scanError && (
          <p className="status-line">
            {t({ fr: "aucune créature pour l’instant — soyez le premier à en libérer une ci-dessous.", en: "no creatures minted yet — be the first to set one free below." })}
          </p>
        )}

        {ids && ids.length > 0 && (
          <div className="garden-grid">
            {ids.map((id) => (
              <CreatureCard key={id} tokenId={id} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
