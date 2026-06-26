"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useGolSdk } from "@/lib/sdk";
import { useWallet } from "@/lib/wallet";
import { formatNut, shortAddr } from "@/lib/format";

export default function GardenHeader() {
  const { sdk } = useGolSdk();
  const { address, connecting, connect, disconnect, onSepolia, switchToSepolia, txEpoch } = useWallet();
  const [nut, setNut] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (sdk && address) {
      sdk
        .nutBalance(address)
        .then((hex: string) => !cancelled && setNut(formatNut(hex)))
        .catch(() => !cancelled && setNut(null));
    } else {
      setNut(null);
    }
    return () => {
      cancelled = true;
    };
    // txEpoch bumps after a confirmed tx (e.g. breathing earns NUT) → refetch the balance
  }, [sdk, address, txEpoch]);

  return (
    <header className="site-header">
      <div className="wrap bar">
        <Link href="/" className="brand">
          <span className="mark" />
          Digital Bacteria
        </Link>
        <div className="header-right">
          <Link href="/create" className="btn">Draw a lifeform</Link>
          <span
            className={`pill ${onSepolia ? "" : "potential"}`}
            title={onSepolia ? "Live on Sepolia testnet" : "Wrong network — click to switch to Sepolia"}
            onClick={onSepolia ? undefined : switchToSepolia}
            role={onSepolia ? undefined : "button"}
            style={onSepolia ? undefined : { cursor: "pointer" }}
          >
            <span className="dot" />
            {onSepolia ? "Sepolia · testnet" : "Switch to Sepolia"}
          </span>
          {address && (
            <span className="nut-chip">
              <b>{nut ?? "…"}</b> NUT
            </span>
          )}
          {address ? (
            <button className="btn" onClick={disconnect} title="Disconnect">
              {shortAddr(address)}
            </button>
          ) : (
            <button className="btn primary" onClick={connect} disabled={connecting}>
              {connecting ? "Connecting…" : "Connect"}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
