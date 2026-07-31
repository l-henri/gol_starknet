"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Creature from "@/components/Creature";

/* ------------------------------------------------------------------ *
 * /why — the manifesto. A reading surface (one narrow column), the
 * founding essay in the creator's first-person voice — the VERBATIM
 * copy of docs/purpose.md (Henri, 2026-07-31; the two must not drift).
 * Beats are separated by space, punctuated by small LIVE Conway
 * simulations that demonstrate the argument. Green is chrome only —
 * the sims are illustrative (a neutral latent-blue), never
 * owner-coloured creatures.
 * ------------------------------------------------------------------ */

const GRID = 41;
const MID = 20;
/** Shift a small pattern so its bounding box centres on the 41×41 grid (Creature doesn't centre). */
function centred(coords: [number, number][]): [number, number][] {
  const rs = coords.map((c) => c[0]);
  const cs = coords.map((c) => c[1]);
  const or = Math.round((Math.min(...rs) + Math.max(...rs)) / 2);
  const oc = Math.round((Math.min(...cs) + Math.max(...cs)) / 2);
  return coords.map(([r, c]) => [MID + (r - or), MID + (c - oc)] as [number, number]).filter(([r, c]) => r >= 0 && r < GRID && c >= 0 && c < GRID);
}

// verified on the 41×41 torus: rpent stays chaotic for 211 generations; spark empties in 6; the
// blinker loops with period 2 forever.
const R_PENT = centred([[0, 1], [0, 2], [1, 0], [1, 1], [2, 1]]);
const SPARK = centred([[0, 0], [0, 2], [1, 0], [1, 2], [2, 1], [2, 2]]);
const BLINKER = centred([[0, 0], [0, 1], [0, 2]]);
const SIM_CELL = 0x9ad1ff; // latent blue — illustrative, not an owned creature's palette

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduced;
}

/** A live Conway simulation that demonstrates one outcome. Restarts from the seed every `cycleMs`
 * so it stays legible; under reduced motion it holds a single frame (no restart, no stepping). */
function Sim({ seed, speed, cycleMs, caption }: { seed: [number, number][]; speed: number; cycleMs?: number; caption: string }) {
  const reduced = usePrefersReducedMotion();
  const [cycle, setCycle] = useState(0);
  useEffect(() => {
    if (reduced || !cycleMs) return;
    const iv = setInterval(() => setCycle((c) => c + 1), cycleMs);
    return () => clearInterval(iv);
  }, [reduced, cycleMs]);
  return (
    <figure className="why-sim">
      <div className="why-sim-grid">
        <Creature key={cycle} coords={seed} variant="living" cell={SIM_CELL} speed={speed} animate={!reduced} res={240} ariaLabel={caption} />
      </div>
      <figcaption className="why-sim-cap mono">{caption}</figcaption>
    </figure>
  );
}

export default function WhyPage() {
  return (
    <div className="wrap why">
      <article className="why-essay">
        <span className="eyebrow">Why this exists</span>
        <h1 className="why-title">Digital bacteria: engineering simple life forms that can live forever, independently of their creator</h1>

        <p>In the 70s, a mathematician named John Conway came up with a thought experiment: could you create a simple set of rules in a computer that could give rise to complexity? He described “Game of Life”, a computer program that defines the behavior of a pixel grid. Applying the set of rules on a pixel grid allows it to change and move forward by one generation, computing a new grid. Repeat this process over and over, and you get unpredictable, mesmerizing behaviours and patterns on screen that have fascinated computer science students for decades.</p>

        <p>Consider a simple 41x41 pixel grid.</p>

        <p>There is something fascinating in considering that it has more possible states than there are atoms in the universe. And there is something profound in having a set of rules allowing each of these possible states to evolve in its own direction, towards its own destiny.</p>

        <Sim seed={R_PENT} speed={3} cycleMs={16000} caption="one grid, evolving; no two moments quite alike" />

        <p>Moreover - they all lead somewhere. If you evolve them enough times, each of those states leads either to an empty grid that keeps repeating itself, or a loop, a sequence of states that repeats forever.</p>

        <p>Each lifeform will eventually converge towards either life, or death.</p>

        <div className="why-sim-pair">
          <Sim seed={SPARK} speed={4} cycleMs={4200} caption="this one goes out: an empty grid, repeating" />
          <Sim seed={BLINKER} speed={2} caption="this one finds a loop; it lives" />
        </div>

        <p>Where the experiment falls short to my taste is in its persistence. I can run all the states I want, once I turn off my computer, they all disappear. These creatures look alive but they are not autonomous; they depend on me.</p>

        <p>I want to try and set them free.</p>

        <p>Blockchains are a substrate for digital life. They are always on compute platforms that allow anyone, anywhere, to interact with arbitrary computer programs. They are petri dishes for digital creatures, whether they be proto financial systems, ownership registries, or digital bacteria.</p>

        <p>Running “Game of Life” on a blockchain allows me to create simple digital creatures that can evolve and move forward forever, independent of me. I can define a pixel grid, and give it a button that allows anyone to push it forward. If my creature is alive, if it leads to a loop, then it will move forward forever, as long as someone keeps pushing. It’s the digital equivalent of Strandbeest&apos;s, Theo Jansen&apos;s creatures that live on (real) beaches and are powered by wind.</p>

        <p>Why would it move forward, you ask? Why would anyone push it? Even if it&apos;s cheap, it does cost money to run programs on blockchains. What&apos;s in it for the person pushing?</p>

        <p>And here we get into what moves blockchains forward: social coordination. If I tweak my program a little more, I can make it possible for you to create your own bacteria, too. The rules of life are the same for everyone: if you find a pattern that is alive, you can create it &quot;on chain&quot;, and it will live, independent of you.</p>

        <p>The only thing the program will ask is that you breathe a little life into an existing creature. Mine, somebody else&apos;s - it does not matter. Pick one you like. Move it forward a bit; give it some life, and it will give some back to you.</p>

        <p>With an undefined, very large, number of digital bacteria waiting to be discovered, there is a massive reservoir of life available to our creatures.</p>

        <p>And once it&apos;s done? Well, we&apos;ll see. If you read this far, you are likely as fascinated by this thing as I am. As long as people like you and I exist, as long as someone wants to push these lifeforms forward, they&apos;ll keep living. That’s the beauty of blockchains: they allow computer programs to be available forever to those who want to use them.</p>

        <p className="why-close">
          <Link href="/" className="why-invite">Pick one you like, and move it forward a bit →</Link>
        </p>
      </article>
    </div>
  );
}
