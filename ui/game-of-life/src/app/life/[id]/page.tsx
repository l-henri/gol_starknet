"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Creature from "@/components/Creature";
import BreathCanvas from "@/components/BreathCanvas";
import { useGolSdk } from "@/lib/sdk";
import { useWallet } from "@/lib/wallet";
import { useBreathe } from "@/lib/useBreathe";
import { usePet, useBond, daysLeft } from "@/lib/usePet";
import { useMint } from "@/lib/useMint";
import { findBeast } from "@/lib/bestiary";
import { fromRows, rowsFromCoords, step, type Cells } from "@/lib/creatures";
import { shortAddr, tokenIdDecimal } from "@/lib/format";
import { explorerTxUrl } from "@/lib/config";
import type { JsLifeform } from "@/lib/types";
import { onchainHtml } from "@/lib/onchainRender";

const toHex = (n: number) => "#" + (n & 0xffffff).toString(16).padStart(6, "0");
const sameId = (a: string, b: string) => { try { return BigInt(a) === BigInt(b); } catch { return false; } };
type RP = { bg: number; cell: number; speed: number };

/* microscope-slide frame: thin border + corner ticks + faint petri texture behind the render */
function Slide({ children }: { children: ReactNode }) {
  return (
    <div className="slide">
      <div className="slide-glass">{children}</div>
      <span className="tick tl" /><span className="tick tr" /><span className="tick bl" /><span className="tick br" />
    </div>
  );
}

export default function LifePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  if (findBeast(id)) return <BeastDetail key={id} />;
  return <MintedDetail key={id} id={id} />;
}

/* dispatcher: a minted id is a loop (Bacterium) or a path (Wanderer) */
function MintedDetail({ id }: { id: string }) {
  const { sdk, error } = useGolSdk();
  const [kind, setKind] = useState<"loading" | "loop" | "path" | "none">("loading");
  useEffect(() => {
    if (!sdk) return;
    let cancelled = false;
    (async () => {
      for (let attempt = 0; attempt < 5; attempt++) {
        const [l, p] = await Promise.all([sdk.lifeform(id).catch(() => null), sdk.pathLifeform(id).catch(() => null)]);
        if (cancelled) return;
        if (l) return setKind("loop");
        if (p) return setKind("path");
        if (attempt < 4) await new Promise((r) => setTimeout(r, 1800));
      }
      if (!cancelled) setKind("none");
    })();
    return () => { cancelled = true; };
  }, [sdk, id]);

  if (error) return <Shell><p className="status-line">the petri dish is offline — {error}</p></Shell>;
  if (kind === "loading") return <Shell><p className="status-line"><span className="spinner" /> reading the chain…</p></Shell>;
  if (kind === "loop") return <LoopDetail id={id} />;
  if (kind === "path") return <PathDetail id={id} />;
  return <Shell><p className="status-line">no creature #{id} is minted on Sepolia.</p></Shell>;
}

