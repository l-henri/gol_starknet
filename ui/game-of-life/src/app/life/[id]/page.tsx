"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import Creature from "@/components/Creature";
import { useGolSdk } from "@/lib/sdk";
import { useWallet } from "@/lib/wallet";
import { useBreathe } from "@/lib/useBreathe";
import { usePet, useBond, daysLeft } from "@/lib/usePet";
import { useMint } from "@/lib/useMint";
import { useGasCaps } from "@/lib/gasCaps";
import { findBeast } from "@/lib/bestiary";
import { rowsFromCoords } from "@/lib/creatures";
import { lifeformKind, shortAddr, tokenIdDecimal } from "@/lib/format";
import { explorerTxUrl } from "@/lib/config";
import type { JsLifeform } from "@/lib/types";
import { onchainHtml, LIFEFORM_DESCRIPTION } from "@/lib/onchainRender";
import { useT } from "@/lib/i18n";

// The feed slider max is sized per-wallet from the connected account's gas-metering tier (see
// gasCaps.ts): one move_lifeform_forward_n(id, n) costs ~3.0M gas/gen on a modern Sierra-gas account
// vs ~14M/gen on a legacy one, so the ~1.2B per-tx wallet cap allows ~340 vs ~82 generations. The cap
// comes from useGasCaps(); legacy is the safe default while the tier is still resolving.
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

/* ---------- dispatcher: a minted id is either a loop creature or a path creature ---------- */
function MintedDetail({ id }: { id: string }) {
  const { t } = useT();
  const { sdk, error } = useGolSdk();
  const [kind, setKind] = useState<"loading" | "loop" | "path" | "none">("loading");
  useEffect(() => {
    if (!sdk) return;
    let cancelled = false;
    (async () => {
      // Loop and path NFTs share the token-id scheme but live on different contracts. Race both;
      // render whichever exists. A just-minted creature can lag chain reads, so retry briefly.
      for (let attempt = 0; attempt < 5; attempt++) {
        const [l, p] = await Promise.all([
          sdk.lifeform(id).catch(() => null),
          sdk.pathLifeform(id).catch(() => null),
        ]);
        if (cancelled) return;
        if (l) return setKind("loop");
        if (p) return setKind("path");
        if (attempt < 4) await new Promise((r) => setTimeout(r, 1800));
      }
      if (!cancelled) setKind("none");
    })();
    return () => {
      cancelled = true;
    };
  }, [sdk, id]);

  if (error)
    return <Shell><p className="status-line">{t({ fr: "la boîte de Pétri est hors ligne — ", en: "the petri dish is offline — " })}{error}</p></Shell>;
  if (kind === "loading")
    return <Shell><p className="status-line"><span className="spinner" /> {t({ fr: "lecture de la chaîne…", en: "reading the chain…" })}</p></Shell>;
  if (kind === "loop") return <LoopDetail id={id} />;
  if (kind === "path") return <PathDetail id={id} />;
  return <Shell><p className="status-line">{t({ fr: `aucune créature #${id} sur Sepolia.`, en: `no creature #${id} is minted on Sepolia.` })}</p></Shell>;
}

