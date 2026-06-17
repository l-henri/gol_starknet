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
