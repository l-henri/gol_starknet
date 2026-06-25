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
import { ageToScale, rowsFromCoords } from "@/lib/creatures";
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
type BeastInfo =
  | { kind: "loading" }
  | { kind: "toolarge" }
  | { kind: "ready"; period: number; smallest: number[]; tokenId: string; minted: boolean };

function BeastDetail() {
  const params = useParams<{ id: string }>();
  const beast = findBeast(params.id)!;
  const router = useRouter();
  const { sdk } = useGolSdk();
  const { address, connect, onSepolia } = useWallet();
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
      const t = setTimeout(() => router.push(`/life/${BigInt(info.tokenId).toString()}`), 1200);
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
              <Link className="tx-link" href={`/life/${BigInt(ready.tokenId).toString()}`}>meet it ↗</Link>
            </div>
          )}

          <div style={{ marginTop: 18 }}>
            {info.kind === "loading" ? (
              <button className="btn" disabled><span className="spinner" /> reading the chain…</button>
            ) : info.kind === "toolarge" ? (
              <button className="btn" disabled title="Loop too large to mint cheaply">Can&rsquo;t be set free yet</button>
            ) : ready?.minted ? (
              <Link className="btn primary" href={`/life/${BigInt(ready.tokenId).toString()}`}>Meet this creature →</Link>
            ) : !address ? (
              <button className="btn" onClick={connect}>Connect to set it free</button>
            ) : !onSepolia ? (
              <button className="btn" disabled>Switch to Sepolia to mint</button>
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

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="wrap">
      {children}
      <Link href="/" className="back-link">← back to the garden</Link>
    </div>
  );
}
