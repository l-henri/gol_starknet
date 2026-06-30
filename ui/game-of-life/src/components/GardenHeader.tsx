"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useGolSdk } from "@/lib/sdk";
import { useWallet } from "@/lib/wallet";
import { formatNut, shortAddr } from "@/lib/format";
import { useT, LangToggle } from "@/lib/i18n";

export default function GardenHeader() {
  const { t } = useT();
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
          <LangToggle />
          <Link href="/create" className="btn">{t({ fr: "Créer", en: "Create" })}</Link>
          <Link href="/incubator" className="btn" title={t({ fr: "Naissances en cours et motifs gardés", en: "In-progress mints and saved patterns" })}>{t({ fr: "Incubateur", en: "Incubator" })}</Link>
          <span
            className={`pill ${onSepolia ? "" : "potential"}`}
            title={
              onSepolia
                ? t({ fr: "En ligne sur le testnet Sepolia", en: "Live on Sepolia testnet" })
                : t({ fr: "Mauvais réseau — cliquez pour passer sur Sepolia", en: "Wrong network — click to switch to Sepolia" })
            }
            onClick={onSepolia ? undefined : switchToSepolia}
            role={onSepolia ? undefined : "button"}
            style={onSepolia ? undefined : { cursor: "pointer" }}
          >
            <span className="dot" />
            {onSepolia ? "Sepolia · testnet" : t({ fr: "Passer sur Sepolia", en: "Switch to Sepolia" })}
          </span>
          {address && (
            <span className="nut-chip">
              <b>{nut ?? "…"}</b> NUT
            </span>
          )}
          {address ? (
            <button className="btn" onClick={disconnect} title={t({ fr: "Se déconnecter", en: "Disconnect" })}>
              {shortAddr(address)}
            </button>
          ) : (
            <button className="btn primary" onClick={connect} disabled={connecting}>
              {connecting ? t({ fr: "Connexion…", en: "Connecting…" }) : t({ fr: "Connecter", en: "Connect" })}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
