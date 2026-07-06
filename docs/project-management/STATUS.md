# Status

> Snapshot of where the project stands. Keep this short and current — rewrite it each session.
> History lives in [LOG.md](LOG.md); the plan lives in [ROADMAP.md](ROADMAP.md).

**Last updated:** 2026-07-06
**Framing:** WIP **art piece**, not a commercial product — the outcome is burning gas and creating art.
**Active branch:** `experiment/frontend-redesign` (v2 product line; see branch note below)
**Build/test:** `scarb build` ✅ · `snforge test` ✅ (81) · `cargo test -p gol-sdk` ✅ (42) · `next build` ✅
**Tx tooling:** all on-chain transactions via **strkd** — never sncast/raw keys ([development.md](../development.md))

## Where the product is

- **v3 is the live product line** — the **orbit-canonical identity model**
  ([v3-identity-spec.md](../v3-identity-spec.md)): copies revert at mint, witness-assisted minting,
  escrowed fraud-proofs. **Live on Sepolia since 2026-07-06** with a genesis blinker; addresses in
  [v3-deployment.md](../v3-deployment.md). Collections: "Digital Bacteria"/BACT +
  "Digital Wanderers"/WNDR. ⚠️ Frontend/SDK write-paths still point at v2 (repoint pending).
- **v2** remains deployed ([v2-deployment.md](../v2-deployment.md)) and is superseded; v1 (15×15)
  likewise.
- **Path creatures** (transients into a loop, separate NFT + challenge-burn) deployed 2026-07-01
  and live-tested (mint, burn, bounty) — spec: [path-creatures-spec.md](../path-creatures-spec.md).
- **Frontend** (`ui/game-of-life`): v2 app with `/create` editor (high-score register — deliberate),
  feed with per-wallet gas caps, owner render-param tuning, FR/EN — [frontend.md](../frontend.md).
- **SDK**: Rust crate + WASM (`crates/`), lean JSON-RPC stack — [sdk-plan.md](../sdk-plan.md).
- **Known gas facts** (measured): per-gen stepping is pattern-independent but ~5.2× more expensive
  from legacy (Sierra < 1.7.0) wallet account classes —
  [sierra-gas-metering-discrepancy.md](../sierra-gas-metering-discrepancy.md). FEED_CAP=82 sized
  for the legacy worst case. Mint verification re-simulates on-chain; long sequences tile via
  partial paths ([partial-paths-mint-ux.md](../partial-paths-mint-ux.md)).

## In flight (2026-07-03)

- **Symmetry challenge-burn** ([spec](../symmetry-challenge-spec.md)): implemented, 81 tests green,
  and **LIVE on Sepolia since 2026-07-06** (in-place upgrades of both NFT contracts; new class
  hashes + txs in [v2-deployment.md](../v2-deployment.md); admin `MINTER_ROLE` on path NFT
  revoked). **SDK updated same day** (new challenge ABI + `symmetryCanonical`/`findWitness` +
  loop challenge builder; 42 tests). Open: cleanup #3 (old path minter's role on loop NFT) awaits
  sign-off.
- **Leaderboards v1 SHIPPED (code)** — `/leaderboards` page with the four launch boards (longest
  loops, methuselahs, top breathers, weekly discoveries) over client-side event scans; data layer
  live-verified (6 breathers / 24 loops / 9 paths on Sepolia). ⚠️ Page not yet eyeballed in a
  browser.
- **[pet-mechanism-spec.md](../pet-mechanism-spec.md)** — written & parameterized (petting = feeding
  1 gen, 7-day lapse, transferable "daycare" bonds w/ carried clocks, 1-NUT reaper). Implementation
  queued after leaderboards.
- **[audience-research.md](../audience-research.md)** — done: Autoglyphs-lineage positioning,
  CA-community-as-census, Cellula anti-model, leaderboards-before-outreach.
- **[leaderboards.md](../leaderboards.md)** — board catalogue awaiting curation; the indexer is the
  next real build (Henri's order: this is #3).

- **v3 identity model DECIDED** ([v3-identity-spec.md](../v3-identity-spec.md)): orbit-canonical
  token ids — copies revert at mint instead of being burned after. Witness-assisted mint, permanent
  escrow-staked fraud-proofs, fresh v3 collections + curated genesis reseed. **Spec §3
  (sequencing, naming, genesis owners, ride-alongs) is PROVISIONAL — awaiting Henri.**

## Next up (Henri's order: 4 → 1 → 3 → 2, now extended by v3)

1. **(#1 tail)** Launch strkd → declare + upgrade both NFT contracts on Sepolia; record class
   hashes in v2-deployment.md; revoke the path-NFT admin `MINTER_ROLE`; SDK challenge updates.
2. **(#3)** Pick the first four leaderboards; scope + build the indexer.
3. **(#2)** Repo consolidation (merge plan for the local branches) + backfill LOG for
   2026-06-17 → 07-01.
4. Pet mechanism implementation (spec ready).
5. Pre-mainnet checklist unchanged: external audit, governance hardening (immutability is the
   stated endgame, deliberately deferred).

## Branch note

**Consolidated 2026-07-06:** `main` is the single trunk — `experiment/frontend-redesign` fully
merged (contracts, SDK, frontend, docs; post-merge green: 81 Cairo + 42 SDK tests, `next build`).
`backup/experiment` is an archive. **Nothing pushed** — pushing `main`/branches (and any Vercel
implications) is Henri's call. LOG backfilled for the 2026-06-17→07-02 gap.
