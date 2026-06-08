"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { connect as getStarknet, disconnect as getStarknetDisconnect } from "@starknet-io/get-starknet";
import { WalletAccount, type AccountInterface } from "starknet";
import { provider } from "./contracts";

type WalletProviderArg = Parameters<typeof WalletAccount.connect>[1];

interface WalletState {
  account: AccountInterface | null;
  address: string | null;
  connecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
}

const WalletContext = createContext<WalletState | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<AccountInterface | null>(null);
  const [connecting, setConnecting] = useState(false);

  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      const wallet = await getStarknet({ modalMode: "alwaysAsk" });
      if (!wallet) return; // user dismissed the modal
      const walletAccount = await WalletAccount.connect(
        provider,
        wallet as unknown as WalletProviderArg,
      );
      setAccount(walletAccount);
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    await getStarknetDisconnect({ clearLastWallet: true });
    setAccount(null);
  }, []);

  // Silently reconnect a previously authorized wallet on load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const wallet = await getStarknet({ modalMode: "neverAsk" });
        if (!wallet || cancelled) return;
        const walletAccount = await WalletAccount.connect(
          provider,
          wallet as unknown as WalletProviderArg,
        );
        if (!cancelled) setAccount(walletAccount);
      } catch {
        /* no previously authorized wallet */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <WalletContext.Provider
      value={{ account, address: account?.address ?? null, connecting, connect, disconnect }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within a WalletProvider");
  return ctx;
}
