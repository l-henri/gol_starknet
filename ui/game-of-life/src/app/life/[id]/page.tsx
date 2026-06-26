"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Creature from "@/components/Creature";
import { useGolSdk } from "@/lib/sdk";
import { useWallet } from "@/lib/wallet";
import { useBreathe } from "@/lib/useBreathe";
import { useMint } from "@/lib/useMint";
import { findBeast } from "@/lib/bestiary";
import { rowsFromCoords } from "@/lib/creatures";
import { lifeformKind, shortAddr, tokenIdDecimal } from "@/lib/format";
import { explorerTxUrl } from "@/lib/config";
import type { JsLifeform } from "@/lib/types";
import { onchainHtml, LIFEFORM_DESCRIPTION } from "@/lib/onchainRender";

// max generations advanceable in one feed tx; the slider caps at 75% of it. Each generation is a
// separate move_lifeform_forward call (~a v2 step + storage + NUT mint), so the real ceiling is
// gas-bounded — this is a conservative default. (TODO: confirm the gas-safe per-tx max with you.)
const MAX_GEN_STEP = 40;
const FEED_CAP = Math.floor(0.75 * MAX_GEN_STEP);
const SPEED_MAX = 200; // contract invariant: 0 < speed < SPEED_MAX
const toHexColor = (n: number) => "#" + (n & 0xffffff).toString(16).padStart(6, "0");
const fromHexColor = (s: string) => parseInt(s.replace("#", ""), 16) || 0;
const sameId = (a: string, b: string) => {
  try {
    return BigInt(a) === BigInt(b);
  } catch {
    return false;
  }
};

export default function LifePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const beast = findBeast(id);

  if (beast) return <BeastDetail key={id} />;
  return <MintedDetail key={id} id={id} />;
}

