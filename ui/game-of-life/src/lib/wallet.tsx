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

const SEPOLIA_CHAIN_ID = "0x534e5f5345504f4c4941"; // SN_SEPOLIA

interface WalletCtx {
  address: string | null;
  chainId: string | null;
  connecting: boolean;
  error: string | null;
  onSepolia: boolean;
  /** bumps after a confirmed tx — UI reads (e.g. NUT) depend on it to refetch */
  txEpoch: number;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  /** sign + broadcast calls via the connected wallet; returns the tx hash */
  execute: (calls: unknown) => Promise<string>;
  /** wait for a tx to be accepted, then signal a refetch */
  waitForTx: (hash: string) => Promise<void>;
  /** ask the connected wallet to switch to Sepolia (shows the wallet's own popup) */
  switchToSepolia: () => Promise<void>;
}

const Ctx = createContext<WalletCtx>({
  address: null,
  chainId: null,
  connecting: false,
  error: null,
  onSepolia: true,
  txEpoch: 0,
  connect: async () => {},
  disconnect: async () => {},
  execute: async () => {
    throw new Error("wallet not ready");
  },
  waitForTx: async () => {},
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

  const waitForTx = useCallback(async (hash: string): Promise<void> => {
    const { RpcProvider } = await import("starknet");
    const provider = new RpcProvider({ nodeUrl: RPC_URL });
    await provider.waitForTransaction(hash, { retryInterval: 3000 });
    setTxEpoch((n) => n + 1);
  }, []);

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

  const onSepolia = !chainId || chainId === SEPOLIA_CHAIN_ID;

  return (
    <Ctx.Provider
      value={{ address, chainId, connecting, error, onSepolia, txEpoch, connect, disconnect, execute, waitForTx, switchToSepolia }}
    >
      {children}
    </Ctx.Provider>
  );
}
