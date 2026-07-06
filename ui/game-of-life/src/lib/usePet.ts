"use client";

import { useCallback, useEffect, useState } from "react";
import { useGolSdk } from "./sdk";
import { useWallet } from "./wallet";
import { useT } from "./i18n";

export type PetStatus = "idle" | "signing" | "pending" | "confirmed" | "error";

export interface BondState {
  held: boolean;
  lastPet: number; // unix seconds; 0 = never / cleared
  reapable: boolean;
}

export const LAPSE_SECONDS = 604800; // 7 days — mirrors GolPetBonds::LAPSE_SECONDS

/** Days of care left on a bond clock (fractional), or null when there's no bond. */
export function daysLeft(bond: BondState | null): number | null {
  if (!bond?.held) return null;
  const left = bond.lastPet + LAPSE_SECONDS - Date.now() / 1000;
  return left / 86400;
}

/**
 * The caretaker ritual: pet = one ceremonial breath (feeds a generation, the NUT lands on you,
 * your 7-day bond clock refreshes). Also the permissionless reaper for lapsed bonds.
 */
export function usePet() {
  const { t } = useT();
  const { sdk } = useGolSdk();
  const { address, connect, execute, waitForTx } = useWallet();
  const [status, setStatus] = useState<PetStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (calls: unknown) => {
      if (!address) {
        await connect();
        return false;
      }
      setError(null);
      setStatus("signing");
      try {
        const hash = await execute(calls);
        if (!hash) throw new Error("Wallet returned no transaction hash.");
        setStatus("pending");
        await waitForTx(hash);
        setStatus("confirmed");
        return true;
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        setError(
          /reject|abort|denied|cancel/i.test(m)
            ? t({ fr: "Tu as refusé la signature.", en: "You declined the signature." })
            : m.slice(0, 140)
        );
        setStatus("error");
        return false;
      }
    },
    [address, connect, execute, waitForTx, t]
  );

  const pet = useCallback(
    async (creatureId: string) => (sdk ? run(sdk.petCall(creatureId)) : false),
    [sdk, run]
  );
  const reap = useCallback(
    async (creatureId: string, holder: string) =>
      sdk ? run(sdk.reapCall(creatureId, holder)) : false,
    [sdk, run]
  );
  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
  }, []);

  return { status, error, pet, reap, reset, connected: !!address };
}

/** The connected wallet's bond on one creature (refetches after every confirmed tx). */
export function useBond(creatureId: string | null) {
  const { sdk } = useGolSdk();
  const { address, txEpoch } = useWallet();
  const [bond, setBond] = useState<BondState | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!sdk || !address || !creatureId) {
      setBond(null);
      return;
    }
    sdk
      .bondStatus(creatureId, address)
      .then((b: { held: boolean; last_pet: number; reapable: boolean }) => {
        if (!cancelled) setBond({ held: b.held, lastPet: b.last_pet, reapable: b.reapable });
      })
      .catch(() => {
        if (!cancelled) setBond(null);
      });
    return () => {
      cancelled = true;
    };
  }, [sdk, address, creatureId, txEpoch]);

  return bond;
}
