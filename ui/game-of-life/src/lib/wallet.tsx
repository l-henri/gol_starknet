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
import dynamic from "next/dynamic";
import { NETWORK, PRIVY_APP_ID, RPC_URL_COMPAT } from "./config";
import type { MeteringTier } from "./gasCaps";
import type { EmailWallet } from "./privyWallet";
import type { PrivyApi } from "./privyAuth";

// The Privy auth island (email OTP → access token). Loaded only when the deployment has an
// app id configured, so Privy's SDK never ships to wallet-only deployments.
const PrivyBridge = dynamic(() => import("./privyAuth"), { ssr: false });

// remembers that this browser chose the email door, so a reload reconnects silently
const EMAIL_MARKER = "gol:email-session";

// The chain this build of the app lives on (felt-encoded short string).
const TARGET_CHAIN_ID = NETWORK === "mainnet" ? "0x534e5f4d41494e" /* SN_MAIN */ : "0x534e5f5345504f4c4941"; /* SN_SEPOLIA */

interface WalletCtx {
  address: string | null;
  chainId: string | null;
  connecting: boolean;
  error: string | null;
  onAppChain: boolean;
  /** how the session signs: an injected Starknet wallet, or the Privy email keeper */
  authKind: "wallet" | "email" | null;
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
  /** ask the connected wallet to switch to the app's chain (shows the wallet's own popup) */
  switchToAppChain: () => Promise<void>;
}

