"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { GolSdk } from "gol-sdk-wasm";
import { NETWORK, RPC_URL } from "./config";
import { adoptTemplateFromHtml, REF_TOKEN_ID } from "./onchainRender";

interface SdkCtx {
  sdk: GolSdk | null;
  ready: boolean;
  error: string | null;
}

const Ctx = createContext<SdkCtx>({ sdk: null, ready: false, error: null });

export const useGolSdk = () => useContext(Ctx);

/**
 * Loads the wasm-pack glue + module from /public at runtime (bundler-ignored, so Next's webpack
 * never tries to resolve the .wasm asset), initialises it, and constructs a Sepolia GolSdk.
 * Signing stays in JS (the wallet); this is reads + call-building only.
 */
export function GolSdkProvider({ children }: { children: ReactNode }) {
  const [sdk, setSdk] = useState<GolSdk | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mod = await import(
          /* webpackIgnore: true */ /* turbopackIgnore: true */
          // @ts-expect-error — served from /public, not bundled
          "/gol_sdk_wasm.js"
        );
        await mod.default("/gol_sdk_wasm_bg.wasm");
        const instance = new mod.GolSdk(NETWORK, RPC_URL);
        if (!cancelled) setSdk(instance);
        // Refresh the on-chain renderer template from a live token, once per app start, so the
        // local artifact tracks the deployed contract. Fire-and-forget; the bundled template serves
        // until (and if) this resolves.
        instance
          .tokenUri(REF_TOKEN_ID)
          .then((uri: { animation_url?: string } | null) => {
            const au = uri?.animation_url ?? "";
            const i = au.indexOf("base64,");
            if (i >= 0) adoptTemplateFromHtml(atob(au.slice(i + 7)));
          })
          .catch(() => {
            /* keep the bundled template */
          });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!cancelled) setError(msg);
        console.error("GolSdk init failed:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return <Ctx.Provider value={{ sdk, ready: !!sdk, error }}>{children}</Ctx.Provider>;
}
