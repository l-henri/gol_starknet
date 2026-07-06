# Work log

> Append-only history, **newest first**. One entry per work session. Never rewrite past
> entries — correct course in a new entry. See [README.md](README.md) for the process.

## Entry template (copy this)

```
## YYYY-MM-DD — <short title>
- **Goal:** what this session set out to do
- **Branch:** <branch> · **Commits:** <hashes or "uncommitted WIP">
- **Changed:** the substantive changes
- **Verified:** what you actually ran (build/test results) — be precise about what is NOT verified
- **Decisions:** notable choices and why
- **Next:** the handoff — what the next session should do first
- **Blockers:** anything stopping progress, and who/what unblocks it
```

---

## 2026-07-06 (later still) — Pet UI shipped: wards, clocks, the reaper's rounds
- **Goal:** the client side of the caretaker layer ("go ahead on the pet UI"). Also: Henri
  confirmed the multi-tx stall fix — **the long wanderer mint worked**.
- **Branch:** `main` · **Commits:** (this one) · pushed
- **Changed:**
  - SDK: `pets` address in the book, `RpcReader::bond_status` (held/last_pet/reapable in one
    shot), `pet_pairs()` event scan (the caretaker graph), `pet`/`reap`/`transfer_bond` builders;
    WASM `petCall`/`reapCall`/`transferBondCall`/`petPairs`/`bondStatus`.
  - `/life/[id]`: 🤲 pet button (adopt/pet, one ceremonial breath) + the bond clock ("X days
    before it wilts" / "your bond has wilted — anyone can reap it").
  - **`/pets`** ("Mes protégés / My wards"): your bonded creatures with clocks + pet actions, and
    the reaper's rounds (all wilted bonds, reap = 1 NUT). Header nav link.
  - `/leaderboards`: **Caretakers** board (active bonds per holder).
- **Verified:** 43 SDK tests; `next build`; live probe reads the real caretaker graph (the
  agent's genesis bond: held, clock stamped, not reapable). ⚠️ Pages not yet eyeballed in a
  browser (same caveat as /leaderboards).
- **Next:** Henri's browser pass (/pets, /leaderboards, a pet from the UI); then the outreach
  package (essay, bestiary, share loop, Seed Grant).
- **Blockers:** none.

## 2026-07-06 (late) — GolPetBonds built + tested; deploy queued on strkd unlock
- **Goal:** the pet/caretaker layer per pet-mechanism-spec.md, against v3 ("go do the pet contracts").
- **Branch:** `main` · **Commits:** f7888af · pushed
- **Changed:** `src/gol_pet_bonds.cairo` (ERC-1155 caretaker bonds; pet = one ceremonial feed via
  `move_lifeform_forward_n_for` with NUT to the petter; 7-day lapse; permissionless reaper minted
  1 NUT from nothing; daycare `transfer_bond` with the clock riding along — invariants in the
  ERC-1155 hook so raw transfers obey them too; orphaned bonds age out naturally) +
  `IGolPetBonds` + 8 integration tests.
- **Verified:** full suite **99 Cairo tests green** (91 + 8). **DEPLOYED to Sepolia after Henri's
  unlock**: GolPetBonds `0x59878490…6e337` (class `0x7b82f4fc…cb1a2`), NUT MINTER granted, and a
  live smoke test — the agent petted the genesis blinker (bond 1, clock stamped, creature aged).
  Details in [v3-deployment.md](../v3-deployment.md).
- **Next:** SDK/WASM pet bindings + the garden/pet UI (loss-aversion clocks, reaper feed);
  caretakers leaderboard; Henri's validation pass (stall fix, /leaderboards, long-wanderer resume).
- **Blockers:** none.

## 2026-07-06 (night) — First real v3 usage: two UX bugs found by Henri, fixed
- **Goal:** Henri minted loops + a path on v3 (works), then hit: (1) long-wanderer multi-tx mints
  stall after 1-2 txs (/create AND incubator resume); (2) spawning one of two discoveries loses
  the other on redirect.
- **Branch:** `main` · **Commits:** (this one) · pushed
- **Diagnosis (1):** live probe with the app's exact starknet.js against the app's RPC shows fresh
  txs go PRE_CONFIRMED → ACCEPTED_ON_L2 in ~3s — the acceptance poll is innocent. The stall is the
  NEXT wallet request: Ready silently drops a programmatic `wallet_addInvokeTransaction` that
  doesn't originate from a user gesture; the execute() promise never settles.
- **Fix (1):** useMint watchdogs each wallet request (25s) → "wallet showing nothing? re-request
  step k/N" button in /create + incubator, re-firing the SAME step from the click
  (first-settle-wins, late duplicates harmless). Progress persisted at step start.
- **Fix (2):** the confirmed-redirect bookmarks the un-spawned sibling discovery into the
  incubator before leaving.
- **Verified:** next build green; ⚠️ the stall fix needs Henri's retry of the long wanderer mint
  (wallet-side behavior can't be driven headlessly). His partial progress resumes.
- **Next:** Henri retries the long mint; pets on v3; tiled phase-segment mint on-chain.
- **Blockers:** none.

## 2026-07-06 (evening) — SDK + frontend repointed to v3; the app speaks orbit ids
- **Goal:** close the v3 gap ("go"): write-builders, WASM, frontend id derivation.
- **Branch:** `main` · **Commits:** 373e287 · pushed
- **Changed:** v3 address book (NUT keeps its own deploy block so breathing history spans
  collection versions — top breathers survived the reset); mint builders compute the orbit
  canonical + witness internally (callers pass drawn rows, drawn orientation preserved);
  `prove_malformed_{loop,wanderer}` + `breathe_life_for` builders; `plan_loop_mint` chunks a
  phase segment when the witness phase exceeds one tx; WASM `familyTokenId` /
  `proveMalformed*Call` / `breatheLifeForCall`; every UI mint-facing id derivation switched to
  `familyTokenId` (the existing already-minted check thereby becomes the duplicate-family check);
  renderer template ref token → the v3 genesis blinker.
- **Verified:** 91 Cairo + 43 SDK tests; `next build`; live board probe reads v3 (1 genesis loop)
  AND the cross-version breather history (6 breathers, top 830). ⚠️ Not yet exercised: a real v3
  mint from the UI (manual click-through), the tiled phase-segment flow on-chain, /leaderboards
  eyeballing.
- **Next:** manual click-through of /create → v3 mint on Sepolia; pets on v3; genesis reseed
  whenever Henri wants it.
- **Blockers:** none.

## 2026-07-06 (later) — v3 BUILT AND LIVE: orbit-canonical identity on Sepolia
- **Goal:** execute the approved v3-identity-spec end to end (Henri: "untrack the pdf, push, do v3").
- **Branch:** `main` · **Commits:** b58a140 (+ this docs commit) · pushed to origin
- **Changed:**
  - **Contracts:** `GolLifeformsV3` (BACT) + `GolWanderersV3` (WNDR) + two witness-assisted
    minters. Witness mint (family membership verified, one transform, anchored on the walk's
    time-lex-min), drawn state preserved for display, per-token mint escrow, `prove_malformed`
    on both, `feed_for` + feeder-in-event ride-alongs, sub-path challenge carried to Wanderers.
    **91 Cairo tests green** (10 new: witness mints, copy-collision reverts, fraud proofs both
    directions, feed_for, sub-path regression).
  - **SDK:** `grid::loop_family_canonical` (orbit × phase min returning the contract-matching
    witness); `v3_seed` example emits genesis calldata. 43 SDK tests green.
  - **Deployed to Sepolia** (addresses/classes/txs in [v3-deployment.md](../v3-deployment.md)):
    4 declares, 4 UDC deploys, one wiring multicall, genesis blinker seeded with its TRUE orbit
    canonical — **the on-chain witness check passing is the Rust↔Cairo convention proof.**
- **Verified:** owner/escrow(2 NUT)/canonical/nonce read back correctly; suites green.
- **Findings:** declare fee BOUNDS (~156 STRK) exceeded the agent's balance though actuals are
  ~50 — funded +300 STRK; `companion_requestFunding` is sign-only by default (`submit:true`
  needed) and always prompts. strkd was locked at first attempt (operator unlock).
- **Next:** SDK v3 write-builders + WASM; frontend repoint (env, witness through useMint,
  duplicate-mint UX); exercise the tiled phase-segment mint on-chain; then pets on v3.
- **Blockers:** none.

## 2026-07-06 — Symmetry challenge-burn LIVE on Sepolia (in-place upgrades via strkd)
- **Goal:** finish spec item #1 — declare + upgrade both NFT contracts with the symmetry mechanism.
- **Branch:** `experiment/frontend-redesign` · **Commits:** uncommitted WIP (contracts committed
  state unchanged since 07-03 session; deploy artifacts from current build)
- **Changed (on-chain, Sepolia):** declared `GolLifeformsV2` class `0x38b639…f326f` and
  `GolPathLifeformsV2` class `0x3db4bc…80700`; one multicall upgraded both live contracts in place
  and revoked the admin's leftover `MINTER_ROLE` on the path NFT (cleanup #1). Old classes remain
  declared (revertible). Details + tx hashes in [v2-deployment.md](../v2-deployment.md).
- **Verified:** `getClassHashAt` matches both new classes; `get_mint_nonce(seeded blinker) = 0`
  (grandfathered tier); `has_role(MINTER, admin)` on path NFT = 0. Cleanup #3 (old path minter's
  role on loop lifeforms) deliberately NOT executed — optional, needs Henri's sign-off.
- **Decisions / findings:** strkd pairing identity is **(name, kind)** — a 3-day blocker traced to
  pairing without `kind:"agent"` silently creating a parallel app-kind client (`-32002`, no
  prompt). Reported upstream via `companion_reportIssue` (prefilled GitHub issue handed to Henri).
  Node quirk: this RPC node wants raw (uncompressed) `sierra_program` in declares.
- **Same day — SDK symmetry support + leaderboards v1 (Henri: "fix the SDK, then leaderboards"):**
  - SDK (`gol-sdk`): `grid::{apply_d4, translate, apply_symmetry, symmetry_canonical, find_witness}`
    (d4 table mirrors the Cairo consensus-critical convention; equivariance + group tests);
    `writes::challenge_burn` updated to the new path ABI (+d4/dr/dc) and `challenge_burn_loop`
    added; event scanner gains `feed_rewards()` (top-breathers aggregation from NUT faucet mints,
    initial-supply mint excluded by size guard) and `recent_{path_}mints_with_blocks()`.
    **42 tests green.** WASM: `challengeBurnCall` (new signature), `challengeBurnLoopCall`,
    `symmetryCanonical`, `findWitness`, `topBreathers`, `recentMints`, `recentPathMints`.
  - Frontend: **`/leaderboards`** page (FR/EN) — the four launch boards from
    [leaderboards.md](../leaderboards.md): longest loops, methuselahs (length ÷ seed cells), top
    breathers, discoveries of the week (block-window ≈ 20k blocks). Header nav link; `.board` CSS.
    `next build` green.
  - **Live-verified the data layer** (`examples/board_probe.rs` against Sepolia): 6 breathers (top
    830 generations), 24 loop mints, 9 path mints — the boards have real content. The page itself
    is ⚠️ not yet eyeballed in a browser (`npm run dev` → /leaderboards).
- **Same day — v3 identity decided (Henri's proposal) + spec written.** Henri asked the right
  question: if the orbit key is universal and 0.75 ms to derive, why keep two id systems? Answer:
  don't. **`docs/v3-identity-spec.md`**: `token_id = Poseidon(orbit canonical)`, witness-assisted
  mint (family membership verified exactly, one transform), optimistic **minimality** with
  permanent escrow-staked fraud-proofs, drawn state stored for display, sub-path challenge kept,
  loop symmetry challenge not carried into v3 (copies revert at mint). Locked (interview round 1):
  escrow-staked proofs, permanent window, **fresh v3 + curated genesis reseed**. Round 2 went
  unanswered (AFK) — sequencing (consolidate→v3→pets), naming (drop version markers), genesis to
  original owners, ride-alongs (feeder-in-event + `feed_for`) are **PROVISIONAL in spec §3**.
  Supersedes-notes added to symmetry-challenge-spec.md and v2-grid-redesign.md §5.
- **Same day — v3 spec APPROVED in full + repo consolidated.** Henri settled §3: sequencing
  consolidate→v3→pets; genesis reseed deferred ("don't yet"); paths renamed **"Digital Wanderers"
  / `WNDR`** (his pick over Comets/Spores); ride-alongs = both (feeder-in-event + `feed_for`).
  Consolidation executed: session work committed in four logical commits (contracts / SDK / UI /
  docs), **`experiment/frontend-redesign` merged into `main`** (its three stray cherry-picked
  commits were content duplicates; resolved preferring the branch) — `main` is now the single
  trunk, verified green post-merge (81 Cairo + 42 SDK tests, `next build`). Not pushed — remotes
  and Vercel wiring are Henri's call. **This log backfilled** for 2026-06-17→07-02 (see notice
  below). Stray untracked `docs/starknet-metering-census.pdf` left for Henri to place.
- **Next:** build v3 (contracts per v3-identity-spec.md, incl. both ride-alongs) → deploy fresh
  collections → pets on v3. Also: eyeball /leaderboards in dev; v2 cleanup #3 now moot (v2
  superseded by v3 shortly).
- **Blockers:** none.

## 2026-07-03 — First-principles review; symmetry-burn + leaderboard docs; doc discipline restored
- **Goal:** review the project's reasoning trajectory against the original ask (docs, not code),
  then act on Henri's responses.
- **Branch:** `experiment/frontend-redesign` · **Commits:** uncommitted WIP (docs only)
- **Changed:**
  - Review delivered. Reframings from Henri: the project is a **WIP art piece** ("burning gas and
    creating art"); proving is deliberately sequenced *after* v1 (accessibility first, proving for
    enthusiasts later — the TUI's purpose); users pay their own gas (no paymaster); immutability is
    aspirational, later; the casino `/create` was user-research-driven (the main user is an
    8-year-old high-score hunter), leaderboards next.
  - **`CLAUDE.md` created** (repo root): session-end doc-consistency rules — LOG entry, STATUS
    rewrite, spec reversals recorded in the spec they reverse. (This log had silently stopped on
    2026-06-17 while v2 shipped.)
  - **`docs/symmetry-challenge-spec.md`** (interview-derived): witness-based challenge-burn for
    translation/rotation/reflection copies, unified with the sub-path rule (`(g, k)` witness),
    loops via in-place upgrade, loop bounty minted from nothing, **mint nonce replaces the
    timestamp direction guard** (superseded-note added to `path-creatures-spec.md`),
    grandfathered tokens = nonce 0, strict no-diptych-exemption.
  - **`docs/leaderboards.md`**: ~20-board catalogue; key finding: no contract changes required
    (states on-chain + Life deterministic ⇒ all pattern metrics are indexer compute); two optional
    event/nonce deltas; recommend leaderboards = the indexer project's first product.
  - Pet/ERC1155 parameters pinned by interview: petting **is** feeding, 1 generation per pet
    (ceremonial), 7-day lapse, permissionless reaper rewarded with NUT minted from nothing
    (amount TBD in the pet spec — proposed 1 NUT). Pet spec itself not yet written.
  - Audience research completed → **`docs/audience-research.md`** (19 verified claims; synthesis:
    position as Autoglyphs-lineage on-chain art; primary = fully-on-chain genart collectors,
    secondary = ConwayLife/CA enthusiasts approached as a discovery census, kids/education later;
    stay on Starknet + market chain-agnostically; Cellula = anti-model; Seed Grant + genesis
    bestiary + manifesto essay + leaderboards-before-outreach as concrete plays).
- **Verified:** docs only; no build/test run.
- **Decisions:** see the spec's "Decisions locked" table and the review memory.
- **Later same session:** Henri set the order 4→1→3→2. **`docs/pet-mechanism-spec.md` written**
  (final interview: reap reward 1 NUT flat; bonds **transferable** — "daycare" use case — with the
  clock carried per (creature, holder) on transfer and max 1 bond/holder/creature to close the
  self-transfer dodge; orphaned bonds lapse naturally). Henri approved the symmetry spec **as
  drafted** → implementation started.
- **Symmetry mechanism IMPLEMENTED** (same session, spec approved as drafted):
  - `gol_grid_v2`: `apply_d4` (8-element table, inverse-mapped per-cell copy), `translate`
    (row re-index + u128 bit rotation), `apply_symmetry` = translate ∘ d4. The d4 index table is
    consensus-critical (SDK must match).
  - `GolLifeformsV2`: `next_nonce`/`mint_nonce` storage (new maps only — in-place-upgrade-safe;
    unwritten = 0 = grandfathered tier), nonce stamped in `mint`, new `challenge_burn(a, b,
    a_state, d4, dr, dc, k)` — preimage pinned by hash, equal-period + `k < period` asserts,
    bounty = `b.sequence_length` NUT **minted from nothing**, `ChallengeBurned` event.
  - `GolPathLifeformsV2`: same nonce plumbing; `challenge_burn` generalized with the
    `(d4, dr, dc)` witness (`k` = length gap; identity keeps the strictly-longer + same-target
    rules; escrow bounty unchanged); **nonce replaces `minted_at` as the direction guard**.
  - Inline verification only for now (fine to ~450 steps at 41×41); tiled-`k` challenges via the
    partial-path registry remain a follow-up (spec §4.2).
- **Verified:** `scarb build` ✅; `snforge test` ✅ **81 passed, 0 failed** — new: d4 group
  properties, translation wrap/composition, step∘g equivariance (all 8 elements), loop copy burn
  with minted bounty (+ nonce getter), newer-cannot-burn, non-copy refused, path rot90+translate
  copy burn (escrow paid, target pre-filter skipped), stepped-symmetry copy burn, equal-length
  identity-witness refused; legacy sub-path tests pass under the nonce guard.
- **Next:** **Sepolia declare + upgrade of both NFT contracts — BLOCKED on strkd (companion not
  running)**; also revoke the leftover admin `MINTER_ROLE` on the path NFT during that deploy, and
  update the SDK challenge_burn signature + `symmetryCanonical`/`planChallenge`. Then
  leaderboards/indexer (#3); then repo consolidation + log backfill 2026-06-17 → 07-01 (#2).
- **Blockers:** none.

- **Goal:** get the *real* on-chain and off-chain (SNIP-36) generation ceilings for the optimized
  `step_grid`, on testnet, via strkd (signing) + dinner (proving) — no sncast, no self-run prover.
- **Results:**
  - **On-chain: 321 gens** (old 170; **1.89×**). `estimateFee` binary search → n=321 @1.198e9 L2
    gas (cap 1.2e9), n=322 over. **Confirmed by real broadcast** `move_forward_in_place(321)` — tx
    `0x5307febe27d888a3da21e52caafa3f7e505c119deacd43ba2af54aab8262c87`, SUCCEEDED, **actual L2 gas
    1,089,490,115**, 8.72 STRK, `get_age` 0→321. (Old 170 used 1.085e9 gas → ~same gas, ~1.9× gens.)
  - **Off-chain (SNIP-36, local dinner/stwo): 89 gens** (old 43; **2.07×**). Binary search via dinner
    `POST /v1/prove`: n=89 proves (~406 KB proof, proof_facts len 9), **n=90 → `Not enough twiddles!`**
    (the build's trace/twiddle cap). Both ceilings ~2× — matches the ~47%-cheaper-per-gen step.
- **Contract:** optimized `GolBench` class `0x41268542f2ed071e93bd85f25c9008fcf772086674690781a46974cda74b0da`
  (Sierra 1.8.0) was already declared; deployed a fresh instance at
  `0x05f62daf5d63c1c6c310247d2155dcc52fa4328ff7bd8ec4ace6f40f8fa3ec5` (glider seed) via UDC through strkd.
- **Tooling:** strkd signed everything (sign-only for the virtual prove txs; submit:true for deploy +
  the 321 broadcast); **dinner** (local proving companion, `:9909`, native backend) produced the
  proofs. RPC went through a **local reverse proxy** (`127.0.0.1:8651`→sepolia, `:8652`→mainnet) that
  injects the `X-SNF-Nodes-Key` bypass header (the SNF nodes rate-limit heavy proof state-fetches);
  key kept in a `/tmp` chmod-600 file, never logged/committed. dinner + strkd point their RPC at it.
- **The "declare blocker" was self-inflicted (3 wrong theories, all wrong), root-caused to:**
  (a) `compiled_class_hash` computed with the frontend's stale starknet.js **v7.6.4** (wrong algo →
  `0x7eec8e15…`; v10 → correct `0x581b62…`); (b) class hash needs the **canonical abi serialization**
  (`formatSpaces`, not `JSON.stringify`) or the node derives a different class_hash → "invalid
  signature". **Sierra 1.8.0 / Cairo 2.18 declares fine on the SNF nodes** — no toolchain change.
- **Verified:** strkd sign+submit works on the current network (test 0-STRK self-transfer
  `0x7d7f2e6c…` succeeded); proxy forwards both networks with the key (logs method/path/status only).
- **Next:** tear down the temp proxy + revert dinner/strkd RPC when done; resume the mainnet track
  (frontend smoke test → security review incl. the `step_grid` rewrite + partial-path change). The
  off-chain 89 < on-chain 321 is the *local* prover's trace cap, not a SNIP-36 limit — a bigger
  prover build raises it.
- **Blockers:** none.

---

> **Backfill notice (written 2026-07-06):** the entries from 2026-06-17/18 through 2026-07-02 below
> were reconstructed after the fact from git history and the topic docs — the log had lapsed during
> that stretch (see the 07-03 entry). Details live in the linked docs; these entries restore the
> narrative, not the full session-level detail.

## 2026-07-02 (backfilled) — Path creatures shipped: contracts, SDK, frontend, Sepolia
- **Goal:** mint transients-into-a-loop as their own collection with anti-farm burning.
- **Commits:** ddb14d0 · **Docs:** [path-creatures-spec.md](../path-creatures-spec.md), [v2-deployment.md](../v2-deployment.md)
- **Changed:** interview-derived spec (identity = hash(start), alive/frozen/dead, escrowed mint,
  timestamp-guarded `challenge_burn`); new `GolPathLifeformsV2` + repointed minter; SDK readers/
  planners; `/create` path spawn + `/life` path view. **Deployed 2026-07-01** and live-tested
  (frozen L-tromino mint; a challenge-burn paying its 1-NUT bounty).

## 2026-06-30 (backfilled) — Sierra-gas metering root cause; per-wallet caps; Vercel build
- **Goal:** explain the ~5× per-account feed-cost discrepancy.
- **Commits:** 42fe8de, 5ee14a9, e89e181 · **Doc:** [sierra-gas-metering-discrepancy.md](../sierra-gas-metering-discrepancy.md)
- **Found & source-confirmed:** the sender account class's **Sierra version selects the metering
  mode** (≥1.7.0 → Sierra-gas; older → legacy Cairo-steps, ~5.2× for compute), inherited down the
  call stack (sticky downgrade, confirmed in blockifier source). Shipped per-wallet tier detection
  + gas caps (`gasCaps.ts`), the self-contained Vercel build, and the incubator page.

## 2026-06-29 (backfilled) — Real gas measured; partial-paths mint UX spec
- **Goal:** stop the silent feed/mint reverts with measured numbers.
- **Commits:** 514236a · **Doc:** [partial-paths-mint-ux.md](../partial-paths-mint-ux.md)
- **Measured (receipts, not estimateFee):** 2.7–13.9M gas/gen state-dependent; `estimateFee` 4.7×
  under on active creatures → FEED_CAP=82, CHUNK≈60, ≤8-tx mint ceiling, preconfirmed waits,
  incubator + bookmarks spec'd. Frontend docs rewritten for the as-built app.

## 2026-06-24→26 (backfilled) — v2 frontend built out; the register shifts to high scores
- **Commits:** 47c1abf, d8a005d, af4c9cd, ba9cd4f, b0a4968, 6edd875, 4af50b9, f90727c, b4471da
- **Changed:** gallery wired to live v2; faithful local on-chain render + progressive loading;
  batch feed (`move_lifeform_forward_n`, contracts + SDK — later cherry-picked to main as
  b652d45/07b357a/5a2fa02, causing the divergence resolved in today's merge); `/create` became the
  slot-machine score + full FR/EN; the "waiting to be discovered" bestiary section removed.
- **Decision (recorded belatedly):** the register change away from the signed-off contemplative
  design was **user-research-driven** — the project's most engaged user (8, hunts high scores).

## 2026-06-22 (backfilled) — v2 LIVE on Sepolia; token_uri fixed in place
- **Doc:** [v2-deployment.md](../v2-deployment.md)
- Fresh v2 collection deployed via strkd (NUT, lifeforms, both minters, wiring, seeded blinker).
  `token_uri` Out-of-gas fixed same day: 3.3× render-gas cut + raw-JSON URI, in-place upgrade.

## 2026-06-19 (backfilled) — v2 grid implemented (41×41 bitboard); branch reorg
- **Commits:** 132e832, 9f6a1b3 (frontend experiment starts) · **Doc:** [v2-grid-redesign.md](../v2-grid-redesign.md)
- 41×41 / 7-felt `GridState`, SWAR bitboard stepper (~2.6M gas/gen — ~250× naive), Poseidon ids,
  Art-Blocks-style `animation_url` renderer; deep cairo-auditor pass (P0 refuted with a PoC).
  Repo reorg: `main` fast-forwarded to the perf line (hdp removed); redesign parked experimental.

## 2026-06-17/18 (backfilled) — Rust SDK: plan, decisions, crates, live-verified reads
- **Docs:** [sdk-plan.md](../sdk-plan.md), [sdk-decisions.md](../sdk-decisions.md)
- One Rust crate (`gol-sdk`) + WASM bindings; three trait seams; lean hand-rolled JSON-RPC instead
  of starknet-rs+cainome (divergences logged); reads verified against the live deployment.

## 2026-06-17 (resolved) — The "declare blocker" was a stale starknet.js hasher, not a toolchain gate
- **Goal:** find the Cairo/scarb version matching the network's CASM (per the entry below).
- **Resolution — there is no version to find; scarb 2.18 is correct.** The whole "compiled_class_hash
  mismatch" was an artifact of computing the hash with the **frontend's pinned starknet.js v7.6.4**,
  which uses the *old* `compiled_class_hash` algorithm. On the *same* scarb-2.18 CASM:
  - starknet.js v7.6.4 → `0x7eec8e15…` (wrong)
  - starknet.js v10.0.2 → `0x581b62…` (correct) — **matches the network exactly** (Cartridge +
    Alchemy both expect `0x581b62…`).
  - class_hash is unaffected (`0x41268542…` in both versions).
- **Confirmed declarable:** `estimateFee` (SKIP_VALIDATE) of the DECLARE with the correct hash
  `0x581b62…` via Cartridge Sepolia returns a clean fee (~5.7 STRK, l2_gas ~712M) — no mismatch.
  So the optimized `GolBench` declares as-is. **No toolchain bump, no rebuild, no mainnet gate.**
- **Lesson:** compute `compiled_class_hash` with starknet.js ≥ v9 (used a temp `npm i starknet@latest`
  in /tmp). The frontend's v7.6.4 silently returns a stale-algorithm hash. The 06-17 entries below
  (single-node lag → broader compiler/toolchain mismatch) were both wrong root causes chasing this
  hashing artifact — superseded by this entry.
- **Remaining real wrinkle (minor):** strkd's configured Sepolia node (`0.10.3-rc.0`) still can't
  *compile* Sierra 1.8.0 (compiler 1.7.0), so the **declare** must route through a 1.8.0-capable node
  (Cartridge): strkd sign-only + broadcast there. Deploys/invokes/estimates work on any node.
- **Next:** declare (correct hash, strkd sign-only → Cartridge) → deploy `GolBench` (constructor =
  glider) → `estimateFee` sweep `move_forward_in_place(n)` for the real on-chain ceiling (free; the
  snforge-calibrated estimate is ~350) → optional confirmation broadcast. Est. spend: declare+deploy
  ≈ 6 STRK (bench acct holds 36).
- **Blockers:** none — pending the maintainer's OK to spend ~6 STRK on the declare+deploy.

---

## 2026-06-17 (later) — Multi-node probe: compiler mismatch is broader; likely a toolchain gate
- **Goal:** probe the mainnet node(s) for Sierra 1.8.0 declare support (the morning's mainnet probe
  was rate-limited), using the canonical nodes + an Alchemy mainnet fallback.
- **Findings (supersede the "transient single-node lag" read in the entry below):**
  - **Alchemy mainnet** (`0.10.3-rc.0`): compiles Sierra 1.8.0, but expects `compiled_class_hash`
    **`0x581b62…`** while our scarb 2.18 build is **`0x7eec8e15…`** → mismatch.
  - **Cartridge Sepolia** (`0.9.0`, probed earlier) expects the **same `0x581b62…`**. Two
    independent nodes converging on the same non-scarb-2.18 hash ⇒ our local CASM is out of step
    with the **current network compiler**, not just one lagging node.
  - **strkd's Sepolia node** (`0.10.3-rc.0`) is the *opposite* problem — its compiler is too old to
    compile 1.8.0 at all (1.7.0). So the node fleet is in a mixed/transitional compiler state.
  - The live classes (declared 06-09 with scarb 2.18) matched the network compiler **then**, so a
    network compiler bump since has likely left pinned Cairo 2.18 behind.
  - Official mainnet node (`mainnet.nodes.starknet.org/rpc/v0_10`) still rate-limited (-32005) —
    couldn't confirm whether it matches Alchemy; assume it does pending a clean probe.
- **Revised conclusion:** the declare blocker is a **Sierra/CASM compiler-version mismatch between
  local scarb 2.18 and the current network**, surfaced two ways across nodes. **Not** a strkd bug
  (faithful relay) and **not** fixable by node choice alone — a node update would still mismatch our
  CASM. **This is a mainnet gate:** declaring any contract needs the local Cairo/scarb realigned to
  the network's current compiler.
- **Verified:** Alchemy mainnet Actual `0x7eec8e15…` / Expected `0x581b62…`; Cartridge Expected
  identical `0x581b62…`. Read-only `estimateFee` + `SKIP_VALIDATE`; no spend.
- **Next (maintainer):** identify the Cairo/`starknet-sierra-compile` version the current
  Sepolia/mainnet sequencer expects; bump `.tool-versions` to match; `scarb build` + `snforge test`
  (all class hashes will change); then retry the declare + on-chain ceiling measurement via strkd.
  Until then the **~350-gen estimate stands**.
- **Blockers:** toolchain↔network compiler alignment (maintainer/infra decision).

---

## 2026-06-17 — Correct the declare-blocker diagnosis (node Sierra compiler, not CASM skew)
- **Goal:** with the canonical node URLs in hand (`sepolia.nodes.starknet.org/rpc/v0_10`,
  `mainnet.nodes.starknet.org/rpc/v0_10` — the nodes strkd uses), pin down whether the
  06-16 declare failure was strkd, the RPC, or our toolchain.
- **Finding — it is the node's Sierra→CASM compiler, lagging at 1.7.0.** Hitting the *same* node
  strkd uses, directly (starknet.js `estimateFee` + `SKIP_VALIDATE` on the DECLARE), reproduces the
  exact strkd error: `Cannot compile Sierra version 1.8.0 with the current compiler (sierra version:
  1.7.0)`. So: **not strkd** (faithful relay), and **not our toolchain** — the deployed GolBench
  (06-09) and GolLifeforms (06-08) classes are already **Sierra 1.8.0** on-chain (confirmed via
  `getClassAt`), and scarb 2.18 (pinned == installed) emits 1.8.0. The node is on spec
  `0.10.3-rc.0`; its bundled `starknet-sierra-compile` is simply behind (1.7.0), so it rejects *new*
  1.8.0 declares at the RPC layer even though the sequencer accepted 1.8.0 eight days ago.
- **Correction:** the 2026-06-16 entry below blamed "CASM-compiler skew" + a Cartridge
  `compiled_class_hash` mismatch. That was a **red herring** — I had tested against the Cartridge
  node (`api.cartridge.gg`, spec 0.9.0), which is NOT the node strkd uses. Discard that root cause;
  the real cause is the node's outdated Sierra compiler. The ~350-gen estimate is unaffected.
- **Verified:** sepolia v0_10 node spec = 0.10.3-rc.0; declare estimate there → 1.7.0-compiler
  error; `getClassAt` on both live contracts → Sierra 1.8.0. Mainnet v0_10 probe was rate-limited
  (-32005), not completed.
- **Next:** (1) retry the declare + on-chain ceiling measurement once the node's compiler is ≥1.8.0
  (likely after the RC promotes to stable) — no code change needed. (2) **Before mainnet**, confirm
  `mainnet.nodes.starknet.org/rpc/v0_10` can compile Sierra 1.8.0 (the rate-limited probe left this
  open) — if it's also at 1.7.0, the mainnet declare/deploy is gated on the same node update.
- **Blockers:** node-side Sierra compiler version (operator/infra; expected transient).

---

## 2026-06-16 — Re-measure the post-perf on-chain ceiling (estimate done; on-chain confirm blocked)
- **Goal:** get a current on-chain generation ceiling for `move_forward_in_place`, since the
  documented 170 predates the −39% `step_grid` pass. Drive it through strkd per the new tx policy.
- **Branch:** `perf/step-grid-modulo-removal`. No product code changed (measurement + docs only).
- **Result — estimated new hard ceiling ≈ 350 gens** (~2× the old 170); **≥270 directly confirmed**
  by the passing in-suite benchmark (`bench_in_place_270_gens` = 933,065,263 snforge L2 gas ≈ 920M
  on-chain, under the 1.2e9/tx cap). *Method:* the new in-place benchmarks are exactly linear in n
  (marginal **3,361,365** L2 gas/gen, fixed overhead ~25.5M, snforge). The modulo pass only touches
  per-gen `step_grid`, so old marginal = new + (151,994,713 − 92,723,913)/20 = **6,324,905**/gen
  (1.88× the new). snforge→on-chain calibrates at **×0.986** against the old code's real 170-gen
  broadcast (1,085,322,855 actual L2 gas). Cap 1.2e9 ⇒ n ≈ **354**.
- **Blocked — on-chain confirmation.** Could not (re)declare the optimized `GolBench` (class
  `0x41268542…b0da`, compiled `0x7eec8e15…142d`, **Sierra 1.8.0**) on Sepolia:
  - strkd's configured RPC node: `node error … Cannot compile Sierra version 1.8.0 with the current
    compiler (sierra version: 1.7.0)` — its compiler is too old to declare our class at all.
  - Cartridge node (`api.cartridge.gg/x/starknet/sepolia`, spec 0.9.0): compiles 1.8.0 but to a
    *different* CASM → `Mismatch compiled class hash … Expected 0x581b62…` vs our `0x7eec8e15…`.
  - Root cause = CASM-compiler skew between local scarb 2.18 and the currently-available Sepolia
    nodes. Verified it's not a stale artifact (clean rebuild → same hashes) and not local toolchain
    drift (installed scarb == pinned 2.18.0, emits Sierra 1.8.0). The 06-08/09 production declares
    succeeded because sncast then used a node compatible with scarb 2.18's CASM. **Did not** force
    it via an arbitrary public RPC or a fudged compiled hash.
- **Verified:** strkd paired + auth OK; balance read (bench acct `0x026d87…e70f` = 36.30 STRK, so
  funding not needed); declare correctly rejected at fee-estimation (no spend). `snforge test` = 35
  passed. starknet.js v7.6.4 (from the frontend) used for hashing/estimation.
- **Next / decision needed (maintainer):** to get the *confirmed* on-chain ceiling, either (a) point
  strkd's RPC at the node used for the 06-09 declares (scarb-2.18-CASM-compatible), or tell me that
  URL and I'll strkd-sign-only + broadcast there; or (b) accept the ~350 estimate above. **Broader
  flag for the mainnet plan:** scarb 2.18 / Sierra 1.8.0 classes do **not** currently declare on the
  two nodes tried — worth confirming a known-good Sepolia/mainnet RPC before the mainnet deploy.
- **Blockers:** node/RPC compatibility for declaring Sierra 1.8.0 (a human/infra choice).

---

## 2026-06-16 — Review post-06-09 work; adopt strkd-only tx tooling (retire sncast)
- **Goal:** understand the work done since the 2026-06-09 STATUS snapshot (the step-engine perf
  pass + the benchmark), and switch all transaction tooling from `sncast` to the strkd wallet
  companion.
- **Branch:** `perf/step-grid-modulo-removal` (review/docs only — no product code changed this
  session). Reviewed commits `da2c284`, `653403c`, `4b69301`.
- **Changed (docs only):** documented the strkd-over-sncast policy in
  [development.md](../development.md) (new "Transaction & signing tooling" section; reframed the
  raw-key `deploy_full.ts` deploy path as deprecated). Refreshed STATUS (date/branch/35 tests,
  a Performance "Done" bullet, the strkd tooling line, and a caveat that the 170 ceiling predates
  the perf work). This entry.
- **Understood — the step-engine change (`src/gol_utilities.cairo`):**
  - `da2c284` factored the Conway rules into one shared `step_grid` free function and added
    `iterate_life_several_in_place(state, generations)` — unpack the u256 grid once, step in
    place, pack once (vs re-packing every generation in a loop of `iterate_life_once`). ~3×
    cheaper per generation. New interface method; `iterate_life_once` now delegates to `step_grid`
    (behaviour unchanged). `src/gol_bench.cairo` (`GolBench`) is throwaway benchmark scaffolding.
  - `653403c` replaced the four `% grid_size` wraps per cell with branch-based toroidal wraps
    (`if x == 0 {14} else {x-1}` etc.) and hoisted `row_above`/`row_below` + the three `grid.at()`
    row snapshots out of the column loop (they depend only on `row`). **−39.0% L2 gas** on
    `bench_in_place_20_gens` (151,994,713 → 92,723,913).
  - `4b69301` added four reference-output tests comparing `iterate_life_several_in_place` against
    an independent Python GoL sim across every wrap direction (interior, right/bottom edge, left
    seam), plus the earlier toroidal corner-block + seam-blinker tests.
- **Verified:** `snforge test` green — **35 passed, 0 failed**. Suite includes in-place benchmarks
  at 20/100/200/250/270 generations, all passing.
- **Decisions:**
  - **strkd is now the only transaction tool.** Rationale: keys never leave the wallet, every
    sensitive action is human-approved on-screen, and the prior blocker (strkd couldn't submit a
    proof-carrying verify tx) is fixed — `wallet_addInvokeTransaction` now takes `proof_facts`/`proof`.
    So `sncast` and the raw-`DEPLOYER_PRIVATE_KEY` `deploy_full.ts` path are both retired.
  - Paired strkd (client `claude-code-gol`, `reattach:true` recovered the existing client +
    its `gol-bench` agent account `0x026d87…e70f`). Status: unlocked, SN_SEPOLIA, no grant (so
    every own-account op prompts the human — kept as-is).
- **Next:** (1) the 170-gen on-chain ceiling predates the −39% step_grid pass — **re-measure** via
  strkd `move_forward_in_place` on the live `GolBench` for a current number (in-suite bench reaches
  270). (2) Resume the mainnet track: frontend smoke test → independent security review (now
  including the `step_grid` rewrite + the partial-path semantic change). (3) Decide whether to
  merge `perf/step-grid-modulo-removal` → `chore/modernize-and-prune` → `main`.
- **Blockers:** none.

---

## 2026-06-09 — SNIP-36 benchmark: on-chain vs off-chain generation ceiling
- **Goal:** measure the max GoL generations advanceable in one transaction — on-chain vs
  off-chain via SNIP-36 — using the in-place iteration.
- **Branch:** `main` (bench code authored in a prior session; this session is measurement
  only — **no product code changed**).
- **Changed:** no product code. Benchmark-only `src/gol_bench.cairo` (`GolBench`, SNIP-36) is
  deployed on Sepolia at `0x0057ac40958e78244ba405fcbf4ba37e20af65c45ad8c305bf61d3d211a6eb99`
  (class `0x4460e11a…14cc`). Added `docs/strkd-snip36-feature-request.md` (portable; for the
  strkd maintainer).
- **Verified — the result:**
  - **On-chain ceiling: 170 generations** in one tx (`iterate_life_several_in_place`), bounded
    by the **1.2e9 L2-gas-per-tx protocol cap**. Measured via `starknet_estimateFee`
    (`/tmp/golbench/estimate.py`, SKIP_VALIDATE, no spend): ~7M L2 gas/gen; n=170 = 1,193M gas
    (ok), n=171 = 1,201M (> cap). **Correction:** an earlier note said "97" — that was a wrong
    gas-per-gen estimate (~12M assumed vs ~7M actual) and was never broadcast (n=64 was the
    highest confirmed). The same `estimateFee` simulates full execution, so n≤170 demonstrably
    runs to completion on-chain. **Confirmed by real broadcast** of `move_forward_in_place(170)`
    via strkd from the agent account — tx `0x50fd2c79…bdedc`, SUCCEEDED/ACCEPTED_ON_L2,
    `get_age` 58→228, actual L2 gas 1,085,322,855 (l1_gas 0), fee 8.68 STRK. (Actual came in
    under the estimate, so 170 had ~115M gas of headroom under the cap.)
  - **Off-chain SNIP-36 ceiling: 43 generations** — on the **local** native stwo "Dinner"
    build. n=43 proves (~32–40 s, ~408 KB proof); n≥44 fails fast (~16–24 s) with the stwo
    error **`Not enough twiddles!`** — the circle-FFT domain max, i.e. that build's
    **trace-size cap**. Binary search: ✅ 15/35/40/43 · ❌ 44/45/56/97/150.
  - Funded the bench agent account 30 STRK (balance limit ≈ 220 gens) → **balance was not the
    binding constraint; the local prover capped first.**
  - Full round-trip validated at n=15 and at the ceiling n=43: strkd sign-only → Dinner prove
    → on-chain `verify_move_forward` (checks `proof_facts[8] == message_hash`). Bench `get_age`
    0→15→58. Verify txs `0x0671…0857` (n=15), `0x0445…14d3` (n=43).
- **Findings:** For this workload **off-chain (43) < on-chain (170)** — but they are
  *different kinds of limits*: on-chain is the protocol gas cap (calibrated to the *production*
  prover); off-chain (43) is the *local* Dinner stwo build's fixed trace/twiddle capacity. Same
  prover family, far smaller local build. Raise its max log size / twiddle precompute and the
  off-chain ceiling climbs past 170 (off-chain isn't subject to the 1.2e9 cap — next limits are
  balance ~220, then RAM). Not a SNIP-36 limitation. strkd handled pair/create/fund/deploy/sign with **no failures**
  (grant auto-approves own-account ops; only funding prompts). The only gap: submitting the
  proof-carrying verify tx — `wallet_addInvokeTransaction` has no `proof`/`proof_facts` params —
  so verify went through `sncast --proof-file/--proof-facts-file` from `playground-master` (works
  because `verify_move_forward` has no sender check). Captured as a feature request (enrich the
  existing method; no new endpoint).
- **Next:** to push the off-chain ceiling higher, raise the stwo prover's max log size /
  twiddle precompute in the Dinner build and re-run the sweep (should climb toward the ~220
  balance limit at 30 STRK). Otherwise resume the mainnet track (frontend smoke test → review).
- **Blockers:** none in-repo. (Beating on-chain off-chain needs a Dinner prover-config change,
  outside this repo.)

---

## 2026-06-08 — Deploy to Sepolia + wire the frontend
- **Goal:** stand up the full contract graph on Sepolia and point the web app at it.
- **Branch:** `chore/modernize-and-prune` (config changes; `.env.local` is gitignored)
- **Changed:** deployed all four contracts via `sncast` from the `deployer` account
  (`0x319…532`), declared the classes, deployed, and wired roles + nutrient address + allowance in
  a single atomic multicall. Set `ui/game-of-life/.env.local` to the live addresses; fixed the dead
  `blastapi` default RPC in `.env.local.example` and `contracts.ts` to the Cartridge Sepolia node.
  Addresses recorded in STATUS.
- **Verified:** on-chain reads confirm the three `MINTER_ROLE` grants, the allowance (1001 NUT),
  a real `mint_loop` of a 2×2 block (token `98307`: owner = deployer, `LifeFormData` correct,
  NUT 1001→1000), and `token_uri` returning the base64 `data:application/json` (decodes to
  `{"name":"Lifeform #98307…`). Frontend wallet/mint/event paths remain build-verified — manual
  click-through is the next step.
- **Decisions:** deployed with `sncast` (keys stay in its account file; the agent never handles
  them) rather than the private-key TS script. The `deployer` account was topped up to ~123 STRK
  because GolLifeforms' declare alone wanted a ~35-STRK max-fee bound. Skipped the TS script's
  hardcoded test-mint; did one clean verification mint instead.
- **Next:** manual frontend smoke test against the deployment; then the independent security review
  (incl. the partial-path semantic change) ahead of mainnet.
- **Blockers:** none.

## 2026-06-08 — Fix the partial-path closing-segment bug + happy-path mint tests
- **Goal:** make the `*_from_partial_paths` mints reachable (the prior session pinned them as dead)
  and prove it end-to-end.
- **Branch:** `chore/modernize-and-prune`
- **Changed:** `compute_partial_path` now iterates `generations - 1` (one fewer step), so the
  trigger guard covers only the states the segment stores instead of peeking one step past the
  exitpoint. Replaced the bug-pinning `test_partial_path_cannot_span_a_full_period` with two
  end-to-end mints (`test_mint_loop_from_partial_paths` via a blinker, `test_mint_path_from_partial_paths`
  via L-tromino -> block) and a `test_partial_path_rejects_overshooting_the_period` guard test.
  Updated ROADMAP/STATUS.
- **Verified:** `scarb build` + `snforge test` green (23, +2 net). The two `*_from_partial_paths`
  entrypoints now mint successfully; over-length segments still revert `'Triggered state reached'`.
- **Decisions:** maintainer greenlit the fix. exitpoint/length semantics are unchanged (same index,
  same value) — the change only drops the spurious peek; `is_single_loop_from_initial_state` calls
  the underlying util directly and is unaffected. Flagged as an on-chain semantic change for the
  pre-mainnet audit scope.
- **Next:** Phase 4 (indexer/gallery, Sepolia deploy by maintainer → mainnet) and the independent
  audit, which should cover this change.
- **Blockers:** none.

## 2026-06-08 — Partial-path test coverage (+ latent bug found)
- **Goal:** cover the partial-path discovery/combination/mint flows (ROADMAP backlog).
- **Branch:** `chore/modernize-and-prune`
- **Changed:** added 5 tests to `tests/test_minters.cairo`: a positive create+combine test (events
  asserted via `spy_events`), combine's two guard reverts (`'Not combinable'`,
  `'Different trigger state'`), the `mint_loop_from_partial_paths` registration guard, and
  `test_partial_path_cannot_span_a_full_period` which pins the bug below. Updated ROADMAP/STATUS.
- **Verified:** `scarb build` + `snforge test` green (21, +5).
- **Finding:** the two `*_from_partial_paths` mints are **unreachable for real loops.**
  `compute_partial_path` trigger-checks one step past the segment's stored exitpoint (it iterates
  `generations` times but stores index `generations-1`), and that peeked step is exactly the
  closure state `== loop_id == trigger_state` the mints require — so the closing segment always
  reverts `'Triggered state reached'`. Proposed fix: iterate `generations-1` in
  `compute_partial_path` (exitpoint/length unchanged); localized — nothing else calls it.
- **Decisions:** did **not** apply the fix — it's an on-chain semantic change, so it's the
  maintainer's call (cf. the economy-design episode). Tests document current behaviour honestly.
- **Next:** maintainer decides fix-now vs defer; if fix, add happy-path mint tests for the full
  partial-path loop/path flows.
- **Blockers:** none for the tests; the bug fix is gated on sign-off.

## 2026-06-08 — Movement-integrity guard + economy reframing
- **Goal:** stop NUT being earned on phantom (unminted) ids; correct docs that mis-framed the
  NUT economy as a flaw.
- **Branch:** `chore/modernize-and-prune`
- **Changed:** `move_lifeform_forward` now asserts `self.erc721.exists(token_id)` and reverts
  `'Lifeform not minted'`; added a negative + positive test. Reframed ROADMAP Phase 3 + STATUS:
  the free NUT faucet is **intentional** (proof-of-participation that drives on-chain movement),
  so Phase 3 is a security review, not an economy redesign.
- **Verified:** `scarb build` + `snforge test` green (16, +2).
- **Decisions:** per Henri — earning NUT requires advancing a *real* lifeform, but ownership
  still doesn't matter (you may advance anyone's). No NUT fees/sinks added; inflation is by design.
- **Next:** independent security review of the contracts.
- **Blockers:** none.

## 2026-06-08 — Phase 2: on-chain SVG `token_uri`
- **Goal:** make the NFTs render — override `token_uri` with on-chain metadata + an SVG.
- **Branch:** `chore/modernize-and-prune`
- **Changed:** added `src/base64.cairo` (base64 encoder) and `src/gol_metadata.cairo` (SVG + JSON
  builders, decimal helpers); overrode `token_uri`/`tokenURI` in `gol_lifeforms` (embed the ERC721
  pieces individually instead of the Mixin + supply a custom `IERC721Metadata`); set the base URI
  to empty; re-extracted the lifeforms ABI for the frontend.
- **Verified:** `scarb build` + `snforge test` green (14, +6): base64 RFC vectors, exact SVG and
  JSON output, and an end-to-end `token_uri` read after minting.
- **Next:** Phase 3 (economy redesign + security review) — or maintainer deploys to Sepolia.
- **Blockers:** none for Phase 2.

## 2026-06-08 — Documentation system
- **Goal:** document the code written so far and establish a prescriptive project-management process.
- **Branch:** `chore/modernize-and-prune`
- **Changed:** added `docs/README.md` (index + doc-contribution rules), `docs/frontend.md`,
  `docs/development.md`, and `docs/project-management/` (this process, STATUS, ROADMAP, LOG);
  rewrote the root `readme.md` as the entry point and fixed its broken doc links.
- **Verified:** docs only; no code change. Baseline still green from the prior session.
- **Next:** Phase 2 (on-chain `tokenURI`/SVG), or maintainer deploys to Sepolia to runtime-verify Phase 1.
- **Blockers:** none for docs.

## 2026-06-08 — Phase 1 polish: fate-finder, path minting, lifeforms view
- **Goal:** finish the Phase 1 frontend features that don't need a deployment.
- **Branch:** `chore/modernize-and-prune` · **Commits:** f7438bf
- **Changed:** extracted the GoL core to `lib/gameOfLife.ts` with a pure `computeFate()`
  (replacing the buggy stale-closure loop detection); added `mintPath` and `move_lifeform_forward`
  ("breathe life"); added `LifeformsPanel` (owned lifeforms via `NewLifeForm` events) + `GridPreview`.
- **Verified:** `computeFate` checked against block/blinker/L-tromino/empty (17 assertions, all pass);
  `npm run build` green. ⚠️ wallet/mint/event paths build-verified only.
- **Decisions:** detection is now synchronous + pure; animation is purely visual.
- **Next:** documentation, then Phase 2.
- **Blockers:** live verification needs a deployment (see STATUS).

## 2026-06-08 — Phase 1 foundation: wire the frontend to Starknet
- **Goal:** give the Next.js app real chain integration.
- **Branch:** `chore/modernize-and-prune` · **Commits:** f829fd2
- **Changed:** added `starknet` + `@starknet-io/get-starknet`; `lib/contracts.ts` (env config),
  `lib/wallet.tsx`, `lib/useGol.ts`; connect button + NUT balance + "Mint this loop" in the UI;
  extracted ABIs to `lib/abi`; `.env.local.example`; fixed latent `Array.fill()` type errors and
  bumped tsconfig target to ES2020.
- **Verified:** `npm run build` green.
- **Next:** Phase 1 polish (path mint, lifeforms view, fate-finder fix).
- **Blockers:** addresses are deploy-time config; not yet deployed.

## 2026-06-08 — Upgrade OpenZeppelin 3.0 / Starknet 2.18
- **Goal:** finish modernizing the contract dependencies.
- **Branch:** `chore/modernize-and-prune` · **Commits:** 99835bf
- **Changed:** `starknet` 2.9→2.18, `openzeppelin` 0.20→3.0; migrated moved interfaces to
  `openzeppelin::interfaces::*`, added ERC20 `DefaultConfig`, made `ref self` dispatcher vars `mut`.
- **Verified:** `scarb build` + `snforge test` green (8).
- **Decisions:** used OZ 3.0 stable (the v4 RC isn't published to the Scarb registry).
- **Next:** Phase 1 frontend.

## 2026-06-08 — Remove stale frontend + dead code
- **Goal:** delete unused frontends and dead files.
- **Branch:** `chore/modernize-and-prune` · **Commits:** ff45d5b
- **Changed:** removed the Vite app (`ui/gol-website`) and a dead duplicate `comparison.tsx`.
  Kept the standalone `js/` reference implementation (it's documented in `overview.md`).
- **Verified:** n/a (deletions); contracts still build.
- **Next:** OZ/Starknet upgrade.

## 2026-06-08 — Phase 0: unblock build, modernize toolchain, repair tests
- **Goal:** get a green baseline on the current toolchain.
- **Branch:** `chore/modernize-and-prune` · **Commits:** d9a1ad7
- **Changed:** removed the unused `hdp_cairo` dep whose pinned git rev no longer existed (it
  alone blocked the build); bumped `snforge_std`/`assert_macros` to match `snforge` 0.60;
  deleted dead `test_contract.cairo` boilerplate; rewrote `test_grid_utils` + `test_minters`
  as correct integration tests; added `.tool-versions` + CI.
- **Verified:** `scarb build` + `snforge test` green (8). The previous tests had never passed.
- **Next:** remove stale files; OZ/Starknet upgrade.
