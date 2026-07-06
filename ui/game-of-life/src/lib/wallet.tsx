"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { RPC_URL } from "./config";
import type { MeteringTier } from "./gasCaps";

const SEPOLIA_CHAIN_ID = "0x534e5f5345504f4c4941"; // SN_SEPOLIA

interface WalletCtx {
  address: string | null;
  chainId: string | null;
  connecting: boolean;
  error: string | null;
  onSepolia: boolean;
  /** on-chain gas-metering regime of the connected account (sets feed/mint caps); see gasCaps.ts */
  meteringTier: MeteringTier;
  /** bumps after a confirmed tx — UI reads (e.g. NUT) depend on it to refetch */
  txEpoch: number;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  /** sign + broadcast calls via the connected wallet; returns the tx hash */
  execute: (calls: unknown) => Promise<string>;
  /** wait for a tx to be accepted, then signal a refetch */
  waitForTx: (hash: string) => Promise<void>;
  waitForTxAccepted: (hash: string) => Promise<void>;
  /** ask the connected wallet to switch to Sepolia (shows the wallet's own popup) */
  switchToSepolia: () => Promise<void>;
}

const Ctx = createContext<WalletCtx>({
  address: null,
  chainId: null,
  connecting: false,
  error: null,
  onSepolia: true,
  meteringTier: "unknown",
  txEpoch: 0,
  connect: async () => {},
  disconnect: async () => {},
  execute: async () => {
    throw new Error("wallet not ready");
  },
  waitForTx: async () => {},
  waitForTxAccepted: async () => {},
  switchToSepolia: async () => {},
});

export const useWallet = () => useContext(Ctx);

/* eslint-disable @typescript-eslint/no-explicit-any */
async function readAddress(swo: any): Promise<string | null> {
  try {
    if (swo?.request) {
      const accts = await swo.request({ type: "wallet_requestAccounts" });
      if (Array.isArray(accts) && accts[0]) return accts[0];
    }
  } catch {
    /* fall through */
  }
  return swo?.selectedAddress ?? swo?.account?.address ?? null;
}

async function readChainId(swo: any): Promise<string | null> {
  try {
    if (swo?.request) {
      const id = await swo.request({ type: "wallet_requestChainId" });
      if (typeof id === "string") return id;
    }
  } catch {
    /* fall through */
  }
  return swo?.chainId ?? null;
}