/* ---------- a minted, on-chain creature ---------- */
function MintedDetail({ id }: { id: string }) {
  const { sdk, error } = useGolSdk();
  const { address, onSepolia, switchToSepolia, execute, waitForTx } = useWallet();
  const { status, txHash, error: breatheError, breathe, reset, connected } = useBreathe();
  const [lf, setLf] = useState<JsLifeform | null>(null);
  const [rp, setRp] = useState<{ bg: number; cell: number; speed: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [reward, setReward] = useState(false);
  const [feedGen, setFeedGen] = useState(1);
  // owner-editable render params: `edit` starts as the on-chain values; an "Edit creature" tx persists.
  const [edit, setEdit] = useState<{ bg: number; cell: number; speed: number } | null>(null);
  const [editStatus, setEditStatus] = useState<"idle" | "signing" | "pending" | "confirmed" | "error">("idle");
  const [editErr, setEditErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!sdk) return;
    try {
      // No token_uri fetch: the on-chain artifact is rebuilt locally from these cheap reads + the
      // cached template (see onchainRender). lifeform() already covers owner + current_state.
      const [l, p] = await Promise.all([sdk.lifeform(id), sdk.renderParams(id)]);
      if (!l) {
        setNotFound(true);
        return;
      }
      setLf(l as JsLifeform);
      setRp((p as { bg: number; cell: number; speed: number } | null) ?? null);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [sdk, id]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  // keep the editable params synced to the on-chain values (resets after a confirmed edit)
  useEffect(() => {
    if (rp) setEdit({ ...rp });
  }, [rp]);

  // on confirmation: refetch the (now older) creature, flash +1 NUT, then settle
  useEffect(() => {
    if (status !== "confirmed") return;
    setReward(true);
    load();
    const t1 = setTimeout(() => setReward(false), 2600);
    const t2 = setTimeout(() => reset(), 2800);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [status, load, reset]);

  if (error) return <Shell><p className="status-line">the petri dish is offline — {error}</p></Shell>;
  if (loading) return <Shell><p className="status-line"><span className="spinner" /> reading the chain…</p></Shell>;
  if (notFound) return <Shell><p className="status-line">no lifeform #{id} is minted on Sepolia.</p></Shell>;
  if (!lf) return null;

  const kind = lifeformKind(lf);
  const decId = tokenIdDecimal(lf.token_id);
  const busy = status === "signing" || status === "pending";

  const isOwner = !!address && sameId(address, lf.owner);
  const editBusy = editStatus === "signing" || editStatus === "pending";
  const editChanged = !!edit && !!rp && (edit.bg !== rp.bg || edit.cell !== rp.cell || edit.speed !== rp.speed);
  const editInvalid = !!edit && edit.bg === edit.cell;

  const doEdit = async () => {
    if (!sdk || !edit) return;
    if (editStatus === "error") {
      setEditStatus("idle");
      setEditErr(null);
      return;
    }
    setEditErr(null);
    setEditStatus("signing");
    try {
      const calls = sdk.setRenderParamsCall(lf.token_id, edit.bg, edit.cell, edit.speed);
      const hash = await execute(calls);
      setEditStatus("pending");
      await waitForTx(hash);
      setEditStatus("confirmed");
      await load(); // refetch → rp updates → edit re-syncs → "changed" clears
      setTimeout(() => setEditStatus("idle"), 1800);
    } catch (e) {
      setEditErr(e instanceof Error ? e.message : String(e));
      setEditStatus("error");
    }
  };

  return (
    <Shell>
      <div className="detail">
        <div className={`stage${busy ? " inhaling" : ""}`}>
          {/* the exact on-chain render: the contract's renderer, rebuilt locally from the cached
              template + this token's rows/bg/cell/speed (no token_uri fetch). */}
          {rp ? (
            <div className="svg-frame">
              <iframe srcDoc={onchainHtml(lf.current_state, rp.bg, rp.cell, rp.speed)} title={`On-chain renderer for lifeform ${decId}`} sandbox="allow-scripts" style={{ width: "100%", height: "100%", border: 0, background: "var(--bg-dish)" }} />
            </div>
          ) : (
            <div className="svg-frame" style={{ background: "var(--bg-dish)" }}>
              <span className="status-line">reading render params…</span>
            </div>
          )}
          {reward && <span className="nut-float">+{feedGen} NUT</span>}
        </div>

        <div>
          <span className="kicker">{lf.is_alive ? "alive" : "dormant"} · living on Starknet</span>
          <div className="meta-row">
            <Copyable label="owner" value={lf.owner} display={shortAddr(lf.owner)} />
            <Copyable label="token" value={lf.token_id} display={shortAddr(lf.token_id)} />
          </div>

          <div className="trait-grid">
            <Trait t="Kind" v={kind} />
            <Trait t="Sequence length" v={String(lf.sequence_length)} />
            <Trait t="Age" v={`${lf.age} ${lf.age === 1 ? "breath" : "breaths"}`} />
          </div>

          {rp && edit && (
            <div style={{ marginTop: 14 }}>
              <div className="note" style={{ marginBottom: 6 }}>appearance{isOwner ? " · yours to tune" : ""}</div>
              <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center" }}>
                <label className="note" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  background
                  {isOwner ? (
                    <input type="color" value={toHexColor(edit.bg)} onChange={(e) => setEdit({ ...edit, bg: fromHexColor(e.target.value) })} />
                  ) : (
                    <Swatch color={toHexColor(rp.bg)} />
                  )}
                </label>
                <label className="note" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  cell
                  {isOwner ? (
                    <input type="color" value={toHexColor(edit.cell)} onChange={(e) => setEdit({ ...edit, cell: fromHexColor(e.target.value) })} />
                  ) : (
                    <Swatch color={toHexColor(rp.cell)} />
                  )}
                </label>
                <label className="note" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  speed
                  {isOwner ? (
                    <input
                      type="number"
                      min={1}
                      max={SPEED_MAX - 1}
                      value={edit.speed}
                      onChange={(e) => setEdit({ ...edit, speed: Math.max(1, Math.min(SPEED_MAX - 1, Number(e.target.value) || 1)) })}
                      style={{ width: 64 }}
                    />
                  ) : (
                    <span className="mono">{rp.speed}</span>
                  )}
                </label>
              </div>
              {isOwner && editChanged && (
                <div style={{ marginTop: 10 }}>
                  {editInvalid && <p className="breathe-err">background and cell colour must differ</p>}
                  <button className="btn primary" onClick={doEdit} disabled={editBusy || editInvalid}>
                    {editStatus === "signing"
                      ? "Confirm in your wallet…"
                      : editStatus === "pending"
                        ? "Editing… (tx pending)"
                        : editStatus === "confirmed"
                          ? "✓ Edited"
                          : editStatus === "error"
                            ? "Try again"
                            : "Edit creature"}
                  </button>
                  {editErr && editStatus === "error" && <p className="breathe-err">{editErr}</p>}
                </div>
              )}
            </div>
          )}

          <p className="dim" style={{ maxWidth: "46ch" }}>{LIFEFORM_DESCRIPTION}</p>

          {!lf.is_dead && (
            <div className="breathe-block">
              {connected && onSepolia && (
                <label className="note" style={{ display: "block", marginBottom: 8 }}>
                  feed {feedGen} generation{feedGen === 1 ? "" : "s"} · earn {feedGen} $NUT
                  <input
                    type="range"
                    min={1}
                    max={FEED_CAP}
                    value={feedGen}
                    onChange={(e) => setFeedGen(Number(e.target.value))}
                    disabled={busy}
                    style={{ display: "block", width: "100%", maxWidth: 320 }}
                  />
                </label>
              )}
              <button
                className="btn primary breathe-btn"
                onClick={() =>
                  status === "error" ? reset() : connected && !onSepolia ? switchToSepolia() : breathe(decId, feedGen)
                }
                disabled={busy}
              >
                {!connected
                  ? "Connect to feed"
                  : !onSepolia
                    ? "Switch to Sepolia to feed"
                    : status === "signing"
                      ? "Confirm in your wallet…"
                      : status === "pending"
                        ? "Feeding… (tx pending)"
                        : status === "confirmed"
                          ? `✓ Fed · +${feedGen} $NUT`
                          : status === "error"
                            ? "Try again"
                            : `Feed & get ${feedGen} $NUT`}
              </button>
              {txHash && (status === "pending" || status === "confirmed") && (
                <a className="tx-link" href={explorerTxUrl(txHash)} target="_blank" rel="noreferrer">
                  view tx ↗
                </a>
              )}
              {status === "error" && breatheError && <p className="breathe-err">{breatheError}</p>}
              {status === "idle" && connected && (
                <p className="breathe-hint">feed it forward — each generation keeps it alive and earns you 1 $NUT.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}

/* ---------- a not-yet-minted pattern from the bestiary ---------- */
type BeastInfo =
  | { kind: "loading" }
  | { kind: "toolarge" }
  | { kind: "ready"; period: number; smallest: number[]; tokenId: string; minted: boolean };

function BeastDetail() {
  const params = useParams<{ id: string }>();
  const beast = findBeast(params.id)!;
  const router = useRouter();
  const { sdk } = useGolSdk();
  const { address, connect, onSepolia, switchToSepolia } = useWallet();
  const { status, txHash, error, mint, reset } = useMint();
  const [info, setInfo] = useState<BeastInfo>({ kind: "loading" });

  // v2 identity, off-chain via the SDK: the loop's period + canonical (smallest) state, its token
  // id, and whether it's already minted. findLoop/tokenIdForRows are synchronous wasm calls.
  useEffect(() => {
    if (!sdk) return;
    let cancelled = false;
    const rows = rowsFromCoords(beast.coords);
    const loop = sdk.findLoop(new Float64Array(rows), 32) as { period: number; smallest: number[] } | null;
    if (!loop) {
      setInfo({ kind: "toolarge" });
      return;
    }
    const tokenId = sdk.tokenIdForRows(new Float64Array(loop.smallest)) as string;
    sdk.lifeform(tokenId).then((lf) => {
      if (!cancelled) setInfo({ kind: "ready", period: loop.period, smallest: loop.smallest, tokenId, minted: !!lf });
    });
    return () => {
      cancelled = true;
    };
  }, [sdk, beast]);

  // on a confirmed mint, send the visitor to their newly-born creature
  useEffect(() => {
    if (status === "confirmed" && info.kind === "ready") {
      const t = setTimeout(() => router.push(`/life/${info.tokenId}`), 1200);
      return () => clearTimeout(t);
    }
  }, [status, info, router]);

  const ready = info.kind === "ready" ? info : null;
  const period = ready?.period;
  const busy = status === "signing" || status === "pending";

  return (
    <Shell>
      <div className="detail">
        <div className={`stage${busy ? " inhaling" : ""}`}>
          <Creature coords={beast.coords} variant="potential" engaged res={540} ariaLabel={`${beast.name} pattern`} />
        </div>
        <div>
          <span className="kicker">waiting to be discovered · not yet on chain</span>
          <h1>{beast.name}</h1>
          <p className="dim" style={{ maxWidth: "46ch" }}>
            A known {beast.family === "spaceship" ? "spaceship" : beast.family === "still" ? "still life" : "oscillator"} from
            Conway&rsquo;s reservoir. Discover it on the board, then mint it to set it free — alive on
            Starknet, independent of you.
          </p>

          <div className="trait-grid">
            <Trait t="Kind" v={beast.kind} />
            <Trait t="Fate" v={info.kind === "toolarge" ? "Travels forever" : "Alive · a loop"} />
            <Trait t="Loop length" v={period ? String(period) : info.kind === "toolarge" ? "large" : "…"} />
            <Trait t="Mint cost" v={period ? `${period} NUT` : "—"} />
          </div>

          {info.kind === "toolarge" && (
            <div className="callout">
              This traveller never settles into a small loop on the 41×41 torus — its period is too
              large to mint cheaply. Meet it and watch it live.
            </div>
          )}
          {ready?.minted && (
            <div className="callout">
              Already discovered — this creature lives on Starknet.{" "}
              <Link className="tx-link" href={`/life/${ready.tokenId}`}>meet it ↗</Link>
            </div>
          )}

          <div style={{ marginTop: 18 }}>
            {info.kind === "loading" ? (
              <button className="btn" disabled><span className="spinner" /> reading the chain…</button>
            ) : info.kind === "toolarge" ? (
              <button className="btn" disabled title="Loop too large to mint cheaply">Can&rsquo;t be set free yet</button>
            ) : ready?.minted ? (
              <Link className="btn primary" href={`/life/${ready.tokenId}`}>Meet this creature →</Link>
            ) : !address ? (
              <button className="btn" onClick={connect}>Connect to set it free</button>
            ) : !onSepolia ? (
              <button className="btn primary" onClick={switchToSepolia}>Switch to Sepolia to mint</button>
            ) : (
              <button
                className="btn primary breathe-btn"
                onClick={() => (status === "error" ? reset() : ready && mint(ready.smallest, ready.period))}
                disabled={busy}
              >
                {status === "signing"
                  ? "Confirm in your wallet…"
                  : status === "pending"
                    ? "Setting it free… (tx pending)"
                    : status === "confirmed"
                      ? "✓ Born — taking you there…"
                      : status === "error"
                        ? "Try again"
                        : `Set it free · ${period} NUT`}
              </button>
            )}
            {txHash && (status === "pending" || status === "confirmed") && (
              <a className="tx-link" href={explorerTxUrl(txHash)} target="_blank" rel="noreferrer" style={{ marginLeft: 12 }}>view tx ↗</a>
            )}
            {status === "error" && error && <p className="breathe-err">{error}</p>}
          </div>
        </div>
      </div>
    </Shell>
  );
}

function Trait({ t, v }: { t: string; v: string }) {
  return (
    <div className="trait">
      <div className="t">{t}</div>
      <div className="v">{v}</div>
    </div>
  );
}

// Click to copy the full value to the clipboard (shows a brief "copied!").
function Copyable({ label, value, display }: { label: string; value: string; display: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          /* clipboard unavailable */
        }
      }}
      title="Click to copy"
      style={{ cursor: "pointer" }}
    >
      {label} <span className="mono">{copied ? "copied!" : display}</span>
    </span>
  );
}

function Swatch({ color }: { color: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ display: "inline-block", width: 16, height: 16, borderRadius: 4, background: color, border: "1px solid rgba(255,255,255,0.2)" }} />
      <span className="mono">{color}</span>
    </span>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="wrap">
      {children}
      <Link href="/" className="back-link">← back to the garden</Link>
    </div>
  );
}
