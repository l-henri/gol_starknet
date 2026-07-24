"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useGolSdk } from "@/lib/sdk";
import { useWallet } from "@/lib/wallet";
import { useNutBalance } from "@/lib/useNut";
import { shortAddr } from "@/lib/format";
import { daysLeft } from "@/lib/usePet";
import type { JsLifeform } from "@/lib/types";

// The quiet rim of the petri dish: always present, never loud. Green is chrome only (the heartbeat)
// — never applied to creatures, which carry their own on-chain colours.

type NavItem = { href: string; label: string; match: (p: string) => boolean };
const NAV: NavItem[] = [
  { href: "/", label: "Garden", match: (p) => p === "/" || p.startsWith("/life") },
  { href: "/create", label: "Create", match: (p) => p.startsWith("/create") },
  { href: "/incubator", label: "Incubator", match: (p) => p.startsWith("/incubator") },
  { href: "/pets", label: "Wards", match: (p) => p.startsWith("/pets") },
  { href: "/leaderboards", label: "Records", match: (p) => p.startsWith("/leaderboards") },
];

const HUNGRY_DAYS = 2;

export default function GardenHeader() {
  const pathname = usePathname() || "/";
  const { sdk } = useGolSdk();
  const { address, connecting, connect, disconnect, onSepolia, switchToSepolia, txEpoch } = useWallet();
  const nut = useNutBalance();
  const [census, setCensus] = useState<number | null>(null);
  const [wardsHungry, setWardsHungry] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Ambient living census — the count of alive Bacteria on-chain (proof-of-life). Fetched once;
  // at scale this should come from the indexer rather than a full lifeform scan.
  useEffect(() => {
    if (!sdk) return;
    let cancelled = false;
    sdk
      .recentLifeforms(0)
      .then((r) => {
        if (cancelled) return;
        const alive = ((r as JsLifeform[]) ?? []).filter((lf) => !lf.is_dead).length;
        setCensus(alive);
      })
      .catch(() => { /* leave the census hidden rather than show a dead-garden "0" */ });
    return () => { cancelled = true; };
  }, [sdk]);

  // Does the connected caretaker have any hungry wards? (bond within 2 days of — or past — lapse)
  useEffect(() => {
    if (!sdk || !address) { setWardsHungry(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const pairs = ((await sdk.petPairs()) as { creature_id: string; holder: string }[]) ?? [];
        const mine = pairs.filter((p) => BigInt(p.holder) === BigInt(address));
        for (const p of mine) {
          if (cancelled) return;
          const b = (await sdk.bondStatus(p.creature_id, p.holder)) as { held: boolean; last_pet: number; reapable: boolean };
          if (!b.held) continue;
          const left = daysLeft({ held: true, lastPet: b.last_pet, reapable: b.reapable });
          if (b.reapable || (left !== null && left <= HUNGRY_DAYS)) {
            if (!cancelled) setWardsHungry(true);
            return;
          }
        }
        if (!cancelled) setWardsHungry(false);
      } catch { if (!cancelled) setWardsHungry(false); }
    })();
    return () => { cancelled = true; };
  }, [sdk, address, txEpoch]);

  // close the mobile sheet whenever the route changes
  useEffect(() => { setMenuOpen(false); }, [pathname]);

  const navLinks = (onClick?: () => void) =>
    NAV.map((n) => (
      <Link key={n.href} href={n.href} onClick={onClick} className={"tb-link" + (n.match(pathname) ? " active" : "")}>
        {n.label}
      </Link>
    ));

  const wallet = (
    <>
      {census !== null && (
        <span className="tb-census"><b>{census.toLocaleString("en-US")}</b> alive</span>
      )}
      {!address ? (
        <button className="tb-connect primary" onClick={connect} disabled={connecting}>
          {connecting ? "Connecting…" : "Connect"}
        </button>
      ) : !onSepolia ? (
        <button className="tb-connect warn" onClick={switchToSepolia}>Wrong network</button>
      ) : (
        <span className="tb-account">
          {wardsHungry && (
            <Link href="/pets" className="tb-hungry" title="A ward is hungry — pet it before its bond wilts" aria-label="A ward is hungry" />
          )}
          {nut !== null && (
            <Link href="/pets" className="tb-nut" title="Your NUT — sustenance, grown by breathing life into creatures">NUT {nut.toLocaleString("en-US")}</Link>
          )}
          <button className="tb-connect" onClick={disconnect} title="Disconnect">{shortAddr(address)}</button>
        </span>
      )}
    </>
  );

  return (
    <>
    <header className="topbar">
      <div className="topbar-inner">
        <Link href="/" className="tb-brand" aria-label="petri — home">
          <span className="tb-heartbeat" aria-hidden="true" />
          <span className="tb-word">petri</span>
          <span className="tb-desc">a garden of digital bacteria</span>
        </Link>

        <nav className="tb-nav" aria-label="Primary">{navLinks()}</nav>

        <div className="tb-right">{wallet}</div>

        <button
          className="tb-burger"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          <span /><span /><span />
        </button>
      </div>
    </header>

    {/* rendered OUTSIDE <header> on purpose: .topbar's backdrop-filter would otherwise become the
        containing block for this position:fixed sheet, confining it to the 56px bar. */}
    {menuOpen && (
      <div className="tb-sheet" role="dialog" aria-modal="true" aria-label="Menu">
        <div className="tb-sheet-overlay" onClick={() => setMenuOpen(false)} />
        <div className="tb-sheet-panel">
          <nav className="tb-sheet-nav" aria-label="Primary">{navLinks(() => setMenuOpen(false))}</nav>
          <div className="tb-sheet-foot">{wallet}</div>
        </div>
      </div>
    )}
    </>
  );
}
