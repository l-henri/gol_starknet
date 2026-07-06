"use client";

import { useT } from "@/lib/i18n";

export default function SiteFooter() {
  const { t } = useT();
  return (
    <footer className="site-footer">
      <div className="wrap bar">
        <span>
          {t({
            fr: "Une expérience Starknet · les créatures vivent sur le testnet Sepolia",
            en: "A Starknet experiment · creatures live on Sepolia testnet",
          })}
        </span>
        <span className="mono">digital bacteria</span>
      </div>
    </footer>
  );
}
