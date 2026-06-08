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
