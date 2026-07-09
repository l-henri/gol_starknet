"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import GolCanvas from "@/components/GolCanvas";
import { useGolSdk } from "@/lib/sdk";
import { useWallet } from "@/lib/wallet";
import { useMint } from "@/lib/useMint";
import { fromRows } from "@/lib/creatures";
import {
  listBookmarks,
  listMintProgress,
  removeBookmark,
  clearMintProgress,
  type Bookmark,
  type MintProgress,
  type CreatureKind,
} from "@/lib/incubator";

/* ------------------------------------------------------------------ *
 * /incubator — a workbench for eggs not yet hatched.
 *   • Mints in progress: big creatures mid-signing; resume to hatch.
 *   • Saved patterns: seeds kept from /create, to open and set free.
 * Progress shows as a warming egg (light rising), never a progress bar.
 * ------------------------------------------------------------------ */

const kindLabel = (kind: CreatureKind | undefined, period: number) =>
  (kind ?? "loop") === "path" ? `wanderer · ${period} gens` : `period-${period} ${period === 1 ? "still life" : "loop"}`;

/** A warming egg: the pattern under a soft light that rises from the bottom with `pct` (0–100). */
function Egg({ rows, pct, warm, hatched }: { rows: number[]; pct: number; warm?: boolean; hatched?: boolean }) {
  return (
    <div className={"egg" + (warm ? " warm" : "") + (hatched ? " hatched" : "")}>
      <div className="egg-pattern">
        <GolCanvas cells={fromRows(rows)} cellColor={hatched ? "#22c55e" : warm ? "#ffc98a" : "#5b6472"} bg="#070709" showGrid={false} size={220} />
      </div>
      <div className="egg-fill" style={{ height: `${Math.max(0, Math.min(100, pct))}%` }} />
      <div className="egg-shell" />
    </div>
  );
}

