"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import GolCanvas from "@/components/GolCanvas";
import { useGolSdk } from "@/lib/sdk";
import { useWallet } from "@/lib/wallet";
import { useMint } from "@/lib/useMint";
import { fromRows } from "@/lib/creatures";
import { formatNut, shortAddr } from "@/lib/format";
import { explorerTxUrl } from "@/lib/config";
import { useT } from "@/lib/i18n";
import {
  listBookmarks,
  listMintProgress,
  removeBookmark,
  clearMintProgress,
  type Bookmark,
  type MintProgress,
  type CreatureKind,
} from "@/lib/incubator";

export default function IncubatorPage() {
  const { t } = useT();
  const { sdk } = useGolSdk();
  const { address, connect, onSepolia, switchToSepolia, txEpoch } = useWallet();
  const { status, txHash, error, progress, stalled, continueMint, mint, mintPath, reset } = useMint();
  const router = useRouter();

  const [pending, setPending] = useState<MintProgress[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [nutHex, setNutHex] = useState<string | null>(null);

  // Spawning charges the loop's period in $NUT (18 decimals). Read the connected balance so we can
  // stop the user before they start a mint they can't pay for. Refetch on txEpoch (feeding earns NUT).
  useEffect(() => {
    let cancelled = false;
    if (sdk && address) {
      sdk
        .nutBalance(address)
        .then((hex: string) => !cancelled && setNutHex(hex))
        .catch(() => !cancelled && setNutHex(null));
    } else {
      setNutHex(null);
    }
    return () => {
      cancelled = true;
    };
  }, [sdk, address, txEpoch]);

  const nutWei = nutHex !== null ? BigInt(nutHex) : null;
  const nutDisplay = nutHex !== null ? formatNut(nutHex) : "…";
  // Unknown balance (still loading / read failed) → don't block; the tx-time error is the fallback.
  const affordable = (period: number) => nutWei === null || nutWei >= BigInt(period) * 10n ** 18n;

  // Which incubator entries are already minted on-chain. A mint can finish on-chain while its local
  // progress lingers (e.g. the tab reloaded mid-mint before the flow could clear it) — so we check
  // each entry's token id and, if it exists, show a "born" link instead of a Spawn/Resume that would
  // revert. The stored `id` (for both pending mints and bookmarks) is the token id.
  const [minted, setMinted] = useState<Set<string>>(new Set());
  // Each entry carries its kind so we check the RIGHT NFT (loops on the loop contract, paths on the
  // path contract). Pending mints take precedence over bookmarks for the same id.
  const entries = useMemo(() => {
    const m = new Map<string, CreatureKind>();
    for (const p of pending) m.set(p.id, p.kind ?? "loop");
    for (const b of bookmarks) if (!m.has(b.id)) m.set(b.id, b.kind ?? "loop");
    return Array.from(m, ([id, kind]) => ({ id, kind }));
  }, [pending, bookmarks]);
  useEffect(() => {
    if (!sdk || entries.length === 0) {
      setMinted(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      const found = new Set<string>();
      await Promise.all(
        entries.map(async ({ id, kind }) => {
          try {
            const got = kind === "path" ? await sdk.pathLifeform(id) : await sdk.lifeform(id);
            if (got) found.add(id);
          } catch {
            /* transient read error — treat as unknown (not minted) */
          }
        })
      );
      if (!cancelled) setMinted(found);
    })();
    return () => {
      cancelled = true;
    };
  }, [sdk, entries, txEpoch]);

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

  const run = (e: { id: string; rows: number[]; period: number; kind?: CreatureKind; loopPeriod?: number }) => {
    if (!affordable(e.period)) return; // gated in the UI too; guard against a stale click
    setActiveId(e.id);
    reset();
    if ((e.kind ?? "loop") === "path") void mintPath(e.rows, e.period, e.loopPeriod ?? 1);
    else void mint(e.rows, e.period);
  };

  // Description for an entry: a path shows its distance-to-loop; a loop shows its period.
  const kindLabel = (e: { period: number; kind?: CreatureKind }) =>
    (e.kind ?? "loop") === "path"
      ? t({ fr: `chemin · ${e.period} gén.`, en: `path · ${e.period} gens` })
      : t({ fr: `boucle de période ${e.period}`, en: `period-${e.period} loop` });

  const stepLabel = (id: string) =>
    activeId === id && progress
      ? t({ fr: `Étape ${progress.current}/${progress.total}…`, en: `Step ${progress.current}/${progress.total}…` })
      : null;

  // Shown under a Spawn/Resume button when the wallet can't cover the mint's $NUT cost. NUT is earned
  // by feeding creatures forward, so point there rather than leaving a dead disabled button.
  const nutWarning = (period: number) =>
    affordable(period) ? null : (
      <p className="breathe-hint" style={{ marginTop: 2 }}>
        {t({
          fr: `Pas assez de $NUT : il en faut ${period}, vous en avez ${nutDisplay}. `,
          en: `Not enough $NUT: needs ${period}, you have ${nutDisplay}. `,
        })}
        <Link href="/" className="tx-link">
          {t({ fr: "nourrissez des créatures pour en gagner →", en: "feed creatures to earn some →" })}
        </Link>
      </p>
    );

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
                {kindLabel(p)} · <span className="mono">{shortAddr(p.id)}</span>
              </div>
              <div className="note">{t({ fr: `${p.done}/${p.total} étapes faites`, en: `${p.done}/${p.total} steps done` })}</div>
              {minted.has(p.id) ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <Link className="btn primary" href={`/life/${p.id}`}>{t({ fr: "✓ Née · la rencontrer", en: "✓ Born · meet it" })}</Link>
                  <button className="btn" disabled={busy} onClick={() => { clearMintProgress(p.id); refresh(); }}>
                    {t({ fr: "Retirer d'ici", en: "Clear from here" })}
                  </button>
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="btn primary" disabled={busy || !onSepolia || !affordable(p.period)} onClick={() => run(p)}>
                      {stepLabel(p.id) ?? t({ fr: "Reprendre", en: "Resume" })}
                    </button>
                    <button className="btn" disabled={busy} onClick={() => { clearMintProgress(p.id); refresh(); }}>
                      {t({ fr: "Abandonner", en: "Discard" })}
                    </button>
                  </div>
                  {nutWarning(p.period)}
                </>
              )}
              {activeId === p.id && stalled && status === "signing" && (
                <button className="btn primary" onClick={continueMint}>
                  {t({
                    fr: `Le portefeuille n'affiche rien ? Relancer l'étape${progress ? ` ${progress.current}/${progress.total}` : ""}`,
                    en: `Wallet showing nothing? Re-request step${progress ? ` ${progress.current}/${progress.total}` : ""}`,
                  })}
                </button>
              )}
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
                {kindLabel(b)} · <span className="mono">{shortAddr(b.id)}</span>
              </div>
              {minted.has(b.id) ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <Link className="btn primary" href={`/life/${b.id}`}>{t({ fr: "✓ Née · la rencontrer", en: "✓ Born · meet it" })}</Link>
                  <button className="btn" disabled={busy} onClick={() => { removeBookmark(b.id); refresh(); }}>
                    {t({ fr: "Retirer", en: "Remove" })}
                  </button>
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button className="btn primary" disabled={busy || !onSepolia || !affordable(b.period)} onClick={() => run(b)}>
                      {stepLabel(b.id) ?? t({ fr: `Faire naître · ${b.period} NUT`, en: `Spawn · ${b.period} NUT` })}
                    </button>
                    <button className="btn" disabled={busy} onClick={() => { removeBookmark(b.id); refresh(); }}>
                      {t({ fr: "Retirer", en: "Remove" })}
                    </button>
                  </div>
                  {nutWarning(b.period)}
                </>
              )}
              {activeId === b.id && stalled && status === "signing" && (
                <button className="btn primary" onClick={continueMint}>
                  {t({
                    fr: `Le portefeuille n'affiche rien ? Relancer l'étape${progress ? ` ${progress.current}/${progress.total}` : ""}`,
                    en: `Wallet showing nothing? Re-request step${progress ? ` ${progress.current}/${progress.total}` : ""}`,
                  })}
                </button>
              )}
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
