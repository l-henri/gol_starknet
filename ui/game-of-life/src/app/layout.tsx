import type { Metadata } from "next";
import { Space_Grotesk, JetBrains_Mono, Press_Start_2P, Inter } from "next/font/google";
import "./globals.css";
import { GolSdkProvider } from "@/lib/sdk";
import { WalletProvider } from "@/lib/wallet";
import { BreathBasketProvider } from "@/lib/breathBasket";
import { LangProvider } from "@/lib/i18n";
import GardenHeader from "@/components/GardenHeader";
import SiteFooter from "@/components/SiteFooter";
import FaviconBlinker from "@/components/FaviconBlinker";

const grotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-grotesk",
  weight: ["400", "500", "600", "700"],
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600"],
});
// 90s-arcade pixel face — drives the /create destiny "score"
const arcade = Press_Start_2P({
  subsets: ["latin"],
  variable: "--font-arcade",
  weight: "400",
});
// Inter — the reading face for the /why manifesto (a quiet, legible essay column)
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-reading",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "petri, a garden of digital bacteria",
  description:
    "A tended garden of autonomous Conway's Game of Life creatures, living forever on Starknet. Watch them breathe, keep them alive, set your own free.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning: browser extensions (Grammarly, Dark Reader, password managers…)
    // inject attributes onto <html>/<body> before React hydrates, which trips React 19's
    // attribute-mismatch warning. This suppresses that warning ONE level deep on these two
    // elements only — genuine hydration mismatches anywhere else in the tree still surface.
    <html lang="en" suppressHydrationWarning>
      <body className={`${grotesk.variable} ${mono.variable} ${arcade.variable} ${inter.variable}`} suppressHydrationWarning>
        <LangProvider>
          <GolSdkProvider>
            <WalletProvider>
              <BreathBasketProvider>
                <FaviconBlinker />
                <GardenHeader />
                <main>{children}</main>
                <SiteFooter />
              </BreathBasketProvider>
            </WalletProvider>
          </GolSdkProvider>
        </LangProvider>
      </body>
    </html>
  );
}
