"use client";

import { useCallback, useState } from "react";
import { useGolSdk } from "./sdk";
import { useWallet } from "./wallet";
import { useT, type Dict } from "./i18n";

export type BreatheStatus = "idle" | "signing" | "pending" | "confirmed" | "error";

function humanize(e: unknown, t: (d: Dict) => string): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/reject|abort|denied|cancel/i.test(m))
    return t({ fr: "Tu as refusé la signature.", en: "You declined the signature." });
  if (/insufficient|balance|fee|funds/i.test(m))
    return t({ fr: "Pas assez de gas Sepolia pour nourrir.", en: "Not enough Sepolia gas to feed." });
  // Some wallets (seen with Xverse) throw a blank error when they fail to broadcast — never show an
  // empty message, or the failure reads as "nothing happened". Give an actionable fallback.
  const msg = m.trim();
  if (!msg)
    return t({
      fr: "Ton portefeuille n'a pas diffusé la transaction. Réessaie, ou utilise un autre portefeuille Starknet (ArgentX, Braavos).",
      en: "Your wallet didn't broadcast the transaction. Try again, or use another Starknet wallet (ArgentX, Braavos).",
    });
  return msg.length > 140 ? msg.slice(0, 137) + "…" : msg;
}

/**
 * The breathe-life ritual: build the `move_lifeform_forward` call (SDK) → sign + broadcast (wallet)
 * → wait for acceptance. Advancing a creature one generation earns the breather 1 NUT.
 */
export function useBreathe() {
  const { t } = useT();
  const { sdk } = useGolSdk();
  const { address, connect, execute, waitForTx } = useWallet();
  const [status, setStatus] = useState<BreatheStatus>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const breathe = useCallback(
    async (id: string, count = 1): Promise<boolean> => {
      if (!sdk) return false;
      if (!address) {
        await connect();
        return false;
      }
      setError(null);
      setTxHash(null);
      setStatus("signing");
      try {
        // A breath advances N generations AND takes the creature into your care (a caretaker bond),
        // in ONE tx: `pet` is the ceremonial 1-generation breath that opens/refreshes the 7-day bond
        // (and mints 1 NUT); for a deeper breath we prepend move_lifeform_forward_n for the other
        // N-1 generations. Total: N gens forward, N NUT minted, bond renewed.
        const n = Math.max(1, count);
        const calls = n > 1 ? [...sdk.breatheLifeCall(id, n - 1), ...sdk.petCall(id)] : sdk.petCall(id);
        const hash = await execute(calls);
        // Some wallets (seen with Xverse) resolve the request without broadcasting and return no
        // hash — surface that as an error instead of silently waiting on `undefined`.
        if (!hash) throw new Error("Wallet returned no transaction hash (the feed was not broadcast).");
        setTxHash(hash);
        setStatus("pending");
        await waitForTx(hash);
        setStatus("confirmed");
        return true;
      } catch (e) {
        // Log the raw wallet/provider error — humanize() collapses it for the UI, but the original is
        // what we need when a wallet (e.g. Xverse) fails the handoff.
        console.error("[breathe] feed failed:", e);
        setError(humanize(e, t));
        setStatus("error");
        return false;
      }
    },
    [sdk, address, connect, execute, waitForTx, t]
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
    setTxHash(null);
  }, []);

  return { status, txHash, error, breathe, reset, connected: !!address };
}
