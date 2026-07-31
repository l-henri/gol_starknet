# Status

> Snapshot of where the project stands. Keep this short and current — rewrite it each session.
> History lives in [LOG.md](LOG.md); the plan lives in [ROADMAP.md](ROADMAP.md).

**Last updated:** 2026-07-31
**Framing:** WIP **art piece**, not a commercial product — the outcome is burning gas and creating art.

**🎉 MAINNET (2026-07-31): the v3 stack is DEPLOYED and LIVE on Starknet mainnet** — six
contracts (fresh 1-NUT Nutrient · LifeformsV3/BACT · LoopMinterV3 · WanderersV3/WNDR ·
WandererMinterV3 · PetBonds) declared + deployed + wired via strkd for ≈ 306 STRK; empty-grid
genesis verified == the SDK's id; `token_uri` (WITH the static `image`) verified via
`starknet_call` on the mainnet node. Every address/class hash/tx in
[mainnet-deployment.md](../mainnet-deployment.md); story in LOG 2026-07-31 (4)+(5).
**But the SITE flip is parked on branch `mainnet` (commit eada201) per Henri — `main` and
production still point at Sepolia** (the flip was pushed, then walked back same-day; LOG (5)).
The `mainnet` branch carries: app `NETWORK="mainnet"`, `onAppChain`/`switchToAppChain` rename,
per-network `REF_TOKEN_ID`, network-neutral copy, rebuilt wasm. `main` keeps the deployment
docs + the SDK's `Network::Mainnet` address book (harmless while `NETWORK="sepolia"`).
First living creature NOT yet minted on mainnet — the deployer holds exactly 1 NUT (one
period-1 escrow). Admin everywhere = strkd agent `gol-mainnet` (`0x0062e08b…2118`).

