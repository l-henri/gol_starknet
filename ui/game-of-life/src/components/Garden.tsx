"use client";

import { useEffect, useState } from "react";
import CreatureCard from "./CreatureCard";
import { useGolSdk } from "@/lib/sdk";

export default function Garden() {
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
      {/* Living on Starknet */}
      <section className="garden-section">
        <div className="head">
          <div className="section-label">Living on Starknet</div>
          {ids && ids.length > 0 && (
            <span className="note">showing all {ids.length} minted on Sepolia</span>
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

        {ids && ids.length === 0 && !scanError && (
          <p className="status-line">no creatures minted yet — be the first to set one free below.</p>
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
