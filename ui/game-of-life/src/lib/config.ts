// Shared client config.

export const NETWORK = "mainnet";

// Official Starknet nodes. They send NO CORS headers, so the browser can't fetch them directly;
// everything goes through our same-origin proxy at /api/rpc (see app/api/rpc/route.ts).
//
// Two specs on purpose: the Rust/WASM SDK handles RPC v0.10 fine (fast, latest), but starknet.js
// 7.6.x only speaks RPC 0.8 and REFUSES a v0.10 node ("spec not supported"). So starknet.js calls
// (tx-status polling, gas-tier detection) use the node's v0_8 endpoint; SDK reads use v0.10.
export const UPSTREAM_RPC: Record<string, string> = {
  sepolia: "https://sepolia.nodes.starknet.org/rpc/v0_10",
  mainnet: "https://mainnet.nodes.starknet.org/rpc/v0_10",
};
export const UPSTREAM_RPC_COMPAT: Record<string, string> = {
  sepolia: "https://sepolia.nodes.starknet.org/rpc/v0_8",
  mainnet: "https://mainnet.nodes.starknet.org/rpc/v0_8",
};

const proxyBase = () => (typeof window !== "undefined" ? `${window.location.origin}/api/rpc` : "/api/rpc");

// SDK reads (v0.10). Override with NEXT_PUBLIC_GOL_RPC_URL to hit a CORS-enabled node directly.
export const RPC_URL = process.env.NEXT_PUBLIC_GOL_RPC_URL || proxyBase();
// starknet.js calls (v0.8 — tx polling, tier detection).
export const RPC_URL_COMPAT = process.env.NEXT_PUBLIC_GOL_RPC_URL_COMPAT || `${proxyBase()}?spec=compat`;

// Starkscan explorer (network-aware: sepolia.starkscan.co on testnet, starkscan.co on mainnet).
export const explorerTxUrl = (hash: string): string =>
  `https://${(NETWORK as string) === "mainnet" ? "" : "sepolia."}starkscan.co/tx/${hash}`;
