"use client";

import { useCallback, useRef, useState } from "react";
import { useGolSdk } from "./sdk";
import { useWallet } from "./wallet";
import { useT, type Dict } from "./i18n";
import { clearMintProgress, getMintProgress, saveMintProgress, type CreatureKind } from "./incubator";
import { MAX_TX, useGasCaps } from "./gasCaps";

export type MintStatus = "idle" | "signing" | "pending" | "confirmed" | "error";
export type MintProgressState = { current: number; total: number; label: string } | null;

// Mint planning is sized per-wallet: the per-tx step budget under the ~1.2B wallet cap depends on the
// connected account's gas-metering tier (modern Sierra-gas ≈ 3.0M/gen vs legacy Cairo-steps ≈ 14M/gen
// — a ~4.6× difference set by the account's Sierra version, NOT the pattern). `useGasCaps()` resolves
// the tier from the connected account and yields chunkSteps / singleShotMax; the planner tiles the
// loop/path into ≤ MAX_TX overlapping partial-path segments to fit. See gasCaps.ts and [[gol-feed-gas-cap]].

type PlanStep = { label: string; calls: unknown[] };
type Plan = { steps: PlanStep[]; txCount: number; singleShot: boolean; tooLong: boolean };
type MintMeta = { rows: number[]; period: number; kind: CreatureKind; loopPeriod?: number; owner?: string };

function humanize(e: unknown, t: (d: Dict) => string): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/reject|abort|denied|cancel/i.test(m))
    return t({ fr: "Tu as refusé la signature.", en: "You declined the signature." });
  if (/max l2gas|out of gas|gas.*too low|exceeded the max|resource bounds/i.test(m))
    return t({
      fr: "Trop lourd pour cette étape : le portefeuille a sous-estimé le gas.",
      en: "This step is too heavy — the wallet under-estimated the gas.",
    });
  if (/insufficient|balance|funds|allowance/i.test(m))
    return t({ fr: "Pas assez de gas Sepolia ou de $NUT pour libérer.", en: "Not enough Sepolia gas or $NUT to set it free." });
  const msg = m.trim();
  if (!msg)
    return t({
      fr: "Ton portefeuille n'a pas diffusé la transaction. Réessaie, ou utilise un autre portefeuille Starknet (ArgentX, Braavos).",
      en: "Your wallet didn't broadcast the transaction. Try again, or use another Starknet wallet (ArgentX, Braavos).",
    });
  return msg.length > 140 ? msg.slice(0, 137) + "…" : msg;
}

const isRejection = (e: unknown) =>
  /reject|abort|denied|cancel/i.test(e instanceof Error ? e.message : String(e));

/**
 * Discover-&-mint a loop (`mint`) or a path (`mintPath`), single- or multi-transaction. Short
 * creatures mint in one tx; long ones (whose on-chain verification exceeds the wallet's per-tx gas
 * cap) are minted as a sequence of partial-path segments via the SDK planner — fired one after
 * another, each its own wallet prompt, with progress, one silent retry on a transient failure, and
 * resume (skips steps already done on-chain). Loops and paths share the orchestration (`runPlan`);
 * they differ only in the planner, the token contract, and the already-minted check.
 */
