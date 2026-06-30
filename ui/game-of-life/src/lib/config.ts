// Shared client config.

// The default SNF node (sepolia.nodes.starknet.org) sends no CORS headers, so browser fetch is
// blocked. Use a CORS-enabled public gateway in the browser. Override with NEXT_PUBLIC_GOL_RPC_URL
// (must be https + CORS-enabled). The same URL backs both reads (SDK) and the wallet provider.
export const RPC_URL =
  process.env.NEXT_PUBLIC_GOL_RPC_URL || "https://api.cartridge.gg/x/starknet/sepolia";

export const NETWORK = "sepolia";

// Voyager explorer (network-aware: sepolia.voyager.online on testnet, voyager.online on mainnet).
export const explorerTxUrl = (hash: string): string =>
  `https://${(NETWORK as string) === "mainnet" ? "" : "sepolia."}voyager.online/tx/${hash}`;
