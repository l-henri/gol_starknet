# Status

> Snapshot of where the project stands. Keep this short and current — rewrite it each session.
> History lives in [LOG.md](LOG.md); the plan lives in [ROADMAP.md](ROADMAP.md).

**Last updated:** 2026-07-06 (evening)
**Framing:** WIP **art piece**, not a commercial product — the outcome is burning gas and creating art.
**Active branch:** `main` (single trunk since the 2026-07-06 consolidation; pushed to origin)
**Build/test:** `scarb build` ✅ · `snforge test` ✅ (91) · `cargo test -p gol-sdk` ✅ (43) · `next build` ✅
**Tx tooling:** all on-chain transactions via **strkd** — pair with `kind:"agent"`; never sncast/raw keys

## Where the product is

- **v3 is the live product line** — the **orbit-canonical identity model**
  ([v3-identity-spec.md](../v3-identity-spec.md)): one id system on- and off-chain, symmetry copies
  revert at mint, witness-assisted minting, permanent escrow-staked `prove_malformed` fraud-proofs,
  drawn state preserved for display, `feed_for` + feeder-in-event ride-alongs. **Live on Sepolia
  since 2026-07-06** with a genesis blinker (its on-chain witness check doubles as the Rust↔Cairo
  convention proof); addresses in [v3-deployment.md](../v3-deployment.md). Collections:
  **"Digital Bacteria"/BACT** (loops) + **"Digital Wanderers"/WNDR** (paths).
- **⚠️ Frontend/SDK write-paths still point at v2** — the repoint (config addresses, witness
  threading through `useMint`, duplicate-mint UX, v3 write-builders + WASM) is the top open item.
- **v2** (and v1) remain deployed but superseded — [v2-deployment.md](../v2-deployment.md); the v2
  symmetry challenge-burn stays live there for its collection.
- **Frontend** (`ui/game-of-life`): garden, `/create` editor, incubator, `/leaderboards` (4 boards,
  data live-verified; ⚠️ page not yet eyeballed in a browser), FR/EN — [frontend.md](../frontend.md).
- **Specs ready to build:** [pet-mechanism-spec.md](../pet-mechanism-spec.md) (targets v3, uses
  `feed_for`); [leaderboards.md](../leaderboards.md) backlog; [audience-research.md](../audience-research.md)
  plays (Seed Grant, genesis bestiary, essay — leaderboards-before-outreach).

## Next up

1. **v3 repoint:** SDK write-builders (witness mints, `prove_malformed`) + WASM; frontend env +
   `useMint` witness threading + duplicate-mint UX; then eyeball /leaderboards in dev.
2. **Pets on v3** (spec ready; `feed_for` is live on-chain).
3. Exercise the tiled phase-segment loop mint on-chain; genesis reseed of notable v2 creatures
   (deferred by Henri — possible any time, v2 stays live).
4. Audience plays once the app points at v3: Seed Grant, bestiary drop, essay.
5. Pre-mainnet checklist: external audit, governance hardening (immutability endgame).
