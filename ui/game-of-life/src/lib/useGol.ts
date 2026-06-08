"use client";

import { useCallback } from "react";
import { useWallet } from "./wallet";
import {
  ADDRESSES,
  NUT_DECIMALS,
  isConfigured,
  readContracts,
  writeContracts,
} from "./contracts";

/**
 * Actions against the on-chain Game of Life. Loop/path discovery happens
 * client-side (in the grid component); these helpers submit the results.
 */
export function useGol() {
  const { account } = useWallet();

  const requireReady = useCallback(() => {
    if (!isConfigured()) {
      throw new Error("Contract addresses are not configured (see .env.local.example).");
    }
    if (!account) throw new Error("Connect a wallet first.");
    return account;
  }, [account]);

  /** Mint a discovered loop. Approves the NUT cost (loopLength NUT) then mints in one multicall. */
  const mintLoop = useCallback(
    async (loopId: bigint, loopLength: number, recipient: string) => {
      const acct = requireReady();
      const { loopMinter, nutrient } = writeContracts(acct);
      const price = BigInt(loopLength) * 10n ** NUT_DECIMALS;
      const approveCall = nutrient.populate("approve", [ADDRESSES.lifeforms, price]);
      const mintCall = loopMinter.populate("mint_loop", [loopId, loopLength, recipient]);
      const { transaction_hash } = await acct.execute([approveCall, mintCall]);
      return transaction_hash;
    },
    [requireReady],
  );

  /** Breathe life into an existing lifeform (advance one generation, earn NUT). */
  const moveForward = useCallback(
    async (tokenId: bigint) => {
      const acct = requireReady();
      const { lifeforms } = writeContracts(acct);
      const { transaction_hash } = await acct.execute([
        lifeforms.populate("move_lifeform_forward", [tokenId]),
      ]);
      return transaction_hash;
    },
    [requireReady],
  );

  /** Read an address's NUT balance (in wei). */
  const getNutBalance = useCallback(async (addr: string): Promise<bigint> => {
    if (!isConfigured()) return 0n;
    const { nutrient } = readContracts();
    const balance = await nutrient.balance_of(addr);
    return balance as bigint;
  }, []);

  return { mintLoop, moveForward, getNutBalance };
}
