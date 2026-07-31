import type { Metadata } from "next";
import type { ReactNode } from "react";
import { loadPreview } from "@/lib/linkPreview";

// Per-creature link previews. The page itself is a client component (crawlers see none of it),
// so the title/description/OG tags are produced here, server-side, from a direct chain read.
// The matching image comes from ./opengraph-image.tsx via the file convention.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const p = await loadPreview(id);

  let title: string | null = null;
  let description: string | null = null;
  if (p.kind === "loop") {
    title = `${p.name} ${p.idShort} — petri`;
    description = p.isDead
      ? `Gone out after ${p.age.toLocaleString("en-US")} generations. It rests on-chain, and accepts offerings.`
      : `Alive on Starknet · ${p.age.toLocaleString("en-US")} generation${p.age === 1 ? "" : "s"} lived. Tap to breathe life into it.`;
  } else if (p.kind === "path") {
    title = `Wanderer ${p.idShort} — petri`;
    description =
      p.lifeState === "dead"
        ? `A wanderer that faded to nothing after a ${p.journey}-generation journey, kept on Starknet.`
        : `A journey of ${p.journey} generation${p.journey === 1 ? "" : "s"} toward a loop, playing out on Starknet.`;
  } else if (p.kind === "beast") {
    title = `${p.name} — petri`;
    description = `${p.kindLabel} from Conway's reservoir, waiting to be discovered. Set it free on Starknet.`;
  }

  // Unknown / unreadable id: inherit the garden-wide metadata from the root layout.
  if (!title || !description) return { twitter: { card: "summary_large_image" } };

  return {
    title,
    description,
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default function LifeLayout({ children }: { children: ReactNode }) {
  return children;
}