const Ctx = createContext<WalletCtx>({
  address: null,
  chainId: null,
  connecting: false,
  error: null,
  onAppChain: true,
  authKind: null,
  meteringTier: "unknown",
  txEpoch: 0,
  connect: async () => {},
  disconnect: async () => {},
  execute: async () => {
    throw new Error("wallet not ready");
  },
  waitForTx: async () => {},
  waitForTxAccepted: async () => {},
  switchToAppChain: async () => {},
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
    await swo.request({ type: "wallet_switchStarknetChain", params: { chainId: TARGET_CHAIN_ID } });
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
    const provider = new RpcProvider({ nodeUrl: RPC_URL_COMPAT });
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

  // ---- the email door (Privy + starkzap; only live when PRIVY_APP_ID is configured) ----
  const [authKind, setAuthKind] = useState<"wallet" | "email" | null>(null);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [privyEpoch, setPrivyEpoch] = useState(0); // bumps whenever the bridge reports state
  const emailWalletRef = useRef<EmailWallet | null>(null);
  const privyApiRef = useRef<PrivyApi | null>(null);

  // Onboard (or restore) the email keeper's Starknet account: resolve the Privy wallet,
  // wrap it in starkzap (paymaster fees), deploying the account on first ever login.
  const finishEmailConnect = useCallback(async () => {
    const api = privyApiRef.current;
    if (!api) return;
    setConnecting(true);
    setError(null);
    try {
      const { onboardEmailWallet } = await import("./privyWallet");
      const w = await onboardEmailWallet(api.getAccessToken);
      emailWalletRef.current = w;
      setAuthKind("email");
      setAddress(w.address);
      setChainId(TARGET_CHAIN_ID); // the keeper account lives on the app's chain by construction
      try { localStorage.setItem(EMAIL_MARKER, "1"); } catch { /* private mode */ }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setConnecting(false);
    }
  }, []);

  const connectEmail = useCallback(() => {
    const api = privyApiRef.current;
    setChooserOpen(false);
    if (!api || !api.ready) {
      setError("Email login is still warming up — try again in a moment.");
      return;
    }
    if (api.authenticated) void finishEmailConnect();
    else api.login(); // the OTP modal; the bridge's onLogin lands back in finishEmailConnect
  }, [finishEmailConnect]);

  // A reload keeps the Privy session; if this browser had chosen the email door, walk back
  // through it silently (signing is server-side, so no user gesture is needed).
  useEffect(() => {
    if (address || connecting) return;
    const api = privyApiRef.current;
    let marker = false;
    try { marker = localStorage.getItem(EMAIL_MARKER) === "1"; } catch { /* private mode */ }
    if (marker && api?.ready && api.authenticated) void finishEmailConnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [privyEpoch]);

  const connectInjected = useCallback(async () => {
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
      // react to in-wallet network/account changes so onAppChain + address stay current after a
      // switch (this is why the button could get stuck on "Switch network" after switching).
      swo.on?.("networkChanged", () => {
        void readChainId(swo).then(setChainId);
      });
      swo.on?.("accountsChanged", () => void readAddress(swo).then(setAddress));
      setAddress(await readAddress(swo));
      setAuthKind("wallet");
      const id = await readChainId(swo);
      setChainId(id);
      // wrong network on connect → invite to switch (the wallet shows its own popup)
      if (id && id !== TARGET_CHAIN_ID) {
        try {
          await requestSwitch(swo);
          setChainId(await readChainId(swo));
        } catch {
          /* user declined — the switch-network affordances stay available */
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setConnecting(false);
    }
  }, []);

  // The single public entry: with the email door configured, offer the choice; otherwise the
  // injected-wallet flow, exactly as before. Every "Connect" CTA in the app lands here.
  const connect = useCallback(async () => {
    if (PRIVY_APP_ID) {
      setChooserOpen(true);
      return;
    }
    await connectInjected();
  }, [connectInjected]);

  const disconnect = useCallback(async () => {
    if (authKind === "email") {
      try { localStorage.removeItem(EMAIL_MARKER); } catch { /* private mode */ }
      emailWalletRef.current = null;
      await privyApiRef.current?.logout().catch(() => {});
      setAuthKind(null);
      setAddress(null);
      setChainId(null);
      return;
    }
    try {
      const mod = await import("@starknet-io/get-starknet");
      await mod.disconnect({ clearLastWallet: true });
    } catch {
      /* ignore */
    }
    swoRef.current = null;
    setAuthKind(null);
    setAddress(null);
    setChainId(null);
  }, [authKind]);

  const execute = useCallback(async (calls: unknown): Promise<string> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const arr = (Array.isArray(calls) ? calls : [calls]) as any[];
    const toFelt = (x: unknown): string => {
      if (typeof x === "string") return x;
      try { return BigInt(x as never).toString(); } catch { return String(x); }
    };

    // The email keeper signs headlessly (Privy raw-sign via our server) and rides the AVNU
    // paymaster — no popup, no gas. Same calls, different rails.
    if (authKind === "email") {
      const w = emailWalletRef.current;
      if (!w) throw new Error("Connect first.");
      const zapCalls = arr.map((it) => ({
        contractAddress: it.contractAddress ?? it.contract_address,
        entrypoint: it.entrypoint ?? it.entry_point,
        calldata: (it.calldata ?? []).map(toFelt),
      }));
      const tx = await w.execute(zapCalls, { feeMode: { type: "paymaster" } });
      return tx.hash;
    }

    const swo = swoRef.current;
    if (!swo?.request) throw new Error("Connect a wallet first.");
    // Hand the calls straight to the wallet via `wallet_addInvokeTransaction` — the wallet does the
    // nonce, estimation, resource bounds, UI and signing with ITS OWN node, so our RPC node/spec can
    // never stall the signature prompt. This is exactly what WalletAccount.execute does internally
    // (see starknet.js), minus the extra `requestAccounts` round-trip on first use — and we force
    // calldata to felt STRINGS, since some wallets silently hang on numeric/BigInt calldata (which
    // WalletAccount.execute passes through untouched).
    const txCalls = arr.map((it) => ({
      contract_address: it.contractAddress ?? it.contract_address,
      entry_point: it.entrypoint ?? it.entry_point,
      calldata: (it.calldata ?? []).map(toFelt),
    }));
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res: any = await swo.request({ type: "wallet_addInvokeTransaction", params: { calls: txCalls } });
      const hash = res?.transaction_hash ?? (typeof res === "string" ? res : null);
      if (!hash) throw new Error("The wallet returned no transaction hash.");
      return hash as string;
    } catch (e) {
      // Surface the raw failure — the wallet write path is the hardest thing to debug remotely.
      console.error("[gol] wallet execute failed:", e, { txCalls });
      throw e;
    }
  }, [authKind]);

  // Poll a tx to completion. `requireAccepted` waits for ACCEPTED_ON_L2 — needed when a *later* tx
  // will read this one's on-chain writes (e.g. partial-path combine/final read a prior segment): a
  // PRE_CONFIRMED write isn't yet in the block a wallet estimates the next tx against, so it would
  // revert. When nothing depends on it (a feed, the final mint), resolve as soon as it's preconfirmed
  // with execution SUCCEEDED — much faster. Both throw on REVERTED/REJECTED (starknet.js's default
  // waitForTransaction would treat a revert as success, since ACCEPTED_ON_L2 finality matches).
  const pollTx = useCallback(async (hash: string, requireAccepted: boolean): Promise<void> => {
    const { RpcProvider } = await import("starknet");
    const provider = new RpcProvider({ nodeUrl: RPC_URL_COMPAT });
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

  const switchToAppChain = useCallback(async () => {
    if (authKind === "email") return; // the keeper account only exists on the app's chain
    const swo = swoRef.current;
    if (!swo) {
      setError("Connect a wallet first.");
      return;
    }
    setError(null);
    try {
      await requestSwitch(swo);
      setChainId(await readChainId(swo));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [authKind]);

  // Poll the wallet's chain while connected — not every wallet emits "networkChanged", so this
  // guarantees a switch is reflected (and `onAppChain` updated) within a few seconds.
  useEffect(() => {
    if (!address) return;
    const poll = setInterval(() => {
      const swo = swoRef.current;
      if (!swo) return;
      void readChainId(swo).then((c) => {
        if (!c) return;
        setChainId((prev) => (c !== prev ? c : prev));
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

  const onAppChain = !chainId || chainId === TARGET_CHAIN_ID;

  return (
    <Ctx.Provider
      value={{ address, chainId, connecting, error, onAppChain, authKind, meteringTier, txEpoch, connect, disconnect, execute, waitForTx, waitForTxAccepted, switchToAppChain }}
    >
      {PRIVY_APP_ID && (
        <PrivyBridge
          appId={PRIVY_APP_ID}
          onApi={(api) => { privyApiRef.current = api; setPrivyEpoch((e) => e + 1); }}
          onLogin={() => void finishEmailConnect()}
        />
      )}
      {children}
      {chooserOpen && (
        <ConnectChooser
          onEmail={connectEmail}
          onWallet={() => { setChooserOpen(false); void connectInjected(); }}
          onClose={() => setChooserOpen(false)}
        />
      )}
    </Ctx.Provider>
  );
}

/** The two doors into the garden. Email is the promoted path (no wallet, gas covered);
 *  a Starknet wallet remains first-class for the self-custody crowd. */
function ConnectChooser({ onEmail, onWallet, onClose }: { onEmail: () => void; onWallet: () => void; onClose: () => void }) {
  return (
    <div className="connect-sheet" role="dialog" aria-modal="true" aria-label="Connect">
      <div className="connect-overlay" onClick={onClose} />
      <div className="connect-panel">
        <h3 className="connect-title">Step into the garden</h3>
        <button className="btn set-free connect-opt" onClick={onEmail}>Continue with email</button>
        <p className="connect-hint">No wallet needed — a keeper account is made for you, and the garden covers the gas.</p>
        <button className="btn connect-opt" onClick={onWallet}>Connect a Starknet wallet</button>
        <p className="connect-hint">ArgentX, Braavos… your keys, your gas.</p>
        <button className="lens-btn connect-cancel" onClick={onClose}>not now</button>
      </div>
    </div>
  );
}
