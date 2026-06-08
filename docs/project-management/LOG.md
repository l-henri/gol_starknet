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
