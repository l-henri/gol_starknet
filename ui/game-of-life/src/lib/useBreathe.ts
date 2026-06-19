"use client";

import { useCallback, useState } from "react";
import { useGolSdk } from "./sdk";
import { useWallet } from "./wallet";

export type BreatheStatus = "idle" | "signing" | "pending" | "confirmed" | "error";

function humanize(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/reject|abort|denied|cancel/i.test(m)) return "You declined the signature.";
  if (/insufficient|balance|fee|funds/i.test(m)) return "Not enough Sepolia gas to breathe.";
  return m.length > 140 ? m.slice(0, 137) + "…" : m;
}

/**
 * The breathe-life ritual: build the `move_lifeform_forward` call (SDK) → sign + broadcast (wallet)
 * → wait for acceptance. Advancing a creature one generation earns the breather 1 NUT.
 */
export function useBreathe() {
  const { sdk } = useGolSdk();
  const { address, connect, execute, waitForTx } = useWallet();
  const [status, setStatus] = useState<BreatheStatus>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const breathe = useCallback(
    async (id: string) => {
      if (!sdk) return;
      if (!address) {
        await connect();
        return;
      }
      setError(null);
      setTxHash(null);
      setStatus("signing");
      try {
        const calls = sdk.breatheLifeCall(id); // [{ contractAddress, entrypoint, calldata }]
        const hash = await execute(calls);
        setTxHash(hash);
        setStatus("pending");
        await waitForTx(hash);
        setStatus("confirmed");
      } catch (e) {
        setError(humanize(e));
        setStatus("error");
      }
    },
    [sdk, address, connect, execute, waitForTx]
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
    setTxHash(null);
  }, []);

  return { status, txHash, error, breathe, reset, connected: !!address };
}
