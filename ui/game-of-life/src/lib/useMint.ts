"use client";

import { useCallback, useState } from "react";
import { useGolSdk } from "./sdk";
import { useWallet } from "./wallet";
import { useT, type Dict } from "./i18n";
import { clearMintProgress, getMintProgress, saveMintProgress } from "./incubator";
import { MAX_TX, useGasCaps } from "./gasCaps";

export type MintStatus = "idle" | "signing" | "pending" | "confirmed" | "error";
export type MintProgressState = { current: number; total: number; label: string } | null;

// Mint planning is sized per-wallet: the per-tx step budget under the ~1.2B wallet cap depends on the
// connected account's gas-metering tier (modern Sierra-gas ≈ 3.0M/gen vs legacy Cairo-steps ≈ 14M/gen
// — a ~4.6× difference set by the account's Sierra version, NOT the pattern). `useGasCaps()` resolves
// the tier from the connected account and yields chunkSteps / singleShotMax; the planner tiles the
// loop into ≤ MAX_TX overlapping partial-path segments to fit. See gasCaps.ts and [[gol-feed-gas-cap]].

type PlanStep = { label: string; calls: unknown[] };
type Plan = { steps: PlanStep[]; txCount: number; singleShot: boolean; tooLong: boolean };

function humanize(e: unknown, t: (d: Dict) => string): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/reject|abort|denied|cancel/i.test(m))
    return t({ fr: "Vous avez refusé la signature.", en: "You declined the signature." });
  if (/max l2gas|out of gas|gas.*too low|exceeded the max|resource bounds/i.test(m))
    return t({
      fr: "Boucle trop longue pour cette étape : le portefeuille a sous-estimé le gas.",
      en: "This step is too heavy — the wallet under-estimated the gas.",
    });
  if (/insufficient|balance|funds|allowance/i.test(m))
    return t({ fr: "Pas assez de gas Sepolia ou de NUT pour faire naître.", en: "Not enough Sepolia gas or NUT to mint." });
  const msg = m.trim();
  if (!msg)
    return t({
      fr: "Votre portefeuille n'a pas diffusé la transaction. Réessayez, ou utilisez un autre portefeuille Starknet (ArgentX, Braavos).",
      en: "Your wallet didn't broadcast the transaction. Try again, or use another Starknet wallet (ArgentX, Braavos).",
    });
  return msg.length > 140 ? msg.slice(0, 137) + "…" : msg;
}

const isRejection = (e: unknown) =>
  /reject|abort|denied|cancel/i.test(e instanceof Error ? e.message : String(e));

/**
 * Discover-&-mint, single- or multi-transaction. Short loops mint in one tx; long loops (whose
 * on-chain verification exceeds the wallet's per-tx gas cap) are minted as a sequence of partial-path
 * segments via the SDK planner — fired one after another, each its own wallet prompt, with progress,
 * one silent retry on a transient failure, and resume (skips steps already done on-chain).
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

  // `rows` = the loop's canonical (smallest) state as 41 row bitmasks; `period` = its length.
  const mint = useCallback(
    async (rows: number[], period: number): Promise<boolean> => {
      if (!sdk) return false;
      if (!address) {
        await connect();
        return false;
      }
      setError(null);
      setTxHash(null);
      setTooLong(false);

      let plan: Plan;
      let loopId: string;
      try {
        const r = new Float64Array(rows);
        loopId = sdk.tokenIdForRows(r) as string;
        plan = sdk.planLoopMint(r, period, address, chunkSteps, singleShotMax, MAX_TX) as Plan;
      } catch (e) {
        setError(humanize(e, t));
        setStatus("error");
        return false;
      }

      if (plan.tooLong) {
        setTooLong(true);
        setError(
          t({
            fr: `Boucle trop longue à faire naître pour l'instant (${plan.txCount} transactions, max ${MAX_TX}).`,
            en: `This loop is too long to mint right now (${plan.txCount} transactions, max ${MAX_TX}).`,
          })
        );
        setStatus("error");
        return false;
      }

      const total = plan.steps.length;
      const multi = total > 1;
      // resume: skip steps already completed on-chain (only when the plan shape matches).
      const prior = getMintProgress(loopId);
      const start = prior && prior.total === total ? Math.min(prior.done, total) : 0;

      for (let i = start; i < total; i++) {
        const step = plan.steps[i];
        setProgress(multi ? { current: i + 1, total, label: step.label } : null);
        setStatus("signing");
        let ok = false;
        for (let attempt = 0; attempt < 2 && !ok; attempt++) {
          try {
            const hash = await execute(step.calls);
            setTxHash(hash);
            setStatus("pending");
            // Wait for L2 acceptance (not just pre-confirmed): a later step (combine / final mint)
            // reads this tx's on-chain writes, and after the final step the app redirects to the
            // creature page, which reads confirmed chain state — both need the writes in a block.
            await waitForTxAccepted(hash); // throws on revert/reject
            ok = true;
          } catch (e) {
            // Don't auto-retry a deliberate rejection, and never retry more than once.
            if (attempt === 1 || isRejection(e)) {
              if (multi) saveMintProgress({ id: loopId, rows, period, done: i, total, updatedAt: Date.now() });
              setError(humanize(e, t));
              setStatus("error");
              return false;
            }
            await new Promise((r) => setTimeout(r, 800)); // brief backoff, then one retry
            setStatus("signing");
          }
        }
        if (multi) saveMintProgress({ id: loopId, rows, period, done: i + 1, total, updatedAt: Date.now() });
      }

      clearMintProgress(loopId);
      setProgress(null);
      setStatus("confirmed");
      return true;
    },
    [sdk, address, connect, execute, waitForTxAccepted, chunkSteps, singleShotMax, t]
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
    setTxHash(null);
    setProgress(null);
    setTooLong(false);
  }, []);

  return { status, txHash, error, progress, tooLong, mint, reset, connected: !!address };
}
