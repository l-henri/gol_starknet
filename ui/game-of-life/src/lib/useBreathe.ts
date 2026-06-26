"use client";

import { useCallback, useState } from "react";
import { useGolSdk } from "./sdk";
import { useWallet } from "./wallet";
import { useT, type Dict } from "./i18n";

export type BreatheStatus = "idle" | "signing" | "pending" | "confirmed" | "error";

function humanize(e: unknown, t: (d: Dict) => string): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/reject|abort|denied|cancel/i.test(m))
    return t({ fr: "Vous avez refusé la signature.", en: "You declined the signature." });
  if (/insufficient|balance|fee|funds/i.test(m))
    return t({ fr: "Pas assez de gas Sepolia pour nourrir.", en: "Not enough Sepolia gas to feed." });
  return m.length > 140 ? m.slice(0, 137) + "…" : m;
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
    async (id: string, count = 1) => {
      if (!sdk) return;
      if (!address) {
        await connect();
        return;
      }
      setError(null);
      setTxHash(null);
      setStatus("signing");
      try {
        // feeding N generations is a single move_lifeform_forward_n(id, N) call — one state
        // read/write + one mint of N NUT, cheaper than N separate moves.
        const calls = sdk.breatheLifeCall(id, Math.max(1, count));
        const hash = await execute(calls);
        setTxHash(hash);
        setStatus("pending");
        await waitForTx(hash);
        setStatus("confirmed");
      } catch (e) {
        setError(humanize(e, t));
        setStatus("error");
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
