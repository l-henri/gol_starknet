"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import GolCanvas from "@/components/GolCanvas";
import { useWallet } from "@/lib/wallet";
import { useMint } from "@/lib/useMint";
import { fromRows } from "@/lib/creatures";
import { shortAddr } from "@/lib/format";
import { explorerTxUrl } from "@/lib/config";
import { useT } from "@/lib/i18n";
import {
  listBookmarks,
  listMintProgress,
  removeBookmark,
  clearMintProgress,
  type Bookmark,
  type MintProgress,
} from "@/lib/incubator";

export default function IncubatorPage() {
  const { t } = useT();
  const { address, connect, onSepolia, switchToSepolia } = useWallet();
  const { status, txHash, error, progress, mint, reset } = useMint();
  const router = useRouter();

  const [pending, setPending] = useState<MintProgress[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setPending(listMintProgress());
    setBookmarks(listBookmarks());
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  // on a confirmed mint: it's no longer pending/bookmarked — clean up and go meet the creature.
  useEffect(() => {
    if (status === "confirmed" && activeId) {
      removeBookmark(activeId);
      clearMintProgress(activeId);
      const id = activeId;
      const to = setTimeout(() => router.push(`/life/${id}`), 1000);
      return () => clearTimeout(to);
    }
  }, [status, activeId, router]);

  // keep the lists in sync as a paused mint records progress, etc.
  useEffect(() => {
    if (status === "error" || status === "idle") refresh();
  }, [status, refresh]);

  const busy = status === "signing" || status === "pending";

  const run = (id: string, rows: number[], period: number) => {
    setActiveId(id);
    reset();
    void mint(rows, period);
  };

  const stepLabel = (id: string) =>
    activeId === id && progress
      ? t({ fr: `Étape ${progress.current}/${progress.total}…`, en: `Step ${progress.current}/${progress.total}…` })
      : null;

  return (
    <div className="wrap" style={{ padding: "32px 0 64px" }}>
      <div className="head">
        <div className="section-label">{t({ fr: "Incubateur", en: "Incubator" })}</div>
        <Link href="/create" className="note">{t({ fr: "+ créer", en: "+ create" })}</Link>
      </div>
      <p className="dim" style={{ maxWidth: "54ch" }}>
        {t({
          fr: "Vos naissances en cours et vos motifs gardés — stockés sur cet appareil.",
          en: "Your in-progress mints and saved patterns — kept on this device.",
        })}
      </p>

      {!address ? (
        <div className="callout" style={{ marginTop: 16 }}>
          <button className="btn primary" onClick={connect}>{t({ fr: "Connectez-vous", en: "Connect wallet" })}</button>
        </div>
      ) : !onSepolia ? (
        <div className="callout" style={{ marginTop: 16 }}>
          <button className="btn primary" onClick={switchToSepolia}>{t({ fr: "Passez sur Sepolia", en: "Switch to Sepolia" })}</button>
        </div>
      ) : null}

      <h3 className="section-label" style={{ marginTop: 28 }}>{t({ fr: "Naissances en cours", en: "In-progress mints" })}</h3>
      {pending.length === 0 ? (
        <p className="note">{t({ fr: "Aucune naissance en cours.", en: "Nothing in progress." })}</p>
      ) : (
        <div className="garden-grid">
          {pending.map((p) => (
            <div key={p.id} className="callout" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <GolCanvas cells={fromRows(p.rows)} cellColor="#7ef9a0" />
              <div className="note">
                {t({ fr: `boucle de période ${p.period}`, en: `period-${p.period} loop` })} · <span className="mono">{shortAddr(p.id)}</span>
              </div>
              <div className="note">{t({ fr: `${p.done}/${p.total} étapes faites`, en: `${p.done}/${p.total} steps done` })}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn primary" disabled={busy || !onSepolia} onClick={() => run(p.id, p.rows, p.period)}>
                  {stepLabel(p.id) ?? t({ fr: "Reprendre", en: "Resume" })}
                </button>
                <button className="btn" disabled={busy} onClick={() => { clearMintProgress(p.id); refresh(); }}>
                  {t({ fr: "Abandonner", en: "Discard" })}
                </button>
              </div>
              {activeId === p.id && status === "error" && error && <p className="breathe-err">{error}</p>}
            </div>
          ))}
        </div>
      )}

      <h3 className="section-label" style={{ marginTop: 28 }}>{t({ fr: "Gardées", en: "Bookmarks" })}</h3>
      {bookmarks.length === 0 ? (
        <p className="note">{t({ fr: "Rien de gardé. Gardez un motif depuis Créer.", en: "Nothing saved. Bookmark a pattern from Create." })}</p>
      ) : (
        <div className="garden-grid">
          {bookmarks.map((b) => (
            <div key={b.id} className="callout" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <GolCanvas cells={fromRows(b.rows)} cellColor="#9ad1ff" />
              <div className="note">
                {t({ fr: `boucle de période ${b.period}`, en: `period-${b.period} loop` })} · <span className="mono">{shortAddr(b.id)}</span>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn primary" disabled={busy || !onSepolia} onClick={() => run(b.id, b.rows, b.period)}>
                  {stepLabel(b.id) ?? t({ fr: `Faire naître · ${b.period} NUT`, en: `Spawn · ${b.period} NUT` })}
                </button>
                <button className="btn" disabled={busy} onClick={() => { removeBookmark(b.id); refresh(); }}>
                  {t({ fr: "Retirer", en: "Remove" })}
                </button>
              </div>
              {activeId === b.id && status === "error" && error && <p className="breathe-err">{error}</p>}
            </div>
          ))}
        </div>
      )}

      {txHash && (status === "pending" || status === "confirmed") && (
        <a className="tx-link" href={explorerTxUrl(txHash)} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 14 }}>
          {t({ fr: "voir la tx ↗", en: "view tx ↗" })}
        </a>
      )}
    </div>
  );
}
