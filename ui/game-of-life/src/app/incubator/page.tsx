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
 * /incubator — a workbench for eggs not yet hatched. Per-wallet:
 * everything here belongs to the connected account.
 *   • Hatches in progress: big creatures mid-signing; resume to hatch.
 *   • Saved creatures: seeds kept from /create, to open and set free.
 * Progress shows as a warming egg (light rising), never a progress bar.
 * A creature that reaches the chain is removed from the incubator.
 * ------------------------------------------------------------------ */

const kindLabel = (kind: CreatureKind | undefined, period: number) =>
  (kind ?? "loop") === "path" ? `wanderer · ${period} gens` : `period-${period} ${period === 1 ? "still life" : "loop"}`;

/** Same wallet? Compare as integers so hex padding/case never splits an account's incubator. */
const sameAddr = (a?: string | null, b?: string | null) => {
  if (!a || !b) return false;
  try { return BigInt(a) === BigInt(b); } catch { return false; }
};

const createHref = (rows: number[]) => `/create?rows=${encodeURIComponent(rows.join(","))}`;

/** A warming egg: the pattern under a soft light that rises from the bottom with `pct` (0–100). */
function Egg({ rows, pct, warm }: { rows: number[]; pct: number; warm?: boolean }) {
  return (
    <div className={"egg" + (warm ? " warm" : "")}>
      <div className="egg-pattern">
        <GolCanvas cells={fromRows(rows)} cellColor={warm ? "#ffc98a" : "#5b6472"} bg="#070709" showGrid={false} size={220} />
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

  // The incubator is per-wallet: show only what the connected account kept / is mid-hatching.
  const refresh = useCallback(() => {
    setPending(listMintProgress().filter((p) => sameAddr(p.owner, address)));
    setBookmarks(listBookmarks().filter((b) => sameAddr(b.owner, address)));
  }, [address]);
  useEffect(() => { refresh(); }, [refresh]);

  // saved creatures exclude anything already mid-hatch (that shows under Hatches in progress)
  const saved = useMemo(() => {
    const inProgress = new Set(pending.map((p) => p.id));
    return bookmarks.filter((b) => !inProgress.has(b.id));
  }, [bookmarks, pending]);

  const entries = useMemo(() => {
    const m = new Map<string, CreatureKind>();
    for (const p of pending) m.set(p.id, p.kind ?? "loop");
    for (const b of saved) if (!m.has(b.id)) m.set(b.id, b.kind ?? "loop");
    return Array.from(m, ([id, kind]) => ({ id, kind }));
  }, [pending, saved]);

  // a creature that has reached the chain is no longer an egg — drop it from the incubator entirely
  useEffect(() => {
    if (!sdk || entries.length === 0) return;
    let cancelled = false;
    (async () => {
      const hatched: string[] = [];
      await Promise.all(entries.map(async ({ id, kind }) => {
        try {
          const got = kind === "path" ? await sdk.pathLifeform(id) : await sdk.lifeform(id);
          if (got) hatched.push(id);
        } catch { /* transient read error — treat as not minted */ }
      }));
      if (cancelled || hatched.length === 0) return;
      for (const id of hatched) { removeBookmark(id); clearMintProgress(id); }
      refresh();
    })();
    return () => { cancelled = true; };
  }, [sdk, entries, txEpoch, refresh]);

  // hatched here → clean up local state and go meet the newborn
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

  const nothing = pending.length === 0 && saved.length === 0;

  return (
    <div className="wrap incubator">
      <header className="inc-lead">
        <span className="eyebrow">Incubator</span>
        <h1 className="inc-title">Eggs not yet hatched.</h1>
        <p className="inc-sub">Births in progress and the creatures you’ve kept — warming quietly for your wallet until you’re ready.</p>
      </header>

      {!address ? (
        <div className="inc-connect">
          <button className="btn set-free" onClick={connect}>Connect to see your incubator</button>
        </div>
      ) : nothing ? (
        <div className="inc-empty">
          <div className="inc-empty-egg"><span /><span /><span /></div>
          <p className="inc-empty-line">No eggs yet.</p>
          <p className="inc-empty-sub">Draw something in Create and save it to hatch later.</p>
          <Link href="/create" className="btn set-free">Go to Create →</Link>
        </div>
      ) : (
        <>
          {!onSepolia && (
            <div className="inc-connect">
              <button className="btn set-free" onClick={switchToSepolia}>Switch to Sepolia to hatch</button>
            </div>
          )}

          {/* ---- hatches in progress ---- */}
          {pending.length > 0 && (
            <section className="inc-group">
              <div className="inc-group-head">
                <h2>Hatches in progress</h2>
                <span className="desc">warming — each needs a few signatures</span>
              </div>
              <div className="egg-grid">
                {pending.map((p) => {
                  const pct = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
                  const active = activeId === p.id;
                  return (
                    <div key={p.id} className="egg-card">
                      <Egg rows={p.rows} pct={pct} warm />
                      <div className="egg-meta">
                        <span className="egg-kind">{kindLabel(p.kind, p.period)}</span>
                        <span className="egg-sig">{`signatures ${p.done}/${p.total}`}</span>
                      </div>
                      <div className="egg-actions">
                        <button className="btn set-free" disabled={busy || !onSepolia} onClick={() => hatch(p)}>
                          {active && progress ? `Hatching ${progress.current}/${progress.total}…` : "Continue hatching"}
                        </button>
                        <Link className="btn ghost" href={createHref(p.rows)}>Open in Create →</Link>
                        <button className="btn ghost" disabled={busy} onClick={() => { clearMintProgress(p.id); refresh(); }}>Discard</button>
                      </div>
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

          {/* ---- saved creatures ---- */}
          {saved.length > 0 && (
            <section className="inc-group">
              <div className="inc-group-head">
                <h2>Saved creatures</h2>
                <span className="desc">kept from Create — open one to set it free</span>
              </div>
              <div className="egg-grid">
                {saved.map((b) => {
                  const active = activeId === b.id;
                  return (
                    <div key={b.id} className="egg-card">
                      <Egg rows={b.rows} pct={0} />
                      <div className="egg-meta">
                        <span className="egg-kind">{kindLabel(b.kind, b.period)}</span>
                        <span className="egg-sig">kept</span>
                      </div>
                      <div className="egg-actions">
                        <Link className="btn set-free" href={`/create?load=${b.id}`}>Open in Create →</Link>
                        <button className="btn ghost" disabled={busy || !onSepolia} onClick={() => hatch(b)} title="Set free without editing (big ones warm here)">
                          {active && progress ? `Hatching ${progress.current}/${progress.total}…` : "hatch it here"}
                        </button>
                        <button className="btn ghost" onClick={() => { removeBookmark(b.id); refresh(); }}>Forget</button>
                      </div>
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
