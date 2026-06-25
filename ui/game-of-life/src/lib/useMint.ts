"use client";

import { useCallback, useState } from "react";
import { useGolSdk } from "./sdk";
import { useWallet } from "./wallet";

export type MintStatus = "idle" | "signing" | "pending" | "confirmed" | "error";

function humanize(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/reject|abort|denied|cancel/i.test(m)) return "You declined the signature.";
  if (/insufficient|balance|fee|funds|allowance/i.test(m)) return "Not enough Sepolia gas or NUT to mint.";
  return m.length > 140 ? m.slice(0, 137) + "…" : m;
}

/**
 * The discover-&-mint ritual: build the `[approve, mint_loop]` multicall (SDK, from the loop's
 * canonical state + period) → sign + broadcast (wallet) → wait for acceptance. The minter verifies
 * the loop on-chain; on success a new lifeform NFT is born to the connected wallet.
 */
export function useMint() {
  const { sdk } = useGolSdk();
  const { address, connect, execute, waitForTx } = useWallet();
  const [status, setStatus] = useState<MintStatus>("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // `rows` = the loop's canonical (smallest) state as 41 row bitmasks; `loopLength` = its period.
  const mint = useCallback(
    async (rows: number[], loopLength: number): Promise<boolean> => {
      if (!sdk) return false;
      if (!address) {
        await connect();
        return false;
      }
      setError(null);
      setTxHash(null);
      setStatus("signing");
      try {
        const calls = sdk.mintLoopCalls(new Float64Array(rows), loopLength, address);
        const hash = await execute(calls);
        setTxHash(hash);
        setStatus("pending");
        await waitForTx(hash);
        setStatus("confirmed");
        return true;
      } catch (e) {
        setError(humanize(e));
        setStatus("error");
        return false;
      }
    },
    [sdk, address, connect, execute, waitForTx]
  );

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
    setTxHash(null);
  }, []);

  return { status, txHash, error, mint, reset, connected: !!address };
}
