// Server-side creature lookup for link previews (/life/[id] generateMetadata + opengraph-image).
//
// Crawlers never execute the client WASM SDK, so these routes read the two collections directly
// over JSON-RPC — the official nodes' missing CORS headers don't matter server-side — and decode
// the 7-felt GridState here. The decode mirrors crates/gol-sdk/src/grid.rs (41 rows, 41 bits each,
// packed little-endian 6-per-felt) and crates/gol-sdk/src/rpc.rs (struct layouts).

import { unstable_cache } from "next/cache";
import { NETWORK, UPSTREAM_RPC } from "./config";
import { findBeast } from "./bestiary";
import { rowsFromCoords } from "./creatures";

// v3 address book — mirrors crates/gol-sdk/src/config.rs (the SDK bakes these in, but the WASM
// build can't run in a route handler, so the preview routes carry their own copy).
const ADDRESSES: Record<string, { lifeforms: string; paths: string }> = {
  sepolia: {
    lifeforms: "0x001e8e1c75f960faebd6f24c4321aad2f76e54dce00d11d690cb58ff1666ceec",
    paths: "0x00d43450e4cc02677b193f0a0f25daf1a85a1fcb1071d24674c1db485763042c",
  },
  mainnet: {
    lifeforms: "0x05ebd2e7ca95af6a81863e89496ba2ca0b3765bd04227bde4b769afbc13e5784",
    paths: "0x01259a8b553e5ae806620ff422eb85ccbce2b8ff034235e8d09e36060058f64e",
  },
};

// starknet_keccak entrypoint selectors, precomputed with starknet.js `hash.getSelectorFromName`
// so the preview routes don't pull starknet.js into their bundle.
const SEL = {
  get_lifeform_data: "0x3cd63e45aac862a3d6c03c62cbf6b2aee5f77a34bf9b3563c9b405e5695942f",
  get_render_params: "0x2283528180088f2d69bc6bd86543eb80de1652f80096ee2aebfcd1473802a11",
  get_path_data: "0x36008043a0390a80cfdf6a42bbb8c5558e33d7821ac0bb358128e290af5498",
  owner_of: "0x3552df12bdc6089cf963c40c4cf56fbfd4bd14680c244d1c5494c2790f1ea5c",
};

export type PreviewData =
  | {
      kind: "loop";
      rows: number[];
      bg: number;
      cell: number;
      idShort: string;
      name: string;
      age: number;
      period: number;
      isStill: boolean;
      isDead: boolean;
    }
  | {
      kind: "path";
      rows: number[];
      bg: number;
      cell: number;
      idShort: string;
      journey: number;
      lifeState: "alive" | "frozen" | "dead";
    }
  | { kind: "beast"; rows: number[]; name: string; kindLabel: string }
  | { kind: "none" };

const MASK41 = (1n << 41n) - 1n;
const WORD_COUNTS = [6, 6, 6, 6, 6, 6, 5];

/** 7 GridState felts -> the 41 row bitmasks (each < 2^41, exact as a JS number). */
function rowsFromGridFelts(felts: string[]): number[] {
  const rows: number[] = [];
  for (let i = 0; i < 7; i++) {
    const w = BigInt(felts[i]);
    for (let j = 0; j < WORD_COUNTS[i]; j++) rows.push(Number((w >> BigInt(41 * j)) & MASK41));
  }
  return rows;
}

const shortId = (id: bigint): string => {
  const hex = "0x" + id.toString(16).padStart(64, "0");
  return `${hex.slice(0, 6)}…${hex.slice(-4)}`;
};

type RpcItem = { id: number; result?: string[]; error?: unknown };
const resultOf = (items: RpcItem[], id: number): string[] | null => {
  const hit = items.find((r) => r.id === id);
  return hit && !hit.error && Array.isArray(hit.result) ? hit.result : null;
};