export function useMint() {
  const { t } = useT();
  const { sdk } = useGolSdk();
  const { address, connect, execute, waitForTxAccepted } = useWallet();
  const { singleShotMax, chunkSteps } = useGasCaps();
  const [status, setStatus] = useState<MintStatus>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<MintProgressState>(null);
  const [tooLong, setTooLong] = useState(false);
  // Some wallets silently drop a signing request that doesn't originate from a user gesture — the
  // execute() promise then never settles and a multi-tx sequence stalls on "signing". After
  // STALL_MS without the wallet answering, `stalled` turns on and the UI offers a Continue button;
  // `continueMint` re-fires the SAME step from the click (a fresh gesture the wallet honors).
  const [stalled, setStalled] = useState(false);
  const pendingStepRef = useRef<null | { calls: unknown[]; deliver: (p: Promise<string>) => void }>(
    null
  );
  const STALL_MS = 25_000;

  // Run a built plan: refuse if too long, short-circuit if already minted, else fire each step with a
  // silent retry + resume. `alreadyMinted` reads the relevant NFT (loop or path) to self-heal an
  // interrupted mint. `meta` is persisted per step so the Incubator can resume the right kind.
  // Fire one step's wallet request, first-settle-wins: the automatic attempt and any number of
  // user-gesture re-fires (continueMint) race; late duplicates are ignored (a re-broadcast segment
  // rewrites the same registry entry; a duplicate final mint reverts harmlessly on-chain).
  const fireStep = useCallback(
    (calls: unknown[]): Promise<string> =>
      new Promise<string>((resolve, reject) => {
        let settled = false;
        const deliver = (p: Promise<string>) => {
          p.then(
            (h) => {
              if (!settled) {
                settled = true;
                pendingStepRef.current = null;
                setStalled(false);
                resolve(h);
              }
            },
            (e) => {
              if (!settled) {
                settled = true;
                pendingStepRef.current = null;
                setStalled(false);
                reject(e);
              }
            }
          );
        };
        pendingStepRef.current = { calls, deliver };
        deliver(execute(calls));
        setTimeout(() => {
          if (!settled) setStalled(true);
        }, STALL_MS);
      }),
    [execute]
  );

  // Re-request the current step's signature from a user click (see `stalled`).
  const continueMint = useCallback(() => {
    const pending = pendingStepRef.current;
    if (pending) {
      setStalled(false);
      pending.deliver(execute(pending.calls));
    }
  }, [execute]);

  const runPlan = useCallback(
    async (
      plan: Plan,
      tokenId: string,
      meta: MintMeta,
      alreadyMinted: (id: string) => Promise<unknown>,
    ): Promise<boolean> => {
      if (plan.tooLong) {
        setTooLong(true);
        setError(
          meta.kind === "path"
            ? t({
                fr: `Cette vagabonde voyage trop loin pour l'instant (${plan.txCount} signatures, max ${MAX_TX}).`,
                en: `This wanderer travels too far to set free right now (${plan.txCount} signatures, max ${MAX_TX}).`,
              })
            : t({
                fr: `Cette boucle est trop longue à libérer pour l'instant (${plan.txCount} signatures, max ${MAX_TX}).`,
                en: `This loop is too long to set free right now (${plan.txCount} signatures, max ${MAX_TX}).`,
              })
        );
        setStatus("error");
        return false;
      }

      // Already minted on-chain? A prior run may have finished while its local progress lingered (e.g.
      // the tab reloaded mid-mint). Don't re-mint — the final step would revert; report success.
      try {
        if (await alreadyMinted(tokenId)) {
          clearMintProgress(tokenId);
          setProgress(null);
          setStatus("confirmed");
          return true;
        }
      } catch {
        // read failed — proceed with the normal plan (the tx itself is the source of truth)
      }

      const total = plan.steps.length;
      const multi = total > 1;
      const prior = getMintProgress(tokenId);
      const start = prior && prior.total === total ? Math.min(prior.done, total) : 0;
      const persist = (done: number) =>
        saveMintProgress({
          id: tokenId,
          rows: meta.rows,
          period: meta.period,
          kind: meta.kind,
          loopPeriod: meta.loopPeriod,
          owner: meta.owner,
          done,
          total,
          updatedAt: Date.now(),
        });

      for (let i = start; i < total; i++) {
        const step = plan.steps[i];
        setProgress(multi ? { current: i + 1, total, label: step.label } : null);
        setStatus("signing");
        if (multi) persist(i); // record the step we're ON, so closing the tab mid-step resumes here
        let ok = false;
        for (let attempt = 0; attempt < 2 && !ok; attempt++) {
          try {
            const hash = await fireStep(step.calls);
            setTxHash(hash);
            setStatus("pending");
            // Wait for L2 acceptance (not just pre-confirmed): a later step reads this tx's writes,
            // and after the final step the app redirects to a page that reads confirmed chain state.
            await waitForTxAccepted(hash); // throws on revert/reject
            ok = true;
          } catch (e) {
            if (attempt === 1 || isRejection(e)) {
              if (multi) persist(i);
              setError(humanize(e, t));
              setStatus("error");
              return false;
            }
            await new Promise((r) => setTimeout(r, 800)); // brief backoff, then one retry
            setStatus("signing");
          }
        }
        if (multi) persist(i + 1);
      }

      clearMintProgress(tokenId);
      setProgress(null);
      setStatus("confirmed");
      return true;
    },
    [fireStep, waitForTxAccepted, t]
  );

  const prep = useCallback(async (): Promise<boolean> => {
    if (!sdk) return false;
    if (!address) {
      await connect();
      return false;
    }
    setError(null);
    setTxHash(null);
    setTooLong(false);
    return true;
  }, [sdk, address, connect]);

  // Owner-defined, permanent-at-birth appearance: 0xRRGGBB ints + generations/second.
  // Appended to the mint's FINAL step so it lands in the same tx that creates the creature (the
  // token exists by then, and the caller is its owner). See /create's "set it free" ritual.
  type Appearance = { bg: number; cell: number; speed: number };

  // Mint a LOOP: `rows` = the loop's canonical (smallest) state; `period` = its length.
  const mint = useCallback(
    async (rows: number[], period: number, appearance?: Appearance): Promise<boolean> => {
      if (!(await prep()) || !sdk || !address) return false;
      let plan: Plan;
      let id: string;
      try {
        const r = new Float64Array(rows);
        id = sdk.familyTokenId(r, period) as string; // v3: the orbit-family id
        plan = sdk.planLoopMint(r, period, address, chunkSteps, singleShotMax, MAX_TX) as Plan;
        if (appearance && !plan.tooLong && plan.steps.length > 0) {
          plan.steps[plan.steps.length - 1].calls.push(
            sdk.setRenderParamsCall(id, appearance.bg, appearance.cell, appearance.speed)
          );
        }
      } catch (e) {
        setError(humanize(e, t));
        setStatus("error");
        return false;
      }
      return runPlan(plan, id, { rows, period, kind: "loop", owner: address }, (i) => sdk.lifeform(i));
    },
    [sdk, address, prep, runPlan, chunkSteps, singleShotMax, t]
  );

  // Mint a PATH: `rows` = the path's start state; `sequenceLength` = its distance to the loop;
  // `loopPeriod` = the terminal loop's period.
  const mintPath = useCallback(
    async (rows: number[], sequenceLength: number, loopPeriod: number, appearance?: Appearance): Promise<boolean> => {
      if (!(await prep()) || !sdk || !address) return false;
      let plan: Plan;
      let id: string;
      try {
        const r = new Float64Array(rows);
        id = sdk.familyTokenId(r, 0) as string; // v3: orbit of the start
        plan = sdk.planPathMint(
          r,
          sequenceLength,
          loopPeriod,
          address,
          chunkSteps,
          singleShotMax,
          MAX_TX
        ) as Plan;
        if (appearance && !plan.tooLong && plan.steps.length > 0) {
          plan.steps[plan.steps.length - 1].calls.push(
            sdk.setPathRenderParamsCall(id, appearance.bg, appearance.cell, appearance.speed)
          );
        }
      } catch (e) {
        setError(humanize(e, t));
        setStatus("error");
        return false;
      }
      return runPlan(
        plan,
        id,
        { rows, period: sequenceLength, kind: "path", loopPeriod, owner: address },
        (i) => sdk.pathLifeform(i)
      );
    },
    [sdk, address, prep, runPlan, chunkSteps, singleShotMax, t]
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
    setTxHash(null);
    setProgress(null);
    setTooLong(false);
    setStalled(false);
    pendingStepRef.current = null;
  }, []);

  return {
    status,
    txHash,
    error,
    progress,
    tooLong,
    stalled,
    continueMint,
    mint,
    mintPath,
    reset,
    connected: !!address,
  };
}