/* ---------- a minted, on-chain LOOP creature ---------- */
function LoopDetail({ id }: { id: string }) {
  const { t } = useT();
  const { sdk, error } = useGolSdk();
  const { address, onSepolia, switchToSepolia, execute, waitForTx } = useWallet();
  const { feedCap, tier } = useGasCaps();
  const { status, txHash, error: breatheError, breathe, reset, connected } = useBreathe();
  const { status: petStatus, error: petError, pet, reset: petReset } = usePet();
  const bond = useBond(id); // route id (hex or decimal) — parsed by the SDK
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
    // No token_uri fetch: the on-chain artifact is rebuilt locally from these cheap reads + the
    // cached template (see onchainRender). lifeform() already covers owner + current_state.
    // A just-minted creature can lag chain reads by a beat, so retry briefly before concluding it
    // isn't minted — this makes the post-mint redirect land smoothly without a manual refresh.
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const [l, p] = await Promise.all([sdk.lifeform(id), sdk.renderParams(id)]);
        if (l) {
          setLf(l as JsLifeform);
          setRp((p as { bg: number; cell: number; speed: number } | null) ?? null);
          setNotFound(false);
          setLoading(false);
          return;
        }
      } catch {
        // transient read error — retry
      }
      if (attempt < 4) await new Promise((r) => setTimeout(r, 1800));
    }
    setNotFound(true);
    setLoading(false);
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

  if (error) return <Shell><p className="status-line">{t({ fr: "la boîte de Pétri est hors ligne — ", en: "the petri dish is offline — " })}{error}</p></Shell>;
  if (loading) return <Shell><p className="status-line"><span className="spinner" /> {t({ fr: "lecture de la chaîne…", en: "reading the chain…" })}</p></Shell>;
  if (notFound) return <Shell><p className="status-line">{t({ fr: `aucune créature #${id} sur Sepolia.`, en: `no lifeform #${id} is minted on Sepolia.` })}</p></Shell>;
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
              <span className="status-line">{t({ fr: "lecture des paramètres de rendu…", en: "reading render params…" })}</span>
            </div>
          )}
          {reward && <span className="nut-float">+{feedGen} NUT</span>}
        </div>

        <div>
          <span className="kicker">
            {lf.is_alive ? t({ fr: "en vie", en: "alive" }) : t({ fr: "en sommeil", en: "dormant" })}
            {t({ fr: " · vit sur Starknet", en: " · living on Starknet" })}
          </span>
          <div className="meta-row">
            <Copyable label={t({ fr: "propriétaire", en: "owner" })} value={lf.owner} display={shortAddr(lf.owner)} />
            <Copyable label={t({ fr: "token", en: "token" })} value={lf.token_id} display={shortAddr(lf.token_id)} />
          </div>

          <div className="trait-grid">
            <Trait t={t({ fr: "Type", en: "Kind" })} v={t(kind)} />
            <Trait t={t({ fr: "Période de la boucle", en: "Loop period" })} v={String(lf.sequence_length)} />
            <Trait t={t({ fr: "Âge", en: "Age" })} v={`${lf.age} ${t({ fr: lf.age === 1 ? "souffle" : "souffles", en: lf.age === 1 ? "breath" : "breaths" })}`} />
            {rp && (
              <>
                <Trait t={t({ fr: "Fond", en: "Background" })} v={<Swatch color={toHexColor(rp.bg)} />} />
                <Trait t={t({ fr: "Cellule", en: "Cell" })} v={<Swatch color={toHexColor(rp.cell)} />} />
                <Trait t={t({ fr: "Vitesse", en: "Speed" })} v={`${rp.speed} ${t({ fr: "gén/s", en: "gen/s" })}`} />
              </>
            )}
          </div>

          {/* Editing the appearance is owner-only — the values themselves are shown read-only in the
              characteristics grid above. These controls appear only when the owner's wallet is connected. */}
          {isOwner && rp && edit && (
            <div style={{ marginTop: 14 }}>
              <div className="note" style={{ marginBottom: 6 }}>
                {t({ fr: "apparence · à vous de régler", en: "appearance · yours to tune" })}
              </div>
              <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center" }}>
                <label className="note" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {t({ fr: "fond", en: "background" })}
                  <input type="color" value={toHexColor(edit.bg)} onChange={(e) => setEdit({ ...edit, bg: fromHexColor(e.target.value) })} />
                </label>
                <label className="note" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {t({ fr: "cellule", en: "cell" })}
                  <input type="color" value={toHexColor(edit.cell)} onChange={(e) => setEdit({ ...edit, cell: fromHexColor(e.target.value) })} />
                </label>
                <label className="note" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {t({ fr: "vitesse", en: "speed" })}
                  <input
                    type="number"
                    min={1}
                    max={SPEED_MAX - 1}
                    value={edit.speed}
                    onChange={(e) => setEdit({ ...edit, speed: Math.max(1, Math.min(SPEED_MAX - 1, Number(e.target.value) || 1)) })}
                    style={{ width: 64 }}
                  />
                </label>
              </div>
              {editChanged && (
                <div style={{ marginTop: 10 }}>
                  {editInvalid && <p className="breathe-err">{t({ fr: "le fond et la cellule doivent différer", en: "background and cell colour must differ" })}</p>}
                  <button className="btn primary" onClick={doEdit} disabled={editBusy || editInvalid}>
                    {editStatus === "signing"
                      ? t({ fr: "Confirmez dans votre portefeuille…", en: "Confirm in your wallet…" })
                      : editStatus === "pending"
                        ? t({ fr: "Modification… (tx en attente)", en: "Editing… (tx pending)" })
                        : editStatus === "confirmed"
                          ? t({ fr: "✓ Modifiée", en: "✓ Edited" })
                          : editStatus === "error"
                            ? t({ fr: "Réessayer", en: "Try again" })
                            : t({ fr: "Modifier la créature", en: "Edit creature" })}
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
                  {t({
                    fr: `nourrir ${feedGen} génération${feedGen === 1 ? "" : "s"} · gagner ${feedGen} $NUT`,
                    en: `feed ${feedGen} generation${feedGen === 1 ? "" : "s"} · earn ${feedGen} $NUT`,
                  })}
                  <input
                    type="range"
                    min={1}
                    max={feedCap}
                    value={feedGen}
                    onChange={(e) => setFeedGen(Number(e.target.value))}
                    disabled={busy}
                    style={{ display: "block", width: "100%", maxWidth: 320 }}
                  />
                  {tier === "modern" && (
                    <span className="note" style={{ display: "block", marginTop: 4, opacity: 0.7 }}>
                      {t({
                        fr: `⚡ jusqu'à ${feedCap} générations par transaction (portefeuille à gas moderne)`,
                        en: `⚡ up to ${feedCap} generations per feed (modern-gas wallet)`,
                      })}
                    </span>
                  )}
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
                  ? t({ fr: "Connectez-vous pour nourrir", en: "Connect to feed" })
                  : !onSepolia
                    ? t({ fr: "Passez sur Sepolia pour nourrir", en: "Switch to Sepolia to feed" })
                    : status === "signing"
                      ? t({ fr: "Confirmez dans votre portefeuille…", en: "Confirm in your wallet…" })
                      : status === "pending"
                        ? t({ fr: "Alimentation… (tx en attente)", en: "Feeding… (tx pending)" })
                        : status === "confirmed"
                          ? t({ fr: `✓ Nourrie · +${feedGen} $NUT`, en: `✓ Fed · +${feedGen} $NUT` })
                          : status === "error"
                            ? t({ fr: "Réessayer", en: "Try again" })
                            : t({ fr: `Nourrir & gagner ${feedGen} $NUT`, en: `Feed & get ${feedGen} $NUT` })}
              </button>
              {txHash && (status === "pending" || status === "confirmed") && (
                <a className="tx-link" href={explorerTxUrl(txHash)} target="_blank" rel="noreferrer">
                  {t({ fr: "voir la tx ↗", en: "view tx ↗" })}
                </a>
              )}
              {status === "error" && breatheError && <p className="breathe-err">{breatheError}</p>}
              {connected && onSepolia && (
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
                  <button
                    className="btn breathe-btn"
                    onClick={() => (petStatus === "error" ? petReset() : pet(decId))}
                    disabled={petStatus === "signing" || petStatus === "pending" || busy}
                  >
                    {petStatus === "signing"
                      ? t({ fr: "Confirmez dans votre portefeuille…", en: "Confirm in your wallet…" })
                      : petStatus === "pending"
                        ? t({ fr: "Caresse… (tx en attente)", en: "Petting… (tx pending)" })
                        : petStatus === "confirmed"
                          ? t({ fr: "✓ Caressée — le lien est ravivé", en: "✓ Petted — the bond is renewed" })
                          : petStatus === "error"
                            ? t({ fr: "Réessayer la caresse", en: "Retry the pet" })
                            : bond?.held
                              ? t({ fr: "🤲 Caresser · un souffle", en: "🤲 Pet · one breath" })
                              : t({ fr: "🤲 L'adopter · un souffle", en: "🤲 Adopt it · one breath" })}
                  </button>
                  {(() => {
                    const left = daysLeft(bond);
                    if (left === null)
                      return (
                        <p className="breathe-hint">
                          {t({
                            fr: "caressez-la pour tisser un lien : un souffle par caresse, et revenez sous 7 jours — sinon le lien fane.",
                            en: "pet it to form a bond: one breath per pet, and come back within 7 days — or the bond wilts.",
                          })}
                        </p>
                      );
                    if (left <= 0)
                      return (
                        <p className="breathe-err">
                          {t({
                            fr: "votre lien a fané — n'importe qui peut le récolter. Une caresse le ravive.",
                            en: "your bond has wilted — anyone can reap it. A pet revives it.",
                          })}
                        </p>
                      );
                    return (
                      <p className="breathe-hint">
                        {t({
                          fr: `votre lien : encore ${left >= 1 ? `${Math.floor(left)} j` : `${Math.max(1, Math.round(left * 24))} h`} avant qu'il ne fane.`,
                          en: `your bond: ${left >= 1 ? `${Math.floor(left)} days` : `${Math.max(1, Math.round(left * 24))} hours`} before it wilts.`,
                        })}
                      </p>
                    );
                  })()}
                  {petStatus === "error" && petError && <p className="breathe-err">{petError}</p>}
                </div>
              )}
              {status === "idle" && connected && (
                <p className="breathe-hint">{t({ fr: "nourrissez-la — chaque génération la garde en vie et vous rapporte 1 $NUT.", en: "feed it forward — each generation keeps it alive and earns you 1 $NUT." })}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}

/* ---------- a minted PATH creature (a transient that leads into a loop) ---------- */
type JsPath = {
  token_id: string;
  owner: string;
  life_state: string; // "alive" | "frozen" | "dead"
  sequence_length: number;
  start_state: number[];
  target_loop_id: string;
  target_period: number;
  minted_at: number;
  escrow: string;
};

function PathDetail({ id }: { id: string }) {
  const { t } = useT();
  const { sdk } = useGolSdk();
  const { address, execute, waitForTx } = useWallet();
  const [pf, setPf] = useState<JsPath | null>(null);
  const [rp, setRp] = useState<{ bg: number; cell: number; speed: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<{ bg: number; cell: number; speed: number } | null>(null);
  const [editStatus, setEditStatus] = useState<"idle" | "signing" | "pending" | "confirmed" | "error">("idle");
  const [editErr, setEditErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!sdk) return;
    const [p, params] = await Promise.all([sdk.pathLifeform(id), sdk.pathRenderParams(id)]);
    setPf((p as JsPath) ?? null);
    setRp((params as { bg: number; cell: number; speed: number } | null) ?? null);
    setLoading(false);
  }, [sdk, id]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (rp) setEdit({ ...rp });
  }, [rp]);

  if (loading) return <Shell><p className="status-line"><span className="spinner" /> {t({ fr: "lecture de la chaîne…", en: "reading the chain…" })}</p></Shell>;
  if (!pf) return <Shell><p className="status-line">{t({ fr: `aucun chemin #${id} sur Sepolia.`, en: `no path #${id} is minted on Sepolia.` })}</p></Shell>;

  const isOwner = !!address && sameId(address, pf.owner);
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
      const calls = sdk.setPathRenderParamsCall(pf.token_id, edit.bg, edit.cell, edit.speed);
      const hash = await execute(calls);
      setEditStatus("pending");
      await waitForTx(hash);
      setEditStatus("confirmed");
      await load();
      setTimeout(() => setEditStatus("idle"), 1800);
    } catch (e) {
      setEditErr(e instanceof Error ? e.message : String(e));
      setEditStatus("error");
    }
  };

  const lifeLabel =
    pf.life_state === "dead"
      ? t({ fr: "Mort · s’éteint dans le vide", en: "Dead · fades to nothing" })
      : pf.life_state === "frozen"
        ? t({ fr: "Figé · devient une nature morte", en: "Frozen · settles to a still life" })
        : t({ fr: "Vivant · rejoint une boucle", en: "Alive · joins a dynamic loop" });

  return (
    <Shell>
      <div className="detail">
        <div className="stage">
          {/* the exact on-chain render of the path's start state (the contract's renderer). */}
          {rp ? (
            <div className="svg-frame">
              <iframe
                srcDoc={onchainHtml(pf.start_state, rp.bg, rp.cell, rp.speed)}
                title={`On-chain renderer for path ${tokenIdDecimal(pf.token_id)}`}
                sandbox="allow-scripts"
                style={{ width: "100%", height: "100%", border: 0, background: "var(--bg-dish)" }}
              />
            </div>
          ) : (
            <div className="svg-frame" style={{ background: "var(--bg-dish)" }} />
          )}
        </div>
        <div>
          <span className="kicker">{t({ fr: "un chemin · vit sur Starknet", en: "a path · living on Starknet" })}</span>
          <div className="meta-row">
            <Copyable label={t({ fr: "propriétaire", en: "owner" })} value={pf.owner} display={shortAddr(pf.owner)} />
            <Copyable label={t({ fr: "token", en: "token" })} value={pf.token_id} display={shortAddr(pf.token_id)} />
          </div>

          <div className="trait-grid">
            <Trait t={t({ fr: "Type", en: "Kind" })} v={t({ fr: "Chemin", en: "Path" })} />
            <Trait t={t({ fr: "État", en: "State" })} v={lifeLabel} />
            <Trait t={t({ fr: "Longueur", en: "Length" })} v={String(pf.sequence_length)} />
            {pf.life_state !== "dead" && (
              <Trait t={t({ fr: "Période de la boucle", en: "Loop period" })} v={String(pf.target_period)} />
            )}
            {rp && <Trait t={t({ fr: "Fond", en: "Background" })} v={<Swatch color={toHexColor(rp.bg)} />} />}
            {rp && <Trait t={t({ fr: "Cellule", en: "Cell" })} v={<Swatch color={toHexColor(rp.cell)} />} />}
            {rp && <Trait t={t({ fr: "Vitesse", en: "Speed" })} v={`${rp.speed} ${t({ fr: "gén/s", en: "gen/s" })}`} />}
          </div>

          {/* Appearance is owner-only; the values show read-only in the grid above. */}
          {isOwner && rp && edit && (
            <div style={{ marginTop: 14 }}>
              <div className="note" style={{ marginBottom: 6 }}>{t({ fr: "apparence · à vous de régler", en: "appearance · yours to tune" })}</div>
              <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center" }}>
                <label className="note" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {t({ fr: "fond", en: "background" })}
                  <input type="color" value={toHexColor(edit.bg)} onChange={(e) => setEdit({ ...edit, bg: fromHexColor(e.target.value) })} />
                </label>
                <label className="note" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {t({ fr: "cellule", en: "cell" })}
                  <input type="color" value={toHexColor(edit.cell)} onChange={(e) => setEdit({ ...edit, cell: fromHexColor(e.target.value) })} />
                </label>
                <label className="note" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {t({ fr: "vitesse", en: "speed" })}
                  <input type="number" min={1} max={SPEED_MAX - 1} value={edit.speed} onChange={(e) => setEdit({ ...edit, speed: Math.max(1, Math.min(SPEED_MAX - 1, Number(e.target.value) || 1)) })} style={{ width: 64 }} />
                </label>
              </div>
              {editChanged && (
                <div style={{ marginTop: 10 }}>
                  {editInvalid && <p className="breathe-err">{t({ fr: "le fond et la cellule doivent différer", en: "background and cell colour must differ" })}</p>}
                  <button className="btn primary" onClick={doEdit} disabled={editBusy || editInvalid}>
                    {editStatus === "signing"
                      ? t({ fr: "Confirmez dans votre portefeuille…", en: "Confirm in your wallet…" })
                      : editStatus === "pending"
                        ? t({ fr: "Modification… (tx en attente)", en: "Editing… (tx pending)" })
                        : editStatus === "confirmed"
                          ? t({ fr: "✓ Modifiée", en: "✓ Edited" })
                          : editStatus === "error"
                            ? t({ fr: "Réessayer", en: "Try again" })
                            : t({ fr: "Modifier le chemin", en: "Edit path" })}
                  </button>
                  {editErr && editStatus === "error" && <p className="breathe-err">{editErr}</p>}
                </div>
              )}
            </div>
          )}

          {pf.life_state !== "dead" && (
            <p className="dim" style={{ maxWidth: "46ch", marginTop: 14 }}>
              {t({ fr: "Ce chemin mène à une ", en: "This path leads into a " })}
              <Link className="tx-link" href={`/life/${pf.target_loop_id}`}>{t({ fr: "boucle →", en: "loop →" })}</Link>
            </p>
          )}
          <p className="dim" style={{ maxWidth: "46ch" }}>
            {t({
              fr: "Un chemin est un instantané figé : il ne se nourrit pas. Sa rareté tient à sa longueur — plus il est loin de sa boucle, plus il est rare.",
              en: "A path is a frozen snapshot: it can't be fed. Its rarity is its length — the farther from its loop, the rarer.",
            })}
          </p>
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
  const { t } = useT();
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
    const tokenId = sdk.familyTokenId(new Float64Array(loop.smallest), loop.period) as string;
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
          <span className="kicker">{t({ fr: "en attente de découverte · pas encore sur la chaîne", en: "waiting to be discovered · not yet on chain" })}</span>
          <h1>{beast.name}</h1>
          <p className="dim" style={{ maxWidth: "46ch" }}>
            {t({
              fr: `Un${beast.family === "spaceship" ? " vaisseau" : beast.family === "still" ? "e nature morte" : " oscillateur"} connu du répertoire de Conway. Découvrez-le sur le plateau, puis faites-le naître pour le libérer — vivant sur Starknet, indépendant de vous.`,
              en: `A known ${beast.family === "spaceship" ? "spaceship" : beast.family === "still" ? "still life" : "oscillator"} from Conway’s reservoir. Discover it on the board, then mint it to set it free — alive on Starknet, independent of you.`,
            })}
          </p>

          <div className="trait-grid">
            <Trait t={t({ fr: "Type", en: "Kind" })} v={beast.kind} />
            <Trait t={t({ fr: "Destinée", en: "Fate" })} v={info.kind === "toolarge" ? t({ fr: "Voyage sans fin", en: "Travels forever" }) : t({ fr: "Vivant · une boucle", en: "Alive · a loop" })} />
            <Trait t={t({ fr: "Longueur de boucle", en: "Loop length" })} v={period ? String(period) : info.kind === "toolarge" ? t({ fr: "grande", en: "large" }) : "…"} />
            <Trait t={t({ fr: "Coût de naissance", en: "Mint cost" })} v={period ? `${period} NUT` : "—"} />
          </div>

          {info.kind === "toolarge" && (
            <div className="callout">
              {t({
                fr: "Ce voyageur ne se stabilise jamais en une petite boucle sur le tore 41×41 — sa période est trop grande pour une naissance bon marché. Rencontrez-le et regardez-le vivre.",
                en: "This traveller never settles into a small loop on the 41×41 torus — its period is too large to mint cheaply. Meet it and watch it live.",
              })}
            </div>
          )}
          {ready?.minted && (
            <div className="callout">
              {t({ fr: "Déjà découverte — cette créature vit sur Starknet. ", en: "Already discovered — this creature lives on Starknet. " })}
              <Link className="tx-link" href={`/life/${ready.tokenId}`}>{t({ fr: "la rencontrer ↗", en: "meet it ↗" })}</Link>
            </div>
          )}

          <div style={{ marginTop: 18 }}>
            {info.kind === "loading" ? (
              <button className="btn" disabled><span className="spinner" /> {t({ fr: "lecture de la chaîne…", en: "reading the chain…" })}</button>
            ) : info.kind === "toolarge" ? (
              <button className="btn" disabled title={t({ fr: "Boucle trop grande pour une naissance bon marché", en: "Loop too large to mint cheaply" })}>{t({ fr: "Pas encore libérable", en: "Can’t be set free yet" })}</button>
            ) : ready?.minted ? (
              <Link className="btn primary" href={`/life/${ready.tokenId}`}>{t({ fr: "Rencontrer cette créature →", en: "Meet this creature →" })}</Link>
            ) : !address ? (
              <button className="btn" onClick={connect}>{t({ fr: "Connectez-vous pour la libérer", en: "Connect to set it free" })}</button>
            ) : !onSepolia ? (
              <button className="btn primary" onClick={switchToSepolia}>{t({ fr: "Passez sur Sepolia pour faire naître", en: "Switch to Sepolia to mint" })}</button>
            ) : (
              <button
                className="btn primary breathe-btn"
                onClick={() => (status === "error" ? reset() : ready && mint(ready.smallest, ready.period))}
                disabled={busy}
              >
                {status === "signing"
                  ? t({ fr: "Confirmez dans votre portefeuille…", en: "Confirm in your wallet…" })
                  : status === "pending"
                    ? t({ fr: "Libération… (tx en attente)", en: "Setting it free… (tx pending)" })
                    : status === "confirmed"
                      ? t({ fr: "✓ Née — on vous y emmène…", en: "✓ Born — taking you there…" })
                      : status === "error"
                        ? t({ fr: "Réessayer", en: "Try again" })
                        : t({ fr: `La libérer · ${period} NUT`, en: `Set it free · ${period} NUT` })}
              </button>
            )}
            {txHash && (status === "pending" || status === "confirmed") && (
              <a className="tx-link" href={explorerTxUrl(txHash)} target="_blank" rel="noreferrer" style={{ marginLeft: 12 }}>{t({ fr: "voir la tx ↗", en: "view tx ↗" })}</a>
            )}
            {status === "error" && error && <p className="breathe-err">{error}</p>}
          </div>
        </div>
      </div>
    </Shell>
  );
}

function Trait({ t, v }: { t: string; v: ReactNode }) {
  return (
    <div className="trait">
      <div className="t">{t}</div>
      <div className="v">{v}</div>
    </div>
  );
}

// Click to copy the full value to the clipboard (shows a brief "copied!").
function Copyable({ label, value, display }: { label: string; value: string; display: string }) {
  const { t } = useT();
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
      title={t({ fr: "Cliquer pour copier", en: "Click to copy" })}
      style={{ cursor: "pointer" }}
    >
      {label} <span className="mono">{copied ? t({ fr: "copié !", en: "copied!" }) : display}</span>
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
  const { t } = useT();
  return (
    <div className="wrap">
      {children}
      <Link href="/" className="back-link">{t({ fr: "← retour au jardin", en: "← back to the garden" })}</Link>
    </div>
  );
}