export default function IncubatorPage() {
  const { sdk } = useGolSdk();
  const { address, connect, onSepolia, switchToSepolia, txEpoch } = useWallet();
  const { status, error, progress, stalled, continueMint, mint, mintPath, reset } = useMint();
  const router = useRouter();

  const [pending, setPending] = useState<MintProgress[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setPending(listMintProgress());
    setBookmarks(listBookmarks());
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  // saved patterns exclude anything already mid-hatch (that shows under Mints in progress)
  const saved = useMemo(() => {
    const inProgress = new Set(pending.map((p) => p.id));
    return bookmarks.filter((b) => !inProgress.has(b.id));
  }, [bookmarks, pending]);

  // which entries already exist on-chain (a mint can finish while local progress lingers)
  const [minted, setMinted] = useState<Set<string>>(new Set());
  const entries = useMemo(() => {
    const m = new Map<string, CreatureKind>();
    for (const p of pending) m.set(p.id, p.kind ?? "loop");
    for (const b of saved) if (!m.has(b.id)) m.set(b.id, b.kind ?? "loop");
    return Array.from(m, ([id, kind]) => ({ id, kind }));
  }, [pending, saved]);
  useEffect(() => {
    if (!sdk || entries.length === 0) { setMinted(new Set()); return; }
    let cancelled = false;
    (async () => {
      const found = new Set<string>();
      await Promise.all(entries.map(async ({ id, kind }) => {
        try {
          const got = kind === "path" ? await sdk.pathLifeform(id) : await sdk.lifeform(id);
          if (got) found.add(id);
        } catch { /* transient read error — treat as not minted */ }
      }));
      if (!cancelled) setMinted(found);
    })();
    return () => { cancelled = true; };
  }, [sdk, entries, txEpoch]);

  // hatched → clean up local state and go meet the newborn
  useEffect(() => {
    if (status === "confirmed" && activeId) {
      removeBookmark(activeId);
      clearMintProgress(activeId);
      const id = activeId;
      const to = setTimeout(() => router.push(`/life/${id}`), 1100);
      return () => clearTimeout(to);
    }
  }, [status, activeId, router]);

  useEffect(() => { if (status === "error" || status === "idle") refresh(); }, [status, refresh]);

  const busy = status === "signing" || status === "pending";

  const hatch = (e: { id: string; rows: number[]; period: number; kind?: CreatureKind; loopPeriod?: number }) => {
    setActiveId(e.id);
    reset();
    if ((e.kind ?? "loop") === "path") void mintPath(e.rows, e.period, e.loopPeriod ?? 1);
    else void mint(e.rows, e.period);
  };

  const needsWallet = !address || !onSepolia;
  const nothing = pending.length === 0 && saved.length === 0;

  return (
    <div className="wrap incubator">
      <header className="inc-lead">
        <span className="eyebrow">Incubator</span>
        <h1 className="inc-title">Eggs not yet hatched.</h1>
        <p className="inc-sub">Births in progress and the patterns you’ve kept — warming quietly on this device until you’re ready.</p>
      </header>

      {nothing ? (
        <div className="inc-empty">
          <div className="inc-empty-egg"><span /><span /><span /></div>
          <p className="inc-empty-line">No eggs yet.</p>
          <p className="inc-empty-sub">Draw something in Create and save it to hatch later.</p>
          <Link href="/create" className="btn set-free">Go to Create →</Link>
        </div>
      ) : (
        <>
          {needsWallet && (
            <div className="inc-connect">
              {!address ? (
                <button className="btn set-free" onClick={connect}>Connect to hatch your eggs</button>
              ) : (
                <button className="btn set-free" onClick={switchToSepolia}>Switch to Sepolia</button>
              )}
            </div>
          )}

          {/* ---- mints in progress ---- */}
          {pending.length > 0 && (
            <section className="inc-group">
              <div className="inc-group-head">
                <h2>Mints in progress</h2>
                <span className="desc">warming — each needs a few signatures</span>
              </div>
              <div className="egg-grid">
                {pending.map((p) => {
                  const pct = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
                  const isMinted = minted.has(p.id);
                  const active = activeId === p.id;
                  return (
                    <div key={p.id} className="egg-card">
                      <Egg rows={p.rows} pct={isMinted ? 100 : pct} warm hatched={isMinted} />
                      <div className="egg-meta">
                        <span className="egg-kind">{kindLabel(p.kind, p.period)}</span>
                        <span className="egg-sig">{isMinted ? "hatched" : `signatures ${p.done}/${p.total}`}</span>
                      </div>
                      {isMinted ? (
                        <div className="egg-actions">
                          <Link className="btn set-free" href={`/life/${p.id}`}>Meet it →</Link>
                          <button className="btn ghost" disabled={busy} onClick={() => { clearMintProgress(p.id); refresh(); }}>Clear</button>
                        </div>
                      ) : (
                        <div className="egg-actions">
                          <button className="btn set-free" disabled={busy || needsWallet} onClick={() => hatch(p)}>
                            {active && progress ? `Hatching ${progress.current}/${progress.total}…` : "Continue hatching"}
                          </button>
                          <button className="btn ghost" disabled={busy} onClick={() => { clearMintProgress(p.id); refresh(); }}>Discard</button>
                        </div>
                      )}
                      {active && stalled && status === "signing" && (
                        <button className="btn set-free" onClick={continueMint}>
                          Your wallet dozed off — knock again{progress ? ` ${progress.current}/${progress.total}` : ""}
                        </button>
                      )}
                      {active && status === "error" && error && <p className="breathe-err">{error}</p>}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ---- saved patterns ---- */}
          {saved.length > 0 && (
            <section className="inc-group">
              <div className="inc-group-head">
                <h2>Saved patterns</h2>
                <span className="desc">kept from Create — open one to set it free</span>
              </div>
              <div className="egg-grid">
                {saved.map((b) => {
                  const isMinted = minted.has(b.id);
                  const active = activeId === b.id;
                  return (
                    <div key={b.id} className="egg-card">
                      <Egg rows={b.rows} pct={isMinted ? 100 : 0} hatched={isMinted} />
                      <div className="egg-meta">
                        <span className="egg-kind">{kindLabel(b.kind, b.period)}</span>
                        <span className="egg-sig">{isMinted ? "hatched" : "kept"}</span>
                      </div>
                      {isMinted ? (
                        <div className="egg-actions">
                          <Link className="btn set-free" href={`/life/${b.id}`}>Meet it →</Link>
                          <button className="btn ghost" onClick={() => { removeBookmark(b.id); refresh(); }}>Remove</button>
                        </div>
                      ) : (
                        <div className="egg-actions">
                          <Link className="btn set-free" href={`/create?load=${b.id}`}>Open in Create →</Link>
                          <button className="btn ghost" disabled={busy || needsWallet} onClick={() => hatch(b)} title="Set free without editing (big ones warm here)">
                            {active && progress ? `Hatching ${progress.current}/${progress.total}…` : "hatch it here"}
                          </button>
                          <button className="btn ghost" onClick={() => { removeBookmark(b.id); refresh(); }}>Forget</button>
                        </div>
                      )}
                      {active && stalled && status === "signing" && (
                        <button className="btn set-free" onClick={continueMint}>
                          Your wallet dozed off — knock again{progress ? ` ${progress.current}/${progress.total}` : ""}
                        </button>
                      )}
                      {active && status === "error" && error && <p className="breathe-err">{error}</p>}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
