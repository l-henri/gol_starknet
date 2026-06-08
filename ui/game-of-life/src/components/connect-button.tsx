"use client";

import { useWallet } from "@/lib/wallet";

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export default function ConnectButton() {
  const { address, connect, disconnect, connecting } = useWallet();

  if (address) {
    return (
      <button
        onClick={disconnect}
        className="px-3 py-1.5 rounded border border-gray-300 text-sm hover:bg-gray-100"
        title="Disconnect"
      >
        {shortAddress(address)}
      </button>
    );
  }

  return (
    <button
      onClick={connect}
      disabled={connecting}
      className="px-3 py-1.5 rounded bg-purple-600 text-white text-sm hover:bg-purple-700 disabled:opacity-60"
    >
      {connecting ? "Connecting…" : "Connect Wallet"}
    </button>
  );
}
