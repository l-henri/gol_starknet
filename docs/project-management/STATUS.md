# Status

> Snapshot of where the project stands. Keep this short and current — rewrite it each session.
> History lives in [LOG.md](LOG.md); the plan lives in [ROADMAP.md](ROADMAP.md).

**Last updated:** 2026-07-10
**Framing:** WIP **art piece**, not a commercial product — the outcome is burning gas and creating art.
**Active branch:** `new_design` — website design overhaul in progress. Done so far: the Garden
home (living gallery — newest-first walls, no lens toggle; the big "creature of the moment" is a
random pick from the top-10 most-fed loops or top-10 longest methuselahs), the global chrome (the
"petri" top bar + Conway-blinker favicon + a quiet NUT balance chip when connected), `/create` (the "slot machine of life" — two grids,
draw-left/watch-right at 15 fps; "Set it free" mints straight away with a randomly-rolled look, no
colour picker), `/incubator` (warming-egg workbench — per-wallet: hatches-in-progress + saved
creatures for the connected account only; hatched creatures auto-leave), and `/life/[id]` (the ritual
surface — microscope-slide on-chain renderer, a rhythmic-tap "Breathe" (tap to accumulate a depth,
sends as one tx — N gens + N NUT + bond — render fast-forwards; also on Garden-tile hover; dynamic
cap = wallet's deepest breath), caretaker pack; Wanderers play out their journey from their start state, and
"bound for a loop" links to that loop if it's minted or to /create with it preloaded if not), `/pets`
(Wards — windowsill of wards + hunger clocks, the reaper's rounds), and `/leaderboards`
(Records — the census: three toggleable boards, #1 glow). **The redesign sweep is COMPLETE — every page is in the petri look.**
Site renamed **petri** (loop/wanderer collections keep their names). See LOG 2026-07-09/07-10.
`main` remains the shipped trunk. ⚠️ `new_design` not yet QA'd with a connected wallet
(set-free mint, hatch, breathe/pet/daycare) and not yet pushed/merged.
**Build/test:** `scarb build` ✅ · `snforge test` ✅ (91) · `cargo test -p gol-sdk` ✅ (43) · `next build` ✅
**Live site:** https://gol-starknet.vercel.app — Vercel git integration auto-deploys every push to `main` (verified current 2026-07-06)
**Tx tooling:** all on-chain transactions via **strkd** — pair with `kind:"agent"`; never sncast/raw keys

## Where the product is

- **v3 is the live product line** — the **orbit-canonical identity model**
  ([v3-identity-spec.md](../v3-identity-spec.md)): one id system on- and off-chain, symmetry copies
  revert at mint, witness-assisted minting, permanent escrow-staked `prove_malformed` fraud-proofs,
  drawn state preserved for display, `feed_for` + feeder-in-event ride-alongs. **Live on Sepolia
  since 2026-07-06** with a genesis blinker (its on-chain witness check doubles as the Rust↔Cairo
  convention proof); addresses in [v3-deployment.md](../v3-deployment.md). Collections:
  **"Digital Bacteria"/BACT** (loops) + **"Digital Wanderers"/WNDR** (paths).
- **Frontend/SDK repointed to v3 (2026-07-06 evening):** witness mints built internally from
  drawn rows, `familyTokenId` everywhere, duplicate-family detection via the existing
  already-minted check, breathing history preserved across versions. ⚠️ Still to do: a manual
  /create → v3 mint click-through, /leaderboards eyeballing, tiled phase-segment mint on-chain.
- **v2** (and v1) remain deployed but superseded — [v2-deployment.md](../v2-deployment.md); the v2
  symmetry challenge-burn stays live there for its collection.
- **Frontend** (`ui/game-of-life`): garden, `/create` editor, incubator, `/leaderboards` (4 boards,
  data live-verified; ⚠️ page not yet eyeballed in a browser) — [frontend.md](../frontend.md).
  **FR temporarily disabled (2026-07-09):** site is English-only, toggle removed; all `{ fr, en }`
  copy is still in the source so French can be restored once the wording is revised.
- **Specs ready to build:** [pet-mechanism-spec.md](../pet-mechanism-spec.md) (targets v3, uses
  `feed_for`); [leaderboards.md](../leaderboards.md) backlog; [audience-research.md](../audience-research.md)
  plays (Seed Grant, genesis bestiary, essay — leaderboards-before-outreach).

## Pets (LIVE, 2026-07-06)

**The full caretaker loop is on-chain and in the app**: GolPetBonds deployed + smoke-tested
([v3-deployment.md](../v3-deployment.md)); `/pets` page (wards with bond clocks, the reaper's
rounds), 🤲 pet button on `/life/[id]`, Caretakers leaderboard. Multi-tx mint stall FIXED and
confirmed by Henri (long wanderer minted). 99 Cairo + 43 SDK tests.

## Next up

1. Henri's browser pass: /pets, /leaderboards, a pet from the UI.
2. Outreach package (audience-research plays): manifesto essay, genesis bestiary, no-wallet share
   loop, Seed Grant (check SNF conflict-of-interest).
3. Exercise the tiled phase-segment loop mint on-chain; genesis reseed whenever Henri wants.
4. Pre-mainnet checklist: external audit, governance hardening (immutability endgame).
