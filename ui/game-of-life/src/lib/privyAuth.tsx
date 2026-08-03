"use client";

// The Privy auth island. PrivyProvider does NOT wrap the app — it wraps only this bridge,
// which surfaces the few capabilities the wallet layer needs (login modal, access token,
// logout, session state) via a callback. The login modal portals to <body>, so it renders
// fine from here. This module is dynamic-imported by wallet.tsx, so Privy's SDK only ships
// to browsers on deployments where NEXT_PUBLIC_PRIVY_APP_ID is configured.

import { useEffect, useRef } from "react";
import { PrivyProvider, useLogin, usePrivy } from "@privy-io/react-auth";

export interface PrivyApi {
  ready: boolean;
  authenticated: boolean;
  login: () => void;
  logout: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
}

interface BridgeProps {
  appId: string;
  onApi: (api: PrivyApi) => void;
  /** fires after the email OTP completes — the moment to onboard the Starknet wallet */
  onLogin: () => void;
}

function Bridge({ onApi, onLogin }: Omit<BridgeProps, "appId">) {
  const { ready, authenticated, logout, getAccessToken } = usePrivy();
  const onLoginRef = useRef(onLogin);
  onLoginRef.current = onLogin;
  const { login } = useLogin({ onComplete: () => onLoginRef.current() });

  useEffect(() => {
    onApi({ ready, authenticated, login: () => login(), logout, getAccessToken });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, authenticated]);

  return null;
}

export default function PrivyBridge({ appId, onApi, onLogin }: BridgeProps) {
  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["email"],
        appearance: { theme: "dark", accentColor: "#5ad1ff", logo: undefined },
        // the Starknet wallet is created server-side (owned by the user) — no EVM/Solana
        // embedded wallet is wanted on login
        embeddedWallets: { ethereum: { createOnLogin: "off" }, solana: { createOnLogin: "off" } },
      }}
    >
      <Bridge onApi={onApi} onLogin={onLogin} />
    </PrivyProvider>
  );
}
