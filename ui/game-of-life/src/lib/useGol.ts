"use client";

import { useCallback } from "react";
import { addAddressPadding, hash } from "starknet";
import { useWallet } from "./wallet";
import {
  ADDRESSES,
  NUT_DECIMALS,
  isConfigured,
  provider,
  readContracts,
  writeContracts,
} from "./contracts";

export interface LifeformData {
  isLoop: boolean;
  isStill: boolean;
  isAlive: boolean;
  isDead: boolean;
  sequenceLength: number;
  currentState: bigint;
  age: number;
}

export interface OwnedLifeform {
  tokenId: bigint;
  owner: string;
  data: LifeformData;
}

function parseLifeform(raw: Record<string, unknown>): LifeformData {
  return {
    isLoop: Boolean(raw.is_loop),
    isStill: Boolean(raw.is_still),
    isAlive: Boolean(raw.is_alive),
    isDead: Boolean(raw.is_dead),
    sequenceLength: Number(raw.sequence_length as bigint),
    currentState: BigInt(raw.current_state as bigint),
    age: Number(raw.age as bigint),
  };
}

/**
 * Actions against the on-chain Game of Life. Loop/path discovery happens client-side
 * (see lib/gameOfLife.ts); these helpers submit and read the results.
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

  /** Mint a discovered loop (approves the NUT cost, then mints, in one multicall). */
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

  /** Mint a discovered path leading into a loop. */
  const mintPath = useCallback(
    async (
      pathId: bigint,
      lengthToLoop: number,
      loopEntry: bigint,
      loopLength: number,
      recipient: string,
    ) => {
      const acct = requireReady();
      const { pathMinter, nutrient } = writeContracts(acct);
      const price = BigInt(lengthToLoop) * 10n ** NUT_DECIMALS;
      const approveCall = nutrient.populate("approve", [ADDRESSES.lifeforms, price]);
      const mintCall = pathMinter.populate("mint_path", [
        pathId,
        lengthToLoop,
        loopEntry,
        loopLength,
        recipient,
      ]);
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

  /** Read a single lifeform's owner + on-chain state, or null if it isn't minted. */
  const getLifeform = useCallback(async (tokenId: bigint): Promise<OwnedLifeform | null> => {
    if (!isConfigured()) return null;
    const { lifeforms } = readContracts();
    try {
      const owner = await lifeforms.owner_of(tokenId);
      const raw = (await lifeforms.get_lifeform_data(tokenId)) as Record<string, unknown>;
      return { tokenId, owner: addAddressPadding(owner as bigint), data: parseLifeform(raw) };
    } catch {
      return null; // token not minted
    }
  }, []);

  /**
   * Enumerate the lifeforms an address minted, via the NewLifeForm event log, then
   * confirm each is still owned by that address. (The NFT isn't Enumerable, so we
   * reconstruct ownership from events.)
   */
  const listOwnedLifeforms = useCallback(
    async (owner: string): Promise<OwnedLifeform[]> => {
      if (!isConfigured()) return [];
      try {
        const eventKey = hash.getSelectorFromName("NewLifeForm");
        const ownerBig = BigInt(owner);
        const tokenIds = new Set<bigint>();
        let continuation: string | undefined;

        for (let page = 0; page < 20; page++) {
          const res = await provider.getEvents({
            address: ADDRESSES.lifeforms,
            from_block: { block_number: 0 },
            to_block: "latest",
            keys: [[eventKey]],
            chunk_size: 100,
            continuation_token: continuation,
          });
          for (const ev of res.events) {
            // data layout: [owner, token_id_low, token_id_high, ...lifeform_data]
            if (ev.data.length < 3) continue;
            if (BigInt(ev.data[0]) !== ownerBig) continue;
            tokenIds.add(BigInt(ev.data[1]) + (BigInt(ev.data[2]) << 128n));
          }
          continuation = res.continuation_token;
          if (!continuation) break;
        }

        const owned: OwnedLifeform[] = [];
        for (const tokenId of tokenIds) {
          const lf = await getLifeform(tokenId);
          if (lf && BigInt(lf.owner) === ownerBig) owned.push(lf);
        }
        return owned;
      } catch {
        return [];
      }
    },
    [getLifeform],
  );

  return { mintLoop, mintPath, moveForward, getNutBalance, getLifeform, listOwnedLifeforms };
}
