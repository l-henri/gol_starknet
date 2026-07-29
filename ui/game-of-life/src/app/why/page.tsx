"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Creature from "@/components/Creature";

/* ------------------------------------------------------------------ *
 * /why — the manifesto. A reading surface (one narrow column), the
 * founding essay in the creator's first-person voice (from
 * docs/purpose.md; 15×15 → 41×41, the contract's real grid). Beats are
 * separated by space, punctuated by small LIVE Conway simulations that
 * demonstrate the argument. Green is chrome only — the sims are
 * illustrative (a neutral latent-blue), never owner-coloured creatures.
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
        <h1 className="why-title">Digital bacteria — simple lifeforms that can live forever, independent of the one who made them.</h1>

        <p>In the 1970s, a mathematician named John Conway posed a thought experiment: could a simple set of rules, run in a computer, give rise to complexity? He described the <em>Game of Life</em> — a program that defines the behaviour of a grid of pixels. Apply the rules once and the grid steps forward one generation, computing a new grid. Repeat, over and over, and you get the unpredictable, mesmerising patterns that have fascinated computer-science students for decades.</p>

        <p>Consider a simple 41×41 grid. There is something fascinating in the fact that it has more possible states than there are atoms in the universe — and something profound in a set of rules that lets each of those states evolve in its own direction, toward its own destiny.</p>

        <Sim seed={R_PENT} speed={3} cycleMs={16000} caption="one grid, evolving — no two moments quite alike" />

        <p>And they all lead somewhere. Evolve any state long enough and it converges on one of two fates: an empty grid that repeats forever, or a loop — a sequence of states that cycles without end. Every lifeform eventually settles into life, or death.</p>

        <div className="why-sim-pair">
          <Sim seed={SPARK} speed={4} cycleMs={4200} caption="this one goes out — an empty grid, repeating" />
          <Sim seed={BLINKER} speed={2} caption="this one finds a loop — it lives" />
        </div>

        <p>Where the experiment falls short, to my taste, is persistence. I can run all the states I want; the moment I turn off my computer, they all disappear. They look alive, but they aren’t autonomous. They depend on me.</p>

        <p>I want to try to set them free.</p>

        <p>Blockchains are a substrate for digital life — always-on computers that let anyone, anywhere, interact with arbitrary programs. They are petri dishes for digital creatures, whether those are proto-financial systems, ownership registries, or digital bacteria. Running the Game of Life on one lets me make simple creatures that move forward forever, independent of me: define a grid, and give it a button anyone can push. If the creature is alive — if it leads to a loop — it will go on forever, as long as someone keeps pushing.</p>

        <p>It’s the digital equivalent of Theo Jansen’s Strandbeest — the wind-powered creatures that live on real beaches, walking on their own long after he has walked away.</p>

        <p>Why would it move forward, you ask? Why would anyone push it? Even when it’s cheap, it costs something to run a program on a blockchain. What’s in it for the person pushing? Here we reach what actually moves blockchains forward: social coordination. Tweak the program a little further and you can make your own bacteria, too. The rules of life are the same for everyone — find a pattern that’s alive and you can bring it on-chain, and it will live, independent of you.</p>

        <p>The only thing the program asks in return is that you breathe a little life into an existing creature. Mine, someone else’s — it doesn’t matter. Pick one you like. Move it forward a bit; give it some life, and it will give some back to you.</p>

        <p>With an undefined, very large number of digital bacteria waiting to be discovered, there is a vast reservoir of life for our creatures to draw on. And once it’s done? We’ll see. If you’ve read this far, you’re probably as taken with this as I am. As long as people like you and me exist — as long as someone wants to push these lifeforms forward — they’ll keep living. That’s the beauty of blockchains: they keep programs available forever, to anyone who cares to use them.</p>

        <p className="why-close">
          <Link href="/" className="why-invite">Pick one you like, and move it forward a bit →</Link>
        </p>
      </article>
    </div>
  );
}
