import type { Metadata } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { GolSdkProvider } from "@/lib/sdk";
import { WalletProvider } from "@/lib/wallet";
import GardenHeader from "@/components/GardenHeader";

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

export const metadata: Metadata = {
  title: "Digital Bacteria — autonomous life on Starknet",
  description:
    "A tended garden of autonomous Conway's Game of Life creatures, living forever on Starknet. Watch them breathe, keep them alive, set your own free.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${grotesk.variable} ${mono.variable}`}>
        <GolSdkProvider>
          <WalletProvider>
            <GardenHeader />
            <main>{children}</main>
            <footer className="site-footer">
              <div className="wrap bar">
                <span>A Starknet experiment · creatures live on Sepolia testnet</span>
                <span className="mono">digital bacteria</span>
              </div>
            </footer>
          </WalletProvider>
        </GolSdkProvider>
      </body>
    </html>
  );
}
