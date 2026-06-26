import type { Metadata } from "next";
import { Space_Grotesk, JetBrains_Mono, Press_Start_2P } from "next/font/google";
import "./globals.css";
import { GolSdkProvider } from "@/lib/sdk";
import { WalletProvider } from "@/lib/wallet";
import { LangProvider } from "@/lib/i18n";
import GardenHeader from "@/components/GardenHeader";
import SiteFooter from "@/components/SiteFooter";

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

export const metadata: Metadata = {
  title: "Digital Bacteria — autonomous life on Starknet",
  description:
    "A tended garden of autonomous Conway's Game of Life creatures, living forever on Starknet. Watch them breathe, keep them alive, set your own free.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${grotesk.variable} ${mono.variable} ${arcade.variable}`}>
        <LangProvider>
          <GolSdkProvider>
            <WalletProvider>
              <GardenHeader />
              <main>{children}</main>
              <SiteFooter />
            </WalletProvider>
          </GolSdkProvider>
        </LangProvider>
      </body>
    </html>
  );
}