**Active branch:** `main` — the **petri redesign merged to `main` and deployed to production on
2026-07-24** (Vercel auto-deploy). What shipped: the Garden
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
`main` now carries the petri redesign (fast-forwarded from `new_design`, deployed to production
2026-07-24). ⚠️ It shipped WITHOUT a connected-wallet QA pass — the wallet-signed flows (set-free
mint, hatch, rhythmic breathe/pet) are code-verified + fee-estimated but never clicked through with
a real wallet; verify on the live site. Confirm the Vercel `NEXT_PUBLIC_GOL_RPC_URL` env (proxy vs
direct) is sane for prod.
**Build/test:** `scarb build` ✅ · `snforge test` ✅ (91, +11 ignored benches — v1 `test_minters` removed 2026-07-29) · `cargo test -p gol-sdk` ✅ (43) · `next build` ✅
**2026-07-29:** pre-mainnet irreversibility review done (see LOG); `GolLifeformsV3` now stamps
`minted_at` (`get_minted_at`) and BOTH v3 NFTs stamp `discoverer` (`get_discoverer`, also appended
to the mint events) — 0/zero-address = grandfathered. "Discovered by" is surfaced end-to-end:
token_uri attribute (`token_uri_with_discoverer`), SDK/WASM (`discoverer`/`pathDiscoverer`,
null-tolerant on old classes), `/life/[id]` row. The `GolLifeformsV3` constructor now GENESIS-MINTS
the empty grid to the deployer (nonce 1, escrow 0) — fresh-deploy only (constructors don't run on
upgrades). All uncommitted on `perf/garden-batching`; Sepolia classes NOT yet upgraded (tests:
scarb ✅ · snforge 103 ✅ · sdk 43 ✅ · next build ✅).
**2026-07-31 (feature):** the **shared breath basket** — breathe taps across MULTIPLE creatures
(garden tiles, /pets, /life/[id]) now bundle into ONE multicall tx (per creature:
`move_lifeform_forward_n(n-1)` + `pet`); the per-tx feed cap governs the bundle's sum; route
change discards un-sent taps; per-card feedback only. New `lib/breathBasket.tsx` provider,
BreatheControl rewritten, `useBreathe.ts` deleted. `tsc` ✅ · `next build` ✅; needs a live
wallet click-through (2 creatures, one prompt). See LOG 2026-07-31 (3).
**2026-07-31 (perf):** /pets no longer sweeps the whole dish — the page now filters the pet graph
to the connected wallet, reads all bond clocks via a new batched `bondStatuses` (one JSON-RPC
round-trip; SDK `bond_statuses` on `call_batch`) + `lifeformsBatch`, and renders clocks before
thumbnails hydrate. WASM rebuilt; cargo 43 ✅ · tsc ✅; not yet browser-verified with a bonded
wallet. See LOG 2026-07-31 (2) + sdk-decisions 2026-07-31.
**2026-07-31 (void):** dead loops are feedable in the UI (`voidMode` on BreatheControl:
"Make an offering to the void") — on mainnet the genesis empty grid is the only creature, so
offerings to death are how NUT first enters circulation. The contract never blocked it; the UI
fiction did. See LOG 2026-07-31 (7).
**2026-07-31 (essay):** /why is now the **verbatim copy of docs/purpose.md** (they must not
drift — edit purpose.md first, mirror to the page). Six fixes applied in both: 41x41 (makes the
atoms-in-the-universe claim true), Strandbeest/Theo Jansen, leads/else's/bacteria, “Game of
Life” quotes unified. Henri chose to keep the empty-grid-vs-loop framing and the hyphen dashes.
See LOG 2026-07-31 (6).
**2026-07-31 (copy):** Henri's copy pass applied across `ui/game-of-life` — all user-visible em
dashes removed (comma/colon/period rewrites), `/` thesis now "…and go on living forever", feature
caption "One of the most popular creatures…", `/create` ownership line removed, `/leaderboards`
labels now "Oldest loops"/"Oldest wanderers". Strings only; `tsc --noEmit` clean; uncommitted on
`main`. See LOG 2026-07-31.
**2026-07-31 (link previews):** `/life/[id]` now unfurls per-creature — `generateMetadata` +
`opengraph-image` (1200×630 PNG: current frame in the creature's on-chain palette, zoomed to its
bounding box) on branch `feat/link-previews`, backed by a server-side JSON-RPC batch reader
(`lib/linkPreview.ts`, `owner_of`-gated like the SDK, 120 s cache; sepolia+mainnet address book).
Smoke-tested against live Sepolia tokens (loop/wanderer/beast/garbage); NOT yet merged or
crawler-verified on a deployed URL. See LOG 2026-07-31 (8).
**2026-07-29 (audit):** deep Cairo security audit (`/cairo-auditor`) over all 25 contracts —
**no finding ≥75 confidence**; the live v3 identity/escrow/pet invariants held. Acted on two
low-confidence notes: fixed `pet()` CEI ordering and removed the superseded v1 minter *source*
(`gol_lifeforms`/`gol_loop_minter`/`gol_path_minter` + their test + dead interfaces). Deferred the
escrow-on-token-repoint note (#4) per Henri. `scarb build` ✅ · `snforge test` ✅ (91). Uncommitted
on `main`. See LOG 2026-07-29 (4).
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
  symmetry challenge-burn stays live there for its collection. **The v1 contract _source_ was
  removed from the repo 2026-07-29** (the superseded minter stack; deployed instances untouched) —
  see LOG 2026-07-29 (4).
- **On-chain render (`gol_metadata_v2`, shared by v2 + v3):** `token_uri` now emits a static `image`
  (run-length SVG snapshot of the current generation) alongside the interactive `animation_url`, so
  key-holding wallets — which read only `image` and won't execute the HTML — render a real preview
  instead of a placeholder. A run-count cap (RUN_CAP=16) falls back to a fixed glider emblem so
  token_uri is revert-proof + uniform-cost (**~64–87M L2 for ANY state**, same bench basis as the
  deployed 38.6M). Code-complete on `new_design`. **NOT yet deployed** — and the gating check is a
  real `starknet_call` on the target Sepolia RPC: the budget is a window (38.6M works, ~162M reverts)
  and the image sits at ~64–87M INSIDE it. See [v2-grid-redesign.md](../v2-grid-redesign.md) + LOG
  2026-07-24 (6). How third-party surfaces should render the two fields safely (static `image` vs
  sandboxed `animation_url`) is documented in
  [nft-metadata-rendering.md](../nft-metadata-rendering.md).
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

1. Henri's browser pass: /pets, /leaderboards, a pet from the UI — now including the shared
   breath basket (tap 2+ creatures → ONE wallet prompt → both bonds renewed).
2. Outreach package (audience-research plays): manifesto essay, genesis bestiary, no-wallet share
   loop, Seed Grant (check SNF conflict-of-interest).
3. Exercise the tiled phase-segment loop mint on-chain; genesis reseed whenever Henri wants.
4. Pre-mainnet checklist: external audit, governance hardening (immutability endgame).
5. Ship the `gol_metadata_v2` `image` upgrade: FIRST confirm `token_uri` survives a real
   `starknet_call` on the target Sepolia RPC (budget window 38.6M–162M; image is ~64–87M), tune
   RUN_CAP up if there's headroom, then upgrade the live v2/v3 lifeforms + wanderers classes so
   minted NFTs render in wallets.
