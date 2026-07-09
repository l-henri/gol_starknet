"use client";

import { useEffect } from "react";

// The favicon is a Conway blinker — three green cells on #070709, the simplest thing that lives
// forever. It oscillates between its two phases (horizontal ↔ vertical) by swapping the icon href
// on an interval (the only reliable cross-browser way to animate a favicon). Under
// prefers-reduced-motion it holds a single phase. Mirrors app/icon.svg (the static/social mark).
const CELLS: Record<"h" | "v", [number, number][]> = {
  h: [[3, 12], [12, 12], [21, 12]], // middle row
  v: [[12, 3], [12, 12], [12, 21]], // middle column
};

function href(phase: "h" | "v"): string {
  const rects = CELLS[phase]
    .map(([x, y]) => `<rect x="${x}" y="${y}" width="8" height="8" rx="1.6" fill="#22c55e"/>`)
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#070709"/>${rects}</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export default function FaviconBlinker() {
  useEffect(() => {
    let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    const setPhase = (p: "h" | "v") => {
      link!.type = "image/svg+xml";
      link!.href = href(p);
    };
    setPhase("h");

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return; // hold a single phase

    let horizontal = true;
    const id = window.setInterval(() => {
      horizontal = !horizontal;
      setPhase(horizontal ? "h" : "v");
    }, 1000); // one generation per second — the blinker's heartbeat
    return () => window.clearInterval(id);
  }, []);

  return null;
}
