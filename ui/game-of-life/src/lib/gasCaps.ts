"use client";

import { useWallet } from "./wallet";

/**
 * Which on-chain gas-metering regime the connected account falls under — set by the account class's
 * Sierra version. The Starknet v0.13.4 upgrade (Sepolia ~Feb 2025, mainnet ~Mar 2025) split
 * execution metering into modern "Sierra-gas" (classes compiled at Sierra ≥ 1.7.0 ≈ Cairo 2.10) and
 * legacy "Cairo-steps" (older classes). The mode is inherited from the sender account down the whole
 * call stack, so it's the *wallet's account class*, not the pattern, that sets the per-generation
 * cost of the GoL stepper — a ~4.6× difference, verified head-to-head on Sepolia 2026-06-30 across
 * four account classes (~3.0M gas/gen modern vs ~14M legacy). "unknown" = not yet resolved (or an
 * undeployed/counterfactual account) → treated as legacy so the caps stay safe.
 */
export type MeteringTier = "modern" | "legacy" | "unknown";

export interface GasCaps {
  /** feed slider max — one `move_lifeform_forward_n(id, n)` under the ~1.2B per-tx wallet cap */
  feedCap: number;
  /** mint a loop in a single tx up to this period (the whole loop is re-simulated on-chain) */
  singleShotMax: number;
  /** partial-path segment size when a long loop must be tiled across several txs */
  chunkSteps: number;
}

// caps = (per-tx step budget under the ~1.2B wallet cap) ÷ (per-gen gas for the tier). LEGACY are the
// proven-safe values (82 × ~13.9M ≈ 1.14B feed; a 60-step mint segment + combine ≈ 0.87B). MODERN
// scales by the measured ~4.6× cheaper metering, kept a touch conservative for gas-price / fee-
// estimate variance (340 × ~3.0M + fixed ≈ 1.03B feed; 280-step segment ≈ 0.85B). See [[gol-feed-gas-cap]].
const LEGACY: GasCaps = { feedCap: 82, singleShotMax: 60, chunkSteps: 60 };
const MODERN: GasCaps = { feedCap: 340, singleShotMax: 280, chunkSteps: 280 };

/** Hard ceiling on how many txs a single mint may fan out to (partial-path tiling). */
export const MAX_TX = 8;

export function capsForTier(tier: MeteringTier): GasCaps {
  return tier === "modern" ? MODERN : LEGACY;
}

/** Transactions a loop of this period needs to mint (mirrors the SDK planner's tiling math). */
export function plannedTxCount(period: number, caps: GasCaps): number {
  if (period <= caps.singleShotMax) return 1;
  return Math.ceil((period - 1) / caps.chunkSteps) + 1; // segments + final mint
}

/** The active caps for the connected account's metering tier (legacy when unknown — safe default). */
export function useGasCaps(): GasCaps & { tier: MeteringTier } {
  const { meteringTier } = useWallet();
  return { ...capsForTier(meteringTier), tier: meteringTier };
}
