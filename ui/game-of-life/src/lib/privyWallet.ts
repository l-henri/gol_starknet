"use client";

// The email keeper's Starknet wallet: Privy holds the key (stark-curve raw signing via our
// server), starkzap wraps it in an ArgentX v0.5.0 account and routes fees through the AVNU
// paymaster (both behind same-origin proxies — /api/privy/sign and /api/paymaster). Loaded
// lazily: starkzap and its deps only ship to browsers that choose the email door.

import { NETWORK, RPC_URL_V9 } from "./config";

// starkzap's WalletInterface, narrowed to what the app uses (avoids importing starkzap types
// eagerly — the package itself is dynamic-imported below).
export interface EmailWallet {
  readonly address: string;
  execute(calls: unknown[], options?: unknown): Promise<{ hash: string }>;
  isDeployed(): Promise<boolean>;
}

export type GetToken = () => Promise<string | null>;

/**
 * Resolve (or create) the user's Privy Starknet wallet and connect it through starkzap.
 * `deploy: "if_needed"` means a first-time keeper's account contract is deployed here,
 * sponsored — their email is enough to start breathing life.
 */
export async function onboardEmailWallet(getToken: GetToken): Promise<EmailWallet> {
  const token = await getToken();
  if (!token) throw new Error("Not signed in.");

  const res = await fetch("/api/privy/wallet", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(j?.error ?? `wallet lookup failed (${res.status})`);
  }
  const { walletId, publicKey } = (await res.json()) as { walletId: string; publicKey: string };

  const { StarkZap, ChainId, OnboardStrategy } = await import("starkzap");
  const origin = window.location.origin;
  const sdk = new StarkZap({
    rpcUrl: RPC_URL_V9.startsWith("http") ? RPC_URL_V9 : `${origin}${RPC_URL_V9}`,
    chainId: NETWORK === "mainnet" ? ChainId.MAINNET : ChainId.SEPOLIA,
    paymaster: { nodeUrl: `${origin}/api/paymaster` },
  });

  const { wallet } = await sdk.onboard({
    strategy: OnboardStrategy.Privy,
    privy: {
      resolve: async () => ({
        walletId,
        publicKey,
        serverUrl: `${origin}/api/privy/sign`,
        // a fresh token per signature — Privy access tokens are short-lived
        headers: async () => ({ authorization: `Bearer ${(await getToken()) ?? ""}` }),
      }),
    },
    accountPreset: "argentXV050", // the account class Privy's Starknet wallets pair with
    feeMode: { type: "paymaster" },
    deploy: "if_needed",
  });

  return wallet as unknown as EmailWallet;
}
