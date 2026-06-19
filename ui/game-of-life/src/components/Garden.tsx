"use client";

import { useEffect, useState } from "react";
import CreatureCard from "./CreatureCard";
import { useGolSdk } from "@/lib/sdk";
import { BESTIARY } from "@/lib/bestiary";
import type { JsLifeform } from "@/lib/types";

export default function Garden() {
  const { sdk, error } = useGolSdk();
  const [minted, setMinted] = useState<JsLifeform[] | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!sdk) return;
    sdk
      .recentLifeforms(60)
      .then((rows: unknown) => {
        if (!cancelled) setMinted((rows as JsLifeform[]) ?? []);
      })
      .catch((e: unknown) => {
        if (!cancelled) setScanError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [sdk]);

  const initialising = !sdk && !error;
  const scanning = !!sdk && minted === null && !scanError;

  return (
    <div className="wrap">
      {/* Living on Starknet */}
      <section className="garden-section">
        <div className="head">
          <div className="section-label">Living on Starknet</div>
          {minted && minted.length > 0 && (
            <span className="note">showing all {minted.length} minted on Sepolia</span>
          )}
        </div>

        {initialising && (
          <p className="status-line">
            <span className="spinner" /> warming up the petri dish…
          </p>
        )}
        {scanning && (
          <p className="status-line">
            <span className="spinner" /> scanning the chain for life…
          </p>
        )}
        {error && <p className="status-line">the petri dish is offline — {error}</p>}
        {scanError && <p className="status-line">couldn’t scan the chain — {scanError}</p>}

        {minted && minted.length === 0 && !scanError && (
          <p className="status-line">no creatures minted yet — be the first to set one free below.</p>
        )}

        {minted && minted.length > 0 && (
          <div className="garden-grid">
            {minted.map((lf) => (
              <CreatureCard key={lf.token_id} lf={lf} />
            ))}
          </div>
        )}
      </section>

      {/* Waiting to be discovered */}
      <section className="garden-section">
        <div className="head">
          <div className="section-label">Waiting to be discovered</div>
          <span className="note">a reservoir of life · not yet on chain</span>
        </div>
        <div className="garden-grid">
          {BESTIARY.map((b) => (
            <CreatureCard key={b.key} beast={b} />
          ))}
        </div>
      </section>
    </div>
  );
}