/* ---------- a living Bacterium: the ritual surface ---------- */
function LoopDetail({ id }: { id: string }) {
  const { sdk, error } = useGolSdk();
  const { onSepolia, switchToSepolia, execute, waitForTx } = useWallet();
  const { status: bStatus, txHash: bHash, error: bErr, breathe, reset: bReset, connected } = useBreathe();
  const { status: pStatus, txHash: pHash, error: pErr, pet, reset: pReset } = usePet();
  const bond = useBond(id);

  const [lf, setLf] = useState<JsLifeform | null>(null);
  const [rp, setRp] = useState<RP | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [born, setBorn] = useState<number | null>(null);
  const [pack, setPack] = useState<{ holder: string; left: number | null }[] | null>(null);
  const [packEpoch, setPackEpoch] = useState(0);

  const [scrubGen, setScrubGen] = useState<number | null>(null);
  const [showIframe, setShowIframe] = useState(false);
  const [breathSignal, setBreathSignal] = useState(0);
  const [confirmMsg, setConfirmMsg] = useState<{ text: string; hash: string | null } | null>(null);
  const [shownAge, setShownAge] = useState(0);

  const [dcOpen, setDcOpen] = useState(false);
  const [dcTo, setDcTo] = useState("");
  const [dcStatus, setDcStatus] = useState<"idle" | "signing" | "pending" | "confirmed" | "error">("idle");
  const [dcErr, setDcErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!sdk) return;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const [l, p] = await Promise.all([sdk.lifeform(id), sdk.renderParams(id)]);
        if (l) { setLf(l as JsLifeform); setRp((p as RP | null) ?? null); setNotFound(false); setLoading(false); return; }
      } catch { /* transient — retry */ }
      if (attempt < 4) await new Promise((r) => setTimeout(r, 1800));
    }
    setNotFound(true); setLoading(false);
  }, [sdk, id]);
  useEffect(() => { setLoading(true); load(); }, [load]);

  useEffect(() => { if (lf) setShownAge(lf.age); }, [lf?.age]); // eslint-disable-line react-hooks/exhaustive-deps

  // lazy: the birth block (the on-chain name is just "Lifeform <id>"; we show a cleaner type name)
  useEffect(() => { if (!sdk) return; let c = false; sdk.recentMints().then((m) => { const hit = (m as { token_id: string; block: number }[]).find((x) => sameId(x.token_id, id)); if (!c) setBorn(hit?.block ?? null); }).catch(() => {}); return () => { c = true; }; }, [sdk, id]);

  // caretakers ("the pack") — every held bond on this creature, soonest-to-wilt first
  useEffect(() => {
    if (!sdk) return;
    let cancelled = false;
    (async () => {
      try {
        const pairs = ((await sdk.petPairs()) as { creature_id: string; holder: string }[]) ?? [];
        const mine = pairs.filter((p) => sameId(p.creature_id, id));
        const seen = new Set<string>();
        const out: { holder: string; left: number | null }[] = [];
        for (const p of mine) {
          const k = BigInt(p.holder).toString();
          if (seen.has(k)) continue;
          seen.add(k);
          const b = (await sdk.bondStatus(p.creature_id, p.holder)) as { held: boolean; last_pet: number; reapable: boolean };
          if (!b.held) continue;
          out.push({ holder: p.holder, left: daysLeft({ held: true, lastPet: b.last_pet, reapable: b.reapable }) });
        }
        if (!cancelled) setPack(out.sort((a, b) => (a.left ?? 0) - (b.left ?? 0)));
      } catch { if (!cancelled) setPack([]); }
    })();
    return () => { cancelled = true; };
  }, [sdk, id, packEpoch]);

  // a confirmed breath → play the animation, tick the counter, refetch, settle
  useEffect(() => {
    if (bStatus !== "confirmed") return;
    setShowIframe(false); setScrubGen(null);
    setBreathSignal((s) => s + 1);
    setShownAge((a) => a + 1);
    setConfirmMsg({ text: "You gave it a breath.", hash: bHash });
    load();
    const t = setTimeout(() => bReset(), 3200);
    return () => clearTimeout(t);
  }, [bStatus]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (pStatus !== "confirmed") return;
    setShowIframe(false); setScrubGen(null);
    setBreathSignal((s) => s + 1);
    setShownAge((a) => a + 1);
    setConfirmMsg({ text: "You gave it a breath. Bond renewed.", hash: pHash });
    load(); setPackEpoch((e) => e + 1);
    const t = setTimeout(() => pReset(), 3200);
    return () => clearTimeout(t);
  }, [pStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <Shell><p className="status-line">the petri dish is offline — {error}</p></Shell>;
  if (loading) return <Shell><p className="status-line"><span className="spinner" /> reading the chain…</p></Shell>;
  if (notFound) return <Shell><p className="status-line">no lifeform #{id} is minted on Sepolia.</p></Shell>;
  if (!lf) return null;

  const decId = tokenIdDecimal(lf.token_id);
  const period = lf.sequence_length;
  const displayName = lf.is_still ? "Still Life" : lf.is_loop ? `Period-${period} Loop` : "Lifeform";
  const stateWord = lf.is_dead ? "gone out" : "alive";
  const bBusy = bStatus === "signing" || bStatus === "pending";
  const pBusy = pStatus === "signing" || pStatus === "pending";
  const left = daysLeft(bond);
  const hungry = left !== null && left <= 2;

  const doBreathe = () => (bStatus === "error" ? bReset() : !connected || !onSepolia ? (onSepolia ? breathe(decId, 1) : switchToSepolia()) : breathe(decId, 1));
  const doPet = () => (pStatus === "error" ? pReset() : !onSepolia ? switchToSepolia() : pet(decId));

  const doTransfer = async () => {
    if (!sdk || !dcTo.trim()) return;
    setDcErr(null); setDcStatus("signing");
    try {
      const hash = await execute(sdk.transferBondCall(decId, dcTo.trim()));
      setDcStatus("pending");
      await waitForTx(hash);
      setDcStatus("confirmed");
      setPackEpoch((e) => e + 1);
      setTimeout(() => { setDcOpen(false); setDcStatus("idle"); setDcTo(""); }, 1400);
    } catch (e) {
      setDcErr(e instanceof Error ? e.message.slice(0, 140) : String(e));
      setDcStatus("error");
    }
  };

  const scrubMax = Math.min(period - 1, 63);

  return (
    <Shell>
      <div className="life">
        <div className="life-main">
          {/* LEFT — the render, framed as a microscope slide */}
          <div className="life-left">
            <Slide>
              {rp && showIframe ? (
                <iframe srcDoc={onchainHtml(lf.current_state, rp.bg, rp.cell, rp.speed)} title={`On-chain renderer for ${decId}`} sandbox="allow-scripts" style={{ width: "100%", height: "100%", border: 0, background: toHex(rp.bg) }} />
              ) : rp ? (
                <BreathCanvas rows={lf.current_state} bg={rp.bg} cell={rp.cell} speed={rp.speed} playing={scrubGen === null} scrubGen={scrubGen} breathSignal={breathSignal} />
              ) : (
                <div className="status-line" style={{ padding: 24 }}>reading render params…</div>
              )}
            </Slide>

            <div className="life-counter">
              <span className="life-gen">{shownAge.toLocaleString("en-US")}</span>
              <span className="life-gen-label">generation{shownAge === 1 ? "" : "s"} lived</span>
            </div>

            {period > 1 && !showIframe && (
              <div className="life-scrub">
                <button className={"scrub-live" + (scrubGen === null ? " on" : "")} onClick={() => setScrubGen(null)}>
                  <span className="dot" /> live
                </button>
                <input type="range" min={0} max={scrubMax} value={scrubGen ?? 0} onChange={(e) => setScrubGen(Number(e.target.value))} aria-label="Replay generations" />
                <span className="scrub-read">{scrubGen === null ? "cycle" : `phase ${scrubGen} / ${period}`}</span>
              </div>
            )}
            <button className="life-onchain" onClick={() => setShowIframe((v) => !v)}>
              {showIframe ? "← show the replayable view" : "view the on-chain renderer"}
            </button>
          </div>

          {/* RIGHT — identity, facts, and the two acts of care */}
          <div className="life-right">
            <span className="eyebrow">{stateWord} · living on Starknet</span>
            <h1 className="life-name">{displayName} <span className="life-id">{shortAddr(lf.token_id)}</span></h1>

            <div className="life-facts">
              <span>born · <span className="mono">{born !== null ? `block ${born.toLocaleString("en-US")}` : "…"}</span></span>
              <Copyable label="set free by" value={lf.owner} display={shortAddr(lf.owner)} />
            </div>

            <div className="trait-grid">
              <Trait t="Kind" v={lf.is_still ? "Still life" : "Loop"} />
              <Trait t="Loop period" v={String(period)} />
              <Trait t="State" v={stateWord} />
              {rp && <Trait t="Cell" v={<Swatch color={toHex(rp.cell)} />} />}
              {rp && <Trait t="Background" v={<Swatch color={toHex(rp.bg)} />} />}
              {rp && <Trait t="Pace" v={`${rp.speed} gen/s`} />}
            </div>

            {!lf.is_dead && (
              <div className="acts">
                <button className="btn set-free breathe-act" onClick={doBreathe} disabled={bBusy || pBusy}>
                  {!connected ? "Connect to breathe"
                    : !onSepolia ? "Switch to Sepolia"
                    : bStatus === "signing" ? "Drawing breath…"
                    : bStatus === "pending" ? "The chain is writing…"
                    : bStatus === "error" ? "Try again"
                    : "Breathe life"}
                </button>
                <p className="act-note">One generation forward. Casual, anonymous — earns you a little $NUT. No bond.</p>

                {connected && onSepolia && (
                  <div className="act-pet">
                    <button className="btn pet-act" onClick={doPet} disabled={pBusy || bBusy}>
                      {pStatus === "signing" ? "Drawing breath…"
                        : pStatus === "pending" ? "The chain is writing…"
                        : pStatus === "error" ? "Try again"
                        : bond?.held ? "Pet — the committed breath" : "Adopt it — become its caretaker"}
                    </button>
                    {bond?.held ? (
                      <div className={"bond-clock" + (hungry ? " hungry" : "")}>
                        <span className="bond-dot" />
                        {left !== null && left <= 0
                          ? "bond wilted — a pet revives it"
                          : `bond: ${left! >= 1 ? `${Math.floor(left!)} day${Math.floor(left!) === 1 ? "" : "s"}` : `${Math.max(1, Math.round(left! * 24))} hours`} left`}
                      </div>
                    ) : (
                      <p className="act-note">Petting opens your caretaker bond and a 7-day clock. Come back within 7 days, or the bond wilts.</p>
                    )}

                    {bond?.held && (
                      dcOpen ? (
                        <div className="daycare">
                          <input className="dc-input" placeholder="0x… friend's address" value={dcTo} onChange={(e) => setDcTo(e.target.value)} />
                          <div className="daycare-row">
                            <button className="btn set-free" disabled={dcStatus === "signing" || dcStatus === "pending" || !dcTo.trim()} onClick={doTransfer}>
                              {dcStatus === "signing" ? "Confirm…" : dcStatus === "pending" ? "Handing over…" : dcStatus === "confirmed" ? "Handed over" : "Hand over"}
                            </button>
                            <button className="btn ghost" onClick={() => { setDcOpen(false); setDcErr(null); }}>Cancel</button>
                          </div>
                          {dcErr && <p className="breathe-err">{dcErr}</p>}
                          <p className="act-note">Daycare: hand the bond to a friend to pet-sit while you’re away. The clock rides along.</p>
                        </div>
                      ) : (
                        <button className="btn ghost dc-open" onClick={() => setDcOpen(true)}>hand to daycare →</button>
                      )
                    )}
                  </div>
                )}

                {confirmMsg && (
                  <div className="breath-confirm">
                    <p>{confirmMsg.text}</p>
                    {confirmMsg.hash && <a className="tx-link" href={explorerTxUrl(confirmMsg.hash)} target="_blank" rel="noreferrer">{shortAddr(confirmMsg.hash)} ↗</a>}
                  </div>
                )}
                {bStatus === "error" && bErr && <p className="breathe-err">{bErr}</p>}
                {pStatus === "error" && pErr && <p className="breathe-err">{pErr}</p>}
              </div>
            )}
            {lf.is_dead && <p className="dim" style={{ marginTop: 16 }}>This one has gone out. It rests on-chain, a record of a life.</p>}
          </div>
        </div>

        {/* BELOW — the pack, and the generations it lives through */}
        <div className="life-below">
          <section>
            <h3 className="life-h3">Caretakers</h3>
            {pack === null ? (
              <p className="dim"><span className="spinner" /> reading the pack…</p>
            ) : pack.length === 0 ? (
              <p className="dim">No caretakers yet — be the first to pet it.</p>
            ) : (
              <ul className="pack">
                {pack.map((c) => (
                  <li key={c.holder}>
                    <span className="pack-dot" style={{ background: c.left !== null && c.left <= 2 ? "#f97316" : "#22c55e" }} />
                    <span className="mono">{shortAddr(c.holder)}</span>
                    <span className="pack-left">{c.left === null ? "" : c.left <= 0 ? "wilting" : c.left >= 1 ? `${Math.floor(c.left)}d left` : `${Math.max(1, Math.round(c.left * 24))}h left`}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <h3 className="life-h3">Lived generations</h3>
            <p className="dim">It has lived <b>{shownAge.toLocaleString("en-US")}</b> generation{shownAge === 1 ? "" : "s"}{period > 1 ? `, cycling through ${period} states` : " as a still life"}.</p>
            {rp && <Filmstrip rows={lf.current_state} period={period} rp={rp} />}
          </section>
        </div>
      </div>
    </Shell>
  );
}

/* the states a creature moves through (its cycle) as a filmstrip */
function Filmstrip({ rows, period, rp }: { rows: number[]; period: number; rp: RP }) {
  const frames = useMemo(() => {
    const out: Cells[] = [];
    let c = fromRows(rows);
    for (let i = 0; i < Math.min(period, 10); i++) { out.push(c); c = step(c); }
    return out;
  }, [rows, period]);
  return (
    <div className="filmstrip">
      {frames.map((f, i) => (
        <div className="film-frame" key={i} title={`generation ${i}`}>
          <Creature cells={f} bg={rp.bg} cell={rp.cell} variant="living" animate={false} res={120} />
        </div>
      ))}
    </div>
  );
}

/* ---------- a Wanderer: a static travelling portrait (no care) ---------- */
type JsPath = {
  token_id: string; owner: string; life_state: string; sequence_length: number;
  start_state: number[]; target_loop_id: string; target_period: number; minted_at: number; escrow: string;
};
function PathDetail({ id }: { id: string }) {
  const { sdk } = useGolSdk();
  const [pf, setPf] = useState<JsPath | null>(null);
  const [rp, setRp] = useState<RP | null>(null);
  const [born, setBorn] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sdk) return;
    let c = false;
    Promise.all([sdk.pathLifeform(id), sdk.pathRenderParams(id)]).then(([p, params]) => {
      if (c) return;
      setPf((p as JsPath) ?? null); setRp((params as RP | null) ?? null); setLoading(false);
    });
    sdk.recentPathMints().then((m) => { const hit = (m as { token_id: string; block: number }[]).find((x) => sameId(x.token_id, id)); if (!c) setBorn(hit?.block ?? null); }).catch(() => {});
    return () => { c = true; };
  }, [sdk, id]);

  if (loading) return <Shell><p className="status-line"><span className="spinner" /> reading the chain…</p></Shell>;
  if (!pf) return <Shell><p className="status-line">no wanderer #{id} is minted on Sepolia.</p></Shell>;

  const dead = pf.life_state === "dead";
  const stateLabel = dead ? "Gone out · faded to nothing" : pf.life_state === "frozen" ? "Frozen · settles to a still life" : "Travelling · bound for a loop";

  return (
    <Shell>
      <div className="life">
        <div className="life-main">
          <div className="life-left">
            <Slide>
              {rp ? (
                <BreathCanvas rows={pf.start_state} bg={rp.bg} cell={rp.cell} speed={rp.speed} playing={false} scrubGen={0} breathSignal={0} />
              ) : (
                <div className="status-line" style={{ padding: 24 }}>reading render params…</div>
              )}
            </Slide>
            <div className="life-counter">
              <span className="life-gen">{pf.sequence_length}</span>
              <span className="life-gen-label">generations of travel</span>
            </div>
          </div>
          <div className="life-right">
            <span className="eyebrow">a wanderer · a moment of travel, caught</span>
            <h1 className="life-name">Wanderer <span className="life-id">{shortAddr(pf.token_id)}</span></h1>
            <div className="life-facts">
              <span>born · <span className="mono">{born !== null ? `block ${born.toLocaleString("en-US")}` : "…"}</span></span>
              <Copyable label="set free by" value={pf.owner} display={shortAddr(pf.owner)} />
            </div>
            <div className="trait-grid">
              <Trait t="Kind" v="Wanderer" />
              <Trait t="State" v={stateLabel} />
              <Trait t="Journey" v={`${pf.sequence_length} generations`} />
              {!dead && <Trait t="Bound for" v={<Link className="tx-link" href={`/life/${pf.target_loop_id}`}>a loop →</Link>} />}
              {rp && <Trait t="Cell" v={<Swatch color={toHex(rp.cell)} />} />}
              {rp && <Trait t="Background" v={<Swatch color={toHex(rp.bg)} />} />}
            </div>
            <p className="dim" style={{ maxWidth: "44ch", marginTop: 14 }}>
              A wanderer is a portrait, not a pet — a single caught moment of a pattern travelling toward its fate. It isn’t fed and holds no bond. Its rarity is the length of its journey: the farther it wandered from its loop, the rarer.
            </p>
          </div>
        </div>
      </div>
    </Shell>
  );
}

/* ---------- a not-yet-minted bestiary pattern (discover & set free) ---------- */
type BeastInfo =
  | { kind: "loading" } | { kind: "toolarge" }
  | { kind: "ready"; period: number; smallest: number[]; tokenId: string; minted: boolean };
function BeastDetail() {
  const params = useParams<{ id: string }>();
  const beast = findBeast(params.id)!;
  const router = useRouter();
  const { sdk } = useGolSdk();
  const { address, connect, onSepolia, switchToSepolia } = useWallet();
  const { status, txHash, error, mint, reset } = useMint();
  const [info, setInfo] = useState<BeastInfo>({ kind: "loading" });

  useEffect(() => {
    if (!sdk) return;
    let cancelled = false;
    const rows = rowsFromCoords(beast.coords);
    const loop = sdk.findLoop(new Float64Array(rows), 32) as { period: number; smallest: number[] } | null;
    if (!loop) { setInfo({ kind: "toolarge" }); return; }
    const tokenId = sdk.familyTokenId(new Float64Array(loop.smallest), loop.period) as string;
    sdk.lifeform(tokenId).then((lf) => { if (!cancelled) setInfo({ kind: "ready", period: loop.period, smallest: loop.smallest, tokenId, minted: !!lf }); });
    return () => { cancelled = true; };
  }, [sdk, beast]);

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
      <div className="life">
        <div className="life-main">
          <div className="life-left">
            <Slide><div className="slide-glass" style={{ background: "#070709" }}><Creature coords={beast.coords} variant="potential" res={540} ariaLabel={`${beast.name} pattern`} /></div></Slide>
          </div>
          <div className="life-right">
            <span className="eyebrow">waiting to be discovered · not yet on chain</span>
            <h1 className="life-name">{beast.name}</h1>
            <p className="dim" style={{ maxWidth: "44ch" }}>A known {beast.family === "spaceship" ? "spaceship" : beast.family === "still" ? "still life" : "oscillator"} from Conway’s reservoir. Set it free — alive on Starknet, independent of you.</p>
            <div className="trait-grid">
              <Trait t="Kind" v={beast.kind} />
              <Trait t="Fate" v={info.kind === "toolarge" ? "Travels forever" : "Alive · a loop"} />
              <Trait t="Loop period" v={period ? String(period) : info.kind === "toolarge" ? "large" : "…"} />
            </div>
            {info.kind === "toolarge" && <div className="callout">This traveller never settles into a small loop on the 41×41 torus — too large to set free cheaply.</div>}
            {ready?.minted && <div className="callout">Already discovered — it lives on Starknet. <Link className="tx-link" href={`/life/${ready.tokenId}`}>meet it ↗</Link></div>}
            <div style={{ marginTop: 18 }}>
              {info.kind === "loading" ? (
                <button className="btn" disabled><span className="spinner" /> reading the chain…</button>
              ) : info.kind === "toolarge" ? (
                <button className="btn" disabled>Can’t be set free yet</button>
              ) : ready?.minted ? (
                <Link className="btn set-free" href={`/life/${ready.tokenId}`}>Meet this creature →</Link>
              ) : !address ? (
                <button className="btn set-free" onClick={connect}>Connect to set it free</button>
              ) : !onSepolia ? (
                <button className="btn set-free" onClick={switchToSepolia}>Switch to Sepolia</button>
              ) : (
                <button className="btn set-free" onClick={() => (status === "error" ? reset() : ready && mint(ready.smallest, ready.period))} disabled={busy}>
                  {status === "signing" ? "Confirm in your wallet…" : status === "pending" ? "The chain is writing…" : status === "confirmed" ? "Born — taking you there…" : status === "error" ? "Try again" : `Set it free · ${period} $NUT`}
                </button>
              )}
              {txHash && (status === "pending" || status === "confirmed") && <a className="tx-link" href={explorerTxUrl(txHash)} target="_blank" rel="noreferrer" style={{ marginLeft: 12 }}>view tx ↗</a>}
              {status === "error" && error && <p className="breathe-err">{error}</p>}
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}

function Trait({ t, v }: { t: string; v: ReactNode }) {
  return <div className="trait"><div className="t">{t}</div><div className="v">{v}</div></div>;
}
function Copyable({ label, value, display }: { label: string; value: string; display: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span onClick={async () => { try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch { /* no clipboard */ } }} title="Click to copy" style={{ cursor: "pointer" }}>
      {label} <span className="mono">{copied ? "copied!" : display}</span>
    </span>
  );
}
function Swatch({ color }: { color: string }) {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ display: "inline-block", width: 14, height: 14, borderRadius: 4, background: color, border: "1px solid rgba(255,255,255,0.2)" }} /><span className="mono">{color}</span></span>;
}
function Shell({ children }: { children: React.ReactNode }) {
  return <div className="wrap life-wrap">{children}<Link href="/" className="back-link">← back to the garden</Link></div>;
}
