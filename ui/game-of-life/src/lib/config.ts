// Shared client config.

export const NETWORK = "sepolia";

// Official Starknet nodes, RPC spec v0.10. They send NO CORS headers, so the browser can't fetch
// them directly (verified: preflight 405, no Access-Control-Allow-Origin). Reads (SDK) and the
// wallet provider therefore go through our same-origin proxy at /api/rpc (see app/api/rpc/route.ts),
// which forwards to the node below server-side.
export const UPSTREAM_RPC: Record<string, string> = {
  sepolia: "https://sepolia.nodes.starknet.org/rpc/v0_10",
  mainnet: "https://mainnet.nodes.starknet.org/rpc/v0_10",
};

// What the browser talks to. Default: the same-origin proxy (no CORS). Override with
// NEXT_PUBLIC_GOL_RPC_URL to hit a CORS-enabled node/gateway directly (skips the proxy).
export const RPC_URL =
  process.env.NEXT_PUBLIC_GOL_RPC_URL ||
  (typeof window !== "undefined" ? `${window.location.origin}/api/rpc` : "/api/rpc");

// Voyager explorer (network-aware: sepolia.voyager.online on testnet, voyager.online on mainnet).
export const explorerTxUrl = (hash: string): string =>
  `https://${(NETWORK as string) === "mainnet" ? "" : "sepolia."}voyager.online/tx/${hash}`;
