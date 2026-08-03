import type { NextConfig } from "next";

// starkzap's bridge / Solana-connect / confidential subsystems — and Privy's farcaster
// mini-app integration — lazily `import()` optional peer deps we don't use (and don't
// install). IgnorePlugin stops webpack resolving them at build time; if one of those code
// paths were ever hit at runtime, the libraries' own loaders raise their friendly
// "install X" errors — exactly the intended optional-peer behaviour.
const OPTIONAL_PEERS =
  /^(@solana\/web3\.js|@fatsolutions\/tongo-sdk|@hyperlane-xyz\/(registry|sdk|utils)|@cartridge\/controller|ethers|@farcaster\/mini-app-solana)$/;

const nextConfig: NextConfig = {
  webpack: (config, { webpack }) => {
    config.plugins.push(new webpack.IgnorePlugin({ resourceRegExp: OPTIONAL_PEERS }));
    return config;
  },
};

export default nextConfig;
