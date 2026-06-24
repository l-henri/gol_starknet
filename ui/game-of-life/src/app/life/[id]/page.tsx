"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import Creature from "@/components/Creature";
import { useGolSdk } from "@/lib/sdk";
import { useWallet } from "@/lib/wallet";
import { useBreathe } from "@/lib/useBreathe";
import { findBeast } from "@/lib/bestiary";
import { detectFate, fromCoords, ageToScale } from "@/lib/creatures";
import { lifeformKind, shortAddr, tokenIdDecimal } from "@/lib/format";
import { explorerTxUrl } from "@/lib/config";
import type { JsLifeform, JsTokenUri } from "@/lib/types";

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
  const { onSepolia } = useWallet();
  const { status, txHash, error: breatheError, breathe, reset, connected } = useBreathe();
  const [lf, setLf] = useState<JsLifeform | null>(null);
  const [uri, setUri] = useState<JsTokenUri | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [view, setView] = useState<"render" | "onchain">("render");
  const [reward, setReward] = useState(false);

  const load = useCallback(async () => {
    if (!sdk) return;
    try {
      const [l, u] = await Promise.all([sdk.lifeform(id), sdk.tokenUri(id)]);
      if (!l) {
        setNotFound(true);
        return;
      }
      setLf(l as JsLifeform);
      setUri((u as JsTokenUri) ?? null);
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

  return (
    <Shell>
      <div className="detail">
        <div className={`stage${busy ? " inhaling" : ""}`}>
          {view === "render" ? (
            <Creature rows={lf.current_state} age={ageToScale(lf.age)} variant={lf.is_dead ? "dead" : "living"} engaged res={540} ariaLabel={`${kind} lifeform ${decId}`} />
          ) : uri?.animation_url ? (
            <div className="svg-frame">
              {/* on-chain artifact: the self-contained data: HTML renderer (animation_url) */}
              <iframe src={uri.animation_url} title={`On-chain renderer for lifeform ${decId}`} sandbox="allow-scripts" style={{ width: "100%", height: "100%", border: 0, background: "var(--bg-dish)" }} />
            </div>
          ) : (
            <div className="svg-frame" style={{ background: "var(--bg-dish)" }}>
              <span className="status-line">no on-chain renderer</span>
            </div>
          )}
          {reward && <span className="nut-float">+1 NUT</span>}
        </div>

        <div>
          <span className="kicker">{lf.is_alive ? "alive" : "dormant"} · living on Starknet</span>
          <h1>{uri?.name ?? `Lifeform #${decId}`}</h1>
          <div className="meta-row">
            <span>owner {shortAddr(lf.owner)}</span>
            <span>token <span className="mono">{shortAddr(lf.token_id)}</span></span>
          </div>

          <div className="trait-grid">
            <Trait t="Status" v={lf.is_dead ? "Dead" : lf.is_alive ? "Alive" : "Dormant"} />
            <Trait t="Kind" v={kind} />
            <Trait t="Sequence length" v={String(lf.sequence_length)} />
            <Trait t="Age" v={`${lf.age} ${lf.age === 1 ? "breath" : "breaths"}`} />
          </div>

          {uri?.description && <p className="dim" style={{ maxWidth: "46ch" }}>{uri.description}</p>}

          <div className="toggle-row">
            <button className={`btn ${view === "render" ? "active" : ""}`} onClick={() => setView("render")}>Living render</button>
            <button className={`btn ${view === "onchain" ? "active" : ""}`} onClick={() => setView("onchain")}>On-chain artifact</button>
          </div>

          {!lf.is_dead && (
            <div className="breathe-block">
              <button
                className="btn primary breathe-btn"
                onClick={() => (status === "error" ? reset() : breathe(decId))}
                disabled={busy || (connected && !onSepolia)}
              >
                {!connected
                  ? "Connect to breathe life"
                  : !onSepolia
                    ? "Switch to Sepolia to breathe"
                    : status === "signing"
                      ? "Confirm in your wallet…"
                      : status === "pending"
                        ? "Breathing… (tx pending)"
                        : status === "confirmed"
                          ? "✓ Breathed · +1 NUT"
                          : status === "error"
                            ? "Try again"
                            : `Breathe life into #${decId}`}
              </button>
              {txHash && (status === "pending" || status === "confirmed") && (
                <a className="tx-link" href={explorerTxUrl(txHash)} target="_blank" rel="noreferrer">
                  view tx ↗
                </a>
              )}
              {status === "error" && breatheError && <p className="breathe-err">{breatheError}</p>}
              {status === "idle" && connected && (
                <p className="breathe-hint">advance it one generation, earn 1 NUT, keep it alive — feed anyone&rsquo;s creature.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}

/* ---------- a not-yet-minted pattern from the bestiary ---------- */
function BeastDetail() {
  const params = useParams<{ id: string }>();
  const beast = findBeast(params.id)!;
  const { address, connect } = useWallet();
  const fate = useMemo(() => detectFate(fromCoords(beast.coords)), [beast]);
  const nutCost = fate.loopLength > 0 ? fate.loopLength : 1;

  return (
    <Shell>
      <div className="detail">
        <div className="stage">
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
            <Trait t="Fate" v={fate.alive ? "Alive (a loop)" : "Dies out"} />
            <Trait t="Loop length" v={fate.loopLength > 0 ? String(fate.loopLength) : "—"} />
            <Trait t="Mint cost" v={`${nutCost} NUT`} />
          </div>

          <div className="callout">
            <b>Smallest loop id</b> <span className="mono">{fate.smallestHex}</span> — the canonical id
            this creature would mint under. Discovery &amp; minting arrive in the next phase; for now,
            meet the creature and watch it live.
          </div>

          <div style={{ marginTop: 18 }}>
            {address ? (
              <button className="btn primary" disabled title="Discovery & mint land next">Set it free (soon)</button>
            ) : (
              <button className="btn" onClick={connect}>Connect a wallet</button>
            )}
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

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="wrap">
      {children}
      <Link href="/" className="back-link">← back to the garden</Link>
    </div>
  );
}
