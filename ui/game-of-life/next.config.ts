import path from "node:path";
import type { NextConfig } from "next";

// starkzap's bridge / Solana-connect / confidential subsystems import optional peer deps we
// don't install. They must NOT go through IgnorePlugin: starkzap's root index statically
// re-exports modules that statically import these peers, and an ignored module THROWS at
// load time — killing `import("starkzap")` entirely. Instead each peer is aliased to a
// harmless proxy stub (see optional-peer-stub.cjs); the features it backs are never used.
const STARKZAP_OPTIONAL_PEERS = [
  "@solana/web3.js",
  "@fatsolutions/tongo-sdk",
  "@hyperlane-xyz/registry",
  "@hyperlane-xyz/sdk",
  "@hyperlane-xyz/utils",
  "@cartridge/controller",
  "ethers",
];

const nextConfig: NextConfig = {
  webpack: (config, { webpack }) => {
    const stub = path.resolve(__dirname, "optional-peer-stub.cjs");
    for (const peer of STARKZAP_OPTIONAL_PEERS) config.resolve.alias[peer] = stub;
    // Privy's farcaster mini-app integration lazily imports this and handles its absence —
    // IgnorePlugin (load-time throw) matches the intended optional-peer behaviour there.
    config.plugins.push(new webpack.IgnorePlugin({ resourceRegExp: /^@farcaster\/mini-app-solana$/ }));
    return config;
  },
};

export default nextConfig;
