"use client";

import { useEffect, useState } from "react";
import { useGolSdk } from "./sdk";
import { useWallet } from "./wallet";

// NUT is sustenance, not currency: a free faucet grown by breathing life into creatures. This reads
// the connected wallet's balance so the UI can show it (quietly) and gate births on it — never as
// "earnings", always as supply. Balances/costs are whole NUT (18 decimals on-chain; 1 NUT / gen).
const WEI = 10n ** 18n;

/** The connected wallet's NUT balance in whole units, refetched after every confirmed tx. */
export function useNutBalance(): number | null {
  const { sdk } = useGolSdk();
  const { address, txEpoch } = useWallet();
  const [nut, setNut] = useState<number | null>(null);
  useEffect(() => {
    if (!sdk || !address) { setNut(null); return; }
    let cancelled = false;
    sdk
      .nutBalance(address)
      .then((hex: string) => { if (!cancelled) setNut(Number(BigInt(hex) / WEI)); })
      .catch(() => { if (!cancelled) setNut(null); });
    return () => { cancelled = true; };
  }, [sdk, address, txEpoch]);
  return nut;
}