/** One JSON-RPC batch against both collections; per-item errors mark "not this kind". */
async function readChain(idDec: string): Promise<PreviewData> {
  const addrs = ADDRESSES[NETWORK] ?? ADDRESSES.sepolia;
  const rpc = UPSTREAM_RPC[NETWORK] ?? UPSTREAM_RPC.sepolia;
  const token = BigInt(idDec);
  const calldata = ["0x" + (token & ((1n << 128n) - 1n)).toString(16), "0x" + (token >> 128n).toString(16)];
  const call = (id: number, to: string, selector: string) => ({
    jsonrpc: "2.0",
    id,
    method: "starknet_call",
    params: {
      request: { contract_address: to, entry_point_selector: selector, calldata },
      block_id: "latest",
    },
  });

  const res = await fetch(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify([
      call(1, addrs.lifeforms, SEL.get_lifeform_data),
      call(2, addrs.lifeforms, SEL.get_render_params),
      call(3, addrs.paths, SEL.get_path_data),
      call(4, addrs.paths, SEL.get_render_params),
      // owner_of reverts for unminted (and burned-wanderer) ids — the existence gates, exactly
      // like the SDK's readers. The data getters return zeroed/default structs instead of
      // reverting, so they can't be trusted for existence.
      call(5, addrs.paths, SEL.owner_of),
      call(6, addrs.lifeforms, SEL.owner_of),
    ]),
    signal: AbortSignal.timeout(5000),
    cache: "no-store", // caching happens at the unstable_cache layer
  });
  if (!res.ok) throw new Error(`rpc ${res.status}`);
  const items = (await res.json()) as RpcItem[];

  // Loop (Bacterium): owner_of gates existence.
  const loopData = resultOf(items, 1);
  const loopRp = resultOf(items, 2);
  if (resultOf(items, 6) && loopData && loopData.length >= 13 && loopRp && loopRp.length >= 3) {
    const isLoop = BigInt(loopData[0]) !== 0n;
    const isStill = BigInt(loopData[1]) !== 0n;
    const period = Number(BigInt(loopData[4]));
    return {
      kind: "loop",
      rows: rowsFromGridFelts(loopData.slice(5, 12)),
      bg: Number(BigInt(loopRp[0])),
      cell: Number(BigInt(loopRp[1])),
      idShort: shortId(token),
      name: isStill ? "Still Life" : isLoop ? `Period-${period} Loop` : "Lifeform",
      age: Number(BigInt(loopData[12])),
      period,
      isStill,
      isDead: BigInt(loopData[3]) !== 0n,
    };
  }

  // Wanderer: owner_of gates existence (burned ids revert), matching the page's dispatcher.
  const pathData = resultOf(items, 3);
  const pathRp = resultOf(items, 4);
  if (pathData && pathData.length >= 14 && pathRp && pathRp.length >= 3 && resultOf(items, 5)) {
    const stateIdx = Number(BigInt(pathData[0]));
    return {
      kind: "path",
      rows: rowsFromGridFelts(pathData.slice(2, 9)),
      bg: Number(BigInt(pathRp[0])),
      cell: Number(BigInt(pathRp[1])),
      idShort: shortId(token),
      journey: Number(BigInt(pathData[1])),
      lifeState: stateIdx === 1 ? "frozen" : stateIdx === 2 ? "dead" : "alive",
    };
  }

  return { kind: "none" };
}

/**
 * The creature behind /life/[id], for preview purposes. Bestiary slugs resolve locally; minted ids
 * read the chain (cached ~2 min so an unfurl burst — every crawler fetches page + image — costs one
 * node round-trip). Never throws: anything unresolvable is { kind: "none" }.
 */
export async function loadPreview(id: string): Promise<PreviewData> {
  const beast = findBeast(id);
  if (beast) {
    return {
      kind: "beast",
      rows: rowsFromCoords(beast.coords),
      name: beast.name,
      kindLabel: beast.kind,
    };
  }
  let idDec: string;
  try {
    idDec = BigInt(id).toString();
  } catch {
    return { kind: "none" };
  }
  try {
    const cached = unstable_cache(() => readChain(idDec), ["link-preview", "v2", NETWORK, idDec], {
      revalidate: 120,
    });
    return await cached();
  } catch {
    return { kind: "none" };
  }
}