async function requestSwitch(swo: any): Promise<void> {
  if (swo?.request) {
    await swo.request({ type: "wallet_switchStarknetChain", params: { chainId: SEPOLIA_CHAIN_ID } });
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// An account's gas-metering tier is fixed by its class's Sierra version (see gasCaps.ts), so cache it
// per address — it never changes for a deployed account.
const tierCache = new Map<string, MeteringTier>();

/**
 * Resolve the connected account's metering tier from its class's Sierra version: read the deployed
 * class hash, fetch the class, and inspect `sierra_program[0..1]` (major.minor). Sierra ≥ 1.7.0 →
 * modern (Sierra-gas); older, or a Cairo-0 class with no `sierra_program` → legacy (Cairo-steps).
 * Returns "unknown" on any failure (undeployed account / RPC error) so callers keep the safe caps.
 */
async function detectTier(addr: string): Promise<MeteringTier> {
  const cached = tierCache.get(addr);
  if (cached) return cached;
  try {
    const { RpcProvider } = await import("starknet");
    const provider = new RpcProvider({ nodeUrl: RPC_URL });
    const classHash = await provider.getClassHashAt(addr, "latest");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cls = (await provider.getClass(classHash, "latest")) as any;
    const sp: string[] | undefined = cls?.sierra_program;
    let tier: MeteringTier = "legacy"; // no sierra_program = deprecated Cairo-0 class = legacy
    if (sp && sp.length >= 2) {
      const major = Number(BigInt(sp[0]));
      const minor = Number(BigInt(sp[1]));
      // v0.13.4 cutoff: classes at Sierra ≥ 1.7.0 are metered in the modern Sierra-gas mode.
      tier = major > 1 || (major === 1 && minor >= 7) ? "modern" : "legacy";
    }
    tierCache.set(addr, tier);
    return tier;
  } catch {
    return "unknown";
  }
}

/**
 * Wallet connection + signing (get-starknet + starknet.js). The SDK builds calls; this signs and
 * broadcasts them through the injected wallet — keys never touch the app. get-starknet and
 * starknet.js are imported lazily so they stay out of the read-first bundle.
 */
export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meteringTier, setMeteringTier] = useState<MeteringTier>("unknown");
  const [txEpoch, setTxEpoch] = useState(0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const swoRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const accountRef = useRef<any>(null);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const mod = await import("@starknet-io/get-starknet");
      const swo = await mod.connect({ modalMode: "alwaysAsk", modalTheme: "dark" });
      if (!swo) {
        setConnecting(false);
        return;
      }
      swoRef.current = swo;
      accountRef.current = null; // rebuild on next execute
      // react to in-wallet network/account changes so onSepolia + address stay current after a
      // switch (this is why the button could get stuck on "Switch to Sepolia" after switching).
      swo.on?.("networkChanged", () => {
        accountRef.current = null;
        void readChainId(swo).then(setChainId);
      });
      swo.on?.("accountsChanged", () => void readAddress(swo).then(setAddress));
      setAddress(await readAddress(swo));
      const id = await readChainId(swo);
      setChainId(id);
      // wrong network on connect → invite to switch (the wallet shows its own popup)
      if (id && id !== SEPOLIA_CHAIN_ID) {
        try {
          await requestSwitch(swo);
          setChainId(await readChainId(swo));
        } catch {
          /* user declined — the Switch-to-Sepolia affordances stay available */
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      const mod = await import("@starknet-io/get-starknet");
      await mod.disconnect({ clearLastWallet: true });
    } catch {
      /* ignore */
    }
    swoRef.current = null;
    accountRef.current = null;
    setAddress(null);
    setChainId(null);
  }, []);

  const execute = useCallback(async (calls: unknown): Promise<string> => {
    if (!swoRef.current) throw new Error("Connect a wallet first.");
    const { RpcProvider, WalletAccount } = await import("starknet");
    if (!accountRef.current) {
      const provider = new RpcProvider({ nodeUrl: RPC_URL });
      // starknet.js v7 static connect; fall back to the constructor for older minors.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const WA = WalletAccount as any;
      accountRef.current = WA.connect
        ? await WA.connect(provider, swoRef.current)
        : new WA(provider, swoRef.current);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await accountRef.current.execute(calls as any);
    return res.transaction_hash;
  }, []);

  // Poll a tx to completion. `requireAccepted` waits for ACCEPTED_ON_L2 — needed when a *later* tx
  // will read this one's on-chain writes (e.g. partial-path combine/final read a prior segment): a
  // PRE_CONFIRMED write isn't yet in the block a wallet estimates the next tx against, so it would
  // revert. When nothing depends on it (a feed, the final mint), resolve as soon as it's preconfirmed
  // with execution SUCCEEDED — much faster. Both throw on REVERTED/REJECTED (starknet.js's default
  // waitForTransaction would treat a revert as success, since ACCEPTED_ON_L2 finality matches).
  const pollTx = useCallback(async (hash: string, requireAccepted: boolean): Promise<void> => {
    const { RpcProvider } = await import("starknet");
    const provider = new RpcProvider({ nodeUrl: RPC_URL });
    for (let i = 0; i < 200; i++) {
      let st: { finality_status?: string; execution_status?: string } | null = null;
      try {
        st = (await provider.getTransactionStatus(hash)) as {
          finality_status?: string;
          execution_status?: string;
        };
      } catch {
        st = null; // not indexed yet — keep polling
      }
      if (st) {
        const { execution_status: exec, finality_status: fin } = st;
        if (exec === "REVERTED" || fin === "REJECTED")
          throw new Error(`Transaction ${exec === "REVERTED" ? "reverted" : "rejected"} on-chain.`);
        const accepted = fin === "ACCEPTED_ON_L2" || fin === "ACCEPTED_ON_L1";
        if (accepted || (!requireAccepted && exec === "SUCCEEDED")) {
          setTxEpoch((n) => n + 1);
          return;
        }
      }
      await new Promise((r) => setTimeout(r, requireAccepted ? 3000 : 1200));
    }
    throw new Error("Timed out waiting for the transaction to confirm.");
  }, []);

  const waitForTx = useCallback((hash: string) => pollTx(hash, false), [pollTx]);
  const waitForTxAccepted = useCallback((hash: string) => pollTx(hash, true), [pollTx]);

  const switchToSepolia = useCallback(async () => {
    const swo = swoRef.current;
    if (!swo) {
      setError("Connect a wallet first.");
      return;
    }
    setError(null);
    try {
      await requestSwitch(swo);
      accountRef.current = null; // rebuild the account for the new chain
      setChainId(await readChainId(swo));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // Poll the wallet's chain while connected — not every wallet emits "networkChanged", so this
  // guarantees a switch is reflected (and `onSepolia` updated) within a few seconds.
  useEffect(() => {
    if (!address) return;
    const poll = setInterval(() => {
      const swo = swoRef.current;
      if (!swo) return;
      void readChainId(swo).then((c) => {
        if (!c) return;
        setChainId((prev) => {
          if (c !== prev) accountRef.current = null; // chain changed → rebuild the account
          return c;
        });
      });
    }, 3000);
    return () => clearInterval(poll);
  }, [address]);

  // Resolve the connected account's gas-metering tier (drives the feed/mint caps). Re-runs on
  // address change; "unknown" while pending or for an undeployed account keeps caps at the safe min.
  useEffect(() => {
    if (!address) {
      setMeteringTier("unknown");
      return;
    }
    let cancelled = false;
    void detectTier(address).then((tier) => {
      if (!cancelled) setMeteringTier(tier);
    });
    return () => {
      cancelled = true;
    };
  }, [address]);

  const onSepolia = !chainId || chainId === SEPOLIA_CHAIN_ID;

  return (
    <Ctx.Provider
      value={{ address, chainId, connecting, error, onSepolia, meteringTier, txEpoch, connect, disconnect, execute, waitForTx, waitForTxAccepted, switchToSepolia }}
    >
      {children}
    </Ctx.Provider>
  );
}
