"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GolCanvas from "@/components/GolCanvas";
import { useGolSdk } from "@/lib/sdk";
import { useWallet } from "@/lib/wallet";
import { useMint } from "@/lib/useMint";
import { useGasCaps, plannedTxCount, plannedPathTxCount, MAX_TX } from "@/lib/gasCaps";
import { N, type Cells, fromRows, rowsFromCells, liveCountRows } from "@/lib/creatures";
import { explorerTxUrl } from "@/lib/config";
import { useT } from "@/lib/i18n";
import { addBookmark, removeBookmark, isBookmarked, getMintProgress } from "@/lib/incubator";

const EMPTY: Cells = new Array(N * N).fill(false);
const isEmpty = (rows: number[]) => rows.every((r) => r === 0);
const rowsKey = (rows: number[]) => rows.join(",");
const rowsLt = (a: number[], b: number[]) => {
  for (let i = 0; i < N; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
};
const step = (sdk: { stepRows: (r: Float64Array) => unknown }, rows: number[]) =>
  Array.from(sdk.stepRows(new Float64Array(rows)) as ArrayLike<number>);

type Fate =
  | { kind: "empty" }
  | { kind: "computing" }
  | { kind: "dead"; steps: number }
  | { kind: "transient" }
  | { kind: "loop"; period: number; steps: number; canonical: number[] };

const pad = (n: number) => String(Math.max(0, Math.round(n))).padStart(4, "0");

/** One slot-machine reel digit. When `spin`, the 0-9 strip scrolls forever (casino reel); otherwise
 *  it lands on `digit`. A staggered duration/delay per reel keeps the reels out of lockstep. */
function Reel({ digit, spin, idx }: { digit: number; spin: boolean; idx: number }) {
  return (
    <span className="reel">
      <span
        className={"reel-strip" + (spin ? " spin" : "")}
        style={
          spin
            ? { animationDuration: `${0.3 + (idx % 3) * 0.07}s`, animationDelay: `${(idx % 4) * -90}ms` }
            : { transform: `translateY(-${digit}em)` }
        }
      >
        {Array.from({ length: 11 }, (_, i) => (
          <span key={i} className="reel-digit">{i % 10}</span>
        ))}
      </span>
    </span>
  );
}

/** A zero-padded number rendered as a row of reels. */
function Reels({ value, spin, tone }: { value: number; spin: boolean; tone: string }) {
  return (
    <span className={"reels tone-" + tone}>
      {pad(value)
        .split("")
        .map((ch, i) => (
          <Reel key={i} digit={Number(ch)} spin={spin} idx={i} />
        ))}
    </span>
  );
}

/** A 90s casino slot machine for a drawing's destiny, revealed AS the live grid advances:
 *  Sequence counts up with the grid; Loop + Amplitude spin until the grid reaches its loop, then
 *  the reels lock onto the result. `idle` = nothing drawn yet, `win` = locked onto a real loop. */
function SlotScore({
  seq,
  loopLen,
  amp,
  spinning,
  idle,
  win,
}: {
  seq: number;
  loopLen: number;
  amp: number;
  spinning: boolean;
  idle: boolean;
  win: boolean;
}) {
  const { t } = useT();
  return (
    <div className={"slot" + (idle ? " idle" : "") + (win ? " win" : "")}>
      <span className="slot-marquee">★&nbsp;Score&nbsp;★</span>
      <span className="slot-bay">
        <span className="slot-label">{t({ fr: "Séquence", en: "Sequence" })}</span>
        <Reels value={seq} spin={false} tone="seq" />
      </span>
      <span className="slot-bay">
        <span className="slot-label">{t({ fr: "Boucle", en: "Loop" })}</span>
        <Reels value={loopLen} spin={spinning} tone="loop" />
      </span>
      <span className="slot-bay">
        <span className="slot-label">{t({ fr: "Amplitude", en: "Amplitude" })}</span>
        <Reels value={amp} spin={false} tone="amp" />
      </span>
    </div>
  );
}

/** The spawn button, status-aware (idle → signing → pending → confirmed/error). One instance drives
 *  whichever creature (loop or path) the drawing settles into, so its status text is unambiguous. */
function SpawnButton({
  status,
  progress,
  busy,
  onClick,
  idleLabel,
  t,
}: {
  status: string;
  progress: { current: number; total: number } | null;
  busy: boolean;
  onClick: () => void;
  idleLabel: string;
  t: (d: { fr: string; en: string }) => string;
}) {
  return (
    <button className="btn primary breathe-btn" onClick={onClick} disabled={busy}>
      {status === "signing"
        ? progress
          ? t({ fr: `Confirmez l'étape ${progress.current}/${progress.total}…`, en: `Confirm step ${progress.current}/${progress.total}…` })
          : t({ fr: "Confirmez dans votre portefeuille…", en: "Confirm in your wallet…" })
        : status === "pending"
          ? progress
            ? t({ fr: `Vérification… (${progress.current}/${progress.total})`, en: `Verifying… (${progress.current}/${progress.total})` })
            : t({ fr: "Naissance… (tx en attente)", en: "Spawning… (tx pending)" })
          : status === "confirmed"
            ? t({ fr: "✓ Née — on vous y emmène…", en: "✓ Spawned — taking you there…" })
            : status === "error"
              ? t({ fr: "Réessayer", en: "Try again" })
              : idleLabel}
    </button>
  );
}

export default function CreatePage() {
  const { t } = useT();
  const { sdk } = useGolSdk();
  const { address, connect, onSepolia, switchToSepolia } = useWallet();
  const { status, txHash, error: mintError, progress, mint, mintPath, reset } = useMint();
  const caps = useGasCaps();
  const router = useRouter();

  const [left, setLeft] = useState<Cells>(EMPTY);
  const [rightRows, setRightRows] = useState<number[]>(() => rowsFromCells(EMPTY));
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(15);
  const [gen, setGen] = useState(0);
  const [fate, setFate] = useState<Fate>({ kind: "empty" });
  const [tokenId, setTokenId] = useState<string | null>(null);
  const [alreadyMinted, setAlreadyMinted] = useState(false);
  // amplitude observed live: max - min population seen so far this run (resets with the drawing)
  const popMin = useRef(Infinity);
  const popMax = useRef(-Infinity);
  const [ampLive, setAmpLive] = useState(0);
  // Path minting: the DRAWING itself, when it's a transient leading into a loop (or into death).
  const [pathTokenId, setPathTokenId] = useState<string | null>(null);
  const [pathMinted, setPathMinted] = useState(false);
  // A drawing that settles into a loop offers TWO spawns (the path it is, the loop it becomes); one
  // shared mint status → track which is in-flight so only that button reflects it, and redirect there.
  const [activeKind, setActiveKind] = useState<"loop" | "path" | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [bmTick, setBmTick] = useState(0); // bump to re-read bookmark state after a toggle

  const paint = useCallback((i: number, value: boolean) => {
    setLeft((prev) => (prev[i] === value ? prev : prev.map((v, k) => (k === i ? value : v))));
  }, []);

  const leftRows = useMemo(() => rowsFromCells(left), [left]);
  // the right sim only runs once there's a drawing — so it stays idle on page load and after Clear,
  // and only begins after the first left-grid interaction.
  const hasDrawing = useMemo(() => !isEmpty(leftRows), [leftRows]);

  // restart the live sim whenever the drawing changes
  useEffect(() => {
    setRightRows(leftRows);
    setGen(0);
    popMin.current = Infinity;
    popMax.current = -Infinity;
    setAmpLive(0);
    reset();
  }, [leftRows, reset]);

  // live evolution — the SDK's on-chain stepper, so it matches the contract exactly
  useEffect(() => {
    if (!sdk || !playing || !hasDrawing) return;
    const id = setInterval(() => {
      setRightRows((prev) => step(sdk, prev));
      setGen((g) => g + 1);
    }, Math.max(1000 / speed, 16));
    return () => clearInterval(id);
  }, [sdk, playing, speed, hasDrawing]);

  // amplitude in real time: fold each live generation's population into the running min/max
  useEffect(() => {
    if (!hasDrawing) return;
    const pop = liveCountRows(rightRows);
    let changed = false;
    if (pop < popMin.current) {
      popMin.current = pop;
      changed = true;
    }
    if (pop > popMax.current) {
      popMax.current = pop;
      changed = true;
    }
    if (changed) setAmpLive(popMax.current - popMin.current);
  }, [rightRows, hasDrawing]);

  // fate (debounced): step until the drawing settles into a loop or dies, to find the mintable loop
  useEffect(() => {
    if (!sdk) return;
    if (isEmpty(leftRows)) {
      setFate({ kind: "empty" });
      return;
    }
    setFate({ kind: "computing" });
    const t = setTimeout(() => {
      let cur = leftRows;
      const seen = new Map<string, number>();
      const history: number[][] = [];
      // a 41×41 torus is finite so it must eventually cycle; search far enough to catch patterns
      // that wander for thousands of generations before settling into their loop.
      const CAP = 10000;
      let result: Fate = { kind: "transient" };
      for (let s = 0; s < CAP; s++) {
        if (isEmpty(cur)) {
          result = { kind: "dead", steps: s };
          break;
        }
        const key = rowsKey(cur);
        const first = seen.get(key);
        if (first !== undefined) {
          const loop = history.slice(first);
          let canonical = loop[0];
          for (const st of loop) if (rowsLt(st, canonical)) canonical = st;
          result = { kind: "loop", period: history.length - first, steps: first, canonical };
          break;
        }
        seen.set(key, s);
        history.push(cur);
        cur = step(sdk, cur);
      }
      setFate(result);
    }, 250);
    return () => clearTimeout(t);
  }, [leftRows, sdk]);

  // token id + already-minted check, once the drawing settles into a loop
  useEffect(() => {
    if (!sdk || fate.kind !== "loop") {
      setTokenId(null);
      setAlreadyMinted(false);
      return;
    }
    let cancelled = false;
    const id = sdk.tokenIdForRows(new Float64Array(fate.canonical)) as string;
    setTokenId(id);
    setAlreadyMinted(false);
    sdk.lifeform(id).then((lf) => {
      if (!cancelled && lf) setAlreadyMinted(true);
    });
    return () => {
      cancelled = true;
    };
  }, [sdk, fate]);

  // path token id + already-minted, when the DRAWING is a transient into a loop (or into death) —
  // i.e. it settles after >0 steps, or it dies out. The path creature IS the drawing (its start state).
  const pathMintable =
    (fate.kind === "loop" && fate.steps > 0) || fate.kind === "dead";
  useEffect(() => {
    if (!sdk || !pathMintable) {
      setPathTokenId(null);
      setPathMinted(false);
      return;
    }
    let cancelled = false;
    const id = sdk.tokenIdForRows(new Float64Array(leftRows)) as string;
    setPathTokenId(id);
    setPathMinted(false);
    sdk.pathLifeform(id).then((p) => {
      if (!cancelled && p) setPathMinted(true);
    });
    return () => {
      cancelled = true;
    };
  }, [sdk, pathMintable, leftRows]);

  // on a confirmed mint, send them to their newborn creature (the one just spawned — loop or path)
  useEffect(() => {
    const target = activeId ?? tokenId;
    if (status === "confirmed" && target) {
      const t = setTimeout(() => router.push(`/life/${target}`), 1200);
      return () => clearTimeout(t);
    }
  }, [status, activeId, tokenId, router]);

  const rightCells = useMemo(() => fromRows(rightRows), [rightRows]);
  const busy = status === "signing" || status === "pending";
  const loop = fate.kind === "loop" ? fate : null;
  const dead = fate.kind === "dead" ? fate : null;

  // The drawing can offer up to two spawns: the PATH it is (its start state) and/or the LOOP it
  // settles into. A drawing already on a loop (steps 0) offers only the loop; a dying drawing offers
  // only the (dead) path; a transient into a live loop offers both — path first (it's the drawing).
  const pathSpawn =
    (loop && loop.steps > 0) || dead
      ? {
          kind: "path" as const,
          rows: leftRows,
          tokenId: pathTokenId,
          already: pathMinted,
          nut: loop ? loop.steps : dead!.steps,
          tx: plannedPathTxCount(loop ? loop.steps : dead!.steps, loop ? loop.period : 1, caps),
          loopPeriod: loop ? loop.period : 1,
          run: () => {
            setActiveId(pathTokenId);
            setActiveKind("path");
            void mintPath(leftRows, loop ? loop.steps : dead!.steps, loop ? loop.period : 1);
          },
        }
      : null;
  const loopSpawn = loop
    ? {
        kind: "loop" as const,
        rows: loop.canonical,
        tokenId,
        already: alreadyMinted,
        nut: loop.period,
        tx: plannedTxCount(loop.period, caps),
        loopPeriod: loop.period,
        run: () => {
          setActiveId(tokenId);
          setActiveKind("loop");
          void mint(loop.canonical, loop.period);
        },
      }
    : null;
  type SpawnDesc = NonNullable<typeof pathSpawn> | NonNullable<typeof loopSpawn>;
  const options: SpawnDesc[] = [pathSpawn, loopSpawn].filter(Boolean) as SpawnDesc[];
  const anyMulti = options.some((o) => !o.already && o.tx > 1 && o.tx <= MAX_TX);

  // One spawn option row: its own button (status only when it's the in-flight one) + bookmark. `bmTick`
  // is read so a bookmark toggle re-renders.
  const renderOption = (desc: SpawnDesc) => {
    void bmTick;
    const tooLong = desc.tx > MAX_TX;
    const active = activeKind === desc.kind;
    const resume = desc.tokenId ? getMintProgress(desc.tokenId) : null;
    const bm = desc.tokenId ? isBookmarked(desc.tokenId) : false;
    const base =
      desc.kind === "path"
        ? t({ fr: "Faire naître le chemin", en: "Spawn this path" })
        : t({ fr: "Faire naître la boucle", en: "Spawn the loop" });
    const idle = resume
      ? t({ fr: `Reprendre (${resume.done}/${resume.total}) · ${desc.nut} NUT`, en: `Resume (${resume.done}/${resume.total}) · ${desc.nut} NUT` })
      : desc.tx > 1
        ? t({ fr: `${base} · ${desc.nut} NUT · ${desc.tx} tx`, en: `${base} · ${desc.nut} NUT · ${desc.tx} txs` })
        : t({ fr: `${base} · ${desc.nut} NUT`, en: `${base} · ${desc.nut} NUT` });
    return (
      <div key={desc.kind} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        {desc.already ? (
          <Link className="btn primary" href={`/life/${desc.tokenId}`}>
            {desc.kind === "path"
              ? t({ fr: "Chemin déjà né → le rencontrer", en: "Path already born → meet it" })
              : t({ fr: "Boucle déjà née → la rencontrer", en: "Loop already born → meet it" })}
          </Link>
        ) : !address ? (
          <button className="btn" onClick={connect}>{base}</button>
        ) : !onSepolia ? (
          <button className="btn primary" onClick={switchToSepolia}>{t({ fr: "Passez sur Sepolia", en: "Switch to Sepolia" })}</button>
        ) : tooLong ? (
          <span className="note">{t({ fr: `${base} : trop long (~${desc.tx} tx, max ${MAX_TX}).`, en: `${base}: too long (~${desc.tx} txs, max ${MAX_TX}).` })}</span>
        ) : (
          <SpawnButton
            status={active ? status : "idle"}
            progress={active ? progress : null}
            busy={busy}
            onClick={desc.run}
            idleLabel={idle}
            t={t}
          />
        )}
        {!desc.already && desc.tokenId && (
          <button
            className="btn"
            disabled={busy}
            title={t({ fr: "Garder sans faire naître", en: "Save without minting" })}
            onClick={() => {
              if (bm) removeBookmark(desc.tokenId!);
              else addBookmark({ id: desc.tokenId!, rows: desc.rows, period: desc.nut, kind: desc.kind, loopPeriod: desc.loopPeriod, savedAt: Date.now() });
              setBmTick((x) => x + 1);
            }}
          >
            {bm ? t({ fr: "★ Gardée", en: "★ Saved" }) : t({ fr: "☆ Garder", en: "☆ Bookmark" })}
          </button>
        )}
      </div>
    );
  };

  // Slot-machine score, revealed live as the right grid advances. `gen` is the live generation
  // counter; the fate (computed ahead, in the background) is the destiny the live grid converges to,
  // but Loop/Amplitude keep spinning until the grid actually reaches the loop (gen >= steps) — so
  // the result is a surprise, landing in sync with the grid settling.
  const destinySteps = fate.kind === "loop" || fate.kind === "dead" ? fate.steps : Infinity;
  const slotIdle = !hasDrawing;
  const settled = hasDrawing && gen >= destinySteps;
  const slotSpinning = hasDrawing && !settled;
  const slotWin = settled && fate.kind === "loop";
  const seqVal = !hasDrawing ? 0 : destinySteps === Infinity ? gen : Math.min(gen, destinySteps);
  const loopVal = fate.kind === "loop" ? fate.period : 0;
  const ampVal = ampLive;

  return (
    <div className="wrap">
      <div className="head">
        <div className="section-label">{t({ fr: "Créer", en: "Create" })}</div>
        <Link href="/" className="note">{t({ fr: "← le jardin", en: "← the garden" })}</Link>
      </div>
      <SlotScore
        seq={seqVal}
        loopLen={loopVal}
        amp={ampVal}
        spinning={slotSpinning}
        idle={slotIdle}
        win={slotWin}
      />
      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start", margin: "18px 0" }}>
        <div style={{ flex: "1 1 360px", maxWidth: 540 }}>
          <GolCanvas cells={left} editable onPaint={paint} cellColor="#9ad1ff" />
        </div>
        <div style={{ flex: "1 1 360px", maxWidth: 540 }}>
          <GolCanvas cells={rightCells} cellColor="#7ef9a0" />
        </div>
      </div>

      <div className="toggle-row" style={{ alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <button className="btn" onClick={() => setLeft(EMPTY)}>{t({ fr: "Effacer", en: "Clear" })}</button>
        <button className="btn" onClick={() => setPlaying((p) => !p)}>
          {playing ? t({ fr: "Pause", en: "Pause" }) : t({ fr: "Lecture", en: "Play" })}
        </button>
        <label className="note" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {t({ fr: "vitesse", en: "speed" })}
          <input type="range" min={1} max={30} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} />
          {speed}/s
        </label>
      </div>

      <div className="callout" style={{ marginTop: 16 }}>
        {!sdk ? (
          <span><span className="spinner" /> {t({ fr: "préchauffage du moteur…", en: "warming up the engine…" })}</span>
        ) : fate.kind === "empty" ? (
          <span>{t({ fr: "Dessinez quelque chose à gauche pour commencer.", en: "Draw something on the left to begin." })}</span>
        ) : fate.kind === "computing" ? (
          <span><span className="spinner" /> {t({ fr: "on trace sa destinée…", en: "tracing its fate…" })}</span>
        ) : fate.kind === "transient" ? (
          <span>{t({ fr: "Évolue encore après 10 000 générations — aucune boucle trouvée pour l’instant.", en: "Still evolving after 10,000 generations — no loop found yet." })}</span>
        ) : options.length > 0 ? (
          <div>
            <div>
              {loop ? (
                <>
                  {t({ fr: "Se stabilise en une ", en: "Settles into a " })}
                  <b>{t({ fr: `${loop.period === 1 ? "nature morte" : "boucle"} de période ${loop.period}`, en: `period-${loop.period} ${loop.period === 1 ? "still life" : "loop"}` })}</b>
                  {loop.steps > 0
                    ? t({ fr: ` après ${loop.steps} génération${loop.steps === 1 ? "" : "s"}`, en: ` after ${loop.steps} generation${loop.steps === 1 ? "" : "s"}` })
                    : t({ fr: " aussitôt", en: " right away" })}
                  {loop.steps > 0
                    ? t({ fr: " — faites naître le chemin, ou la boucle qu’il rejoint.", en: " — spawn the path, or the loop it joins." })
                    : t({ fr: " — à faire naître.", en: " — ready to spawn." })}
                </>
              ) : dead ? (
                <>{t({ fr: `Un chemin mourant : s’éteint après ${dead.steps} génération${dead.steps === 1 ? "" : "s"} — à faire naître.`, en: `A dying path: fades to nothing after ${dead.steps} generation${dead.steps === 1 ? "" : "s"} — ready to spawn.` })}</>
              ) : null}
            </div>
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              {options.map(renderOption)}
            </div>
            {anyMulti && status !== "error" && address && onSepolia && (
              <p className="note" style={{ marginTop: 8, maxWidth: "52ch" }}>
                {t({
                  fr: "Les longues créatures sont vérifiées par morceaux — votre portefeuille demandera d'approuver plusieurs transactions à la suite.",
                  en: "Long creatures are verified in pieces — your wallet will ask you to approve several transactions in a row.",
                })}
              </p>
            )}
            {txHash && (status === "pending" || status === "confirmed") && (
              <a className="tx-link" href={explorerTxUrl(txHash)} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 8 }}>{t({ fr: "voir la tx ↗", en: "view tx ↗" })}</a>
            )}
            {status === "error" && mintError && <p className="breathe-err" style={{ marginTop: 8 }}>{mintError}</p>}
          </div>
        ) : null}
      </div>
    </div>
  );
}
