# Branch Integration Plan

**Status:** Decisions locked 2026-06-19 — executing.
**Date:** 2026-06-19 · **Author:** henri (with Claude) · **Sensitivity:** Internal (AMBER)

## 0. Decisions locked (2026-06-19)

1. **Trunk = `perf/step-grid-modulo-removal`** (fast-forward `main` to it).
2. **Frontend redesign is NOT canonical** — it's an experiment to revisit. `perf`'s existing
   frontend stays on the trunk; the redesign is **parked on its own branch**, not reconciled.
   → **This removes the §6 `ui/` hot-spot from the critical path entirely.**
3. **Frontend redesign → its own branch** (`experiment/frontend-redesign`).
4. **`docs/v2-bigger-grid` rebases onto `main`** (not `feat/rust-sdk`); v2 stays contract-side.
5. **Advancing `origin/main` is authorized.**

Net effect: Stage 0 *splits* the uncommitted tree (SDK tweaks → `feat/rust-sdk`; frontend →
`experiment/frontend-redesign`). Stage D rebases v2 onto `main`. No frontend merge needed.

---

## 1. Problem

The project's real work is split across two divergent lines that both branched off a **stale
`main`** and were never integrated:

```
perf/step-grid-modulo-removal (5dbc2c5)   ← TRUNK-in-waiting: +20 over main
   └ chore/modernize-and-prune (dffed6c)    modernization + Sepolia deploy + on-chain SVG
   └──────────────── 12 commits ───────────┐  (toolchain 2.18, OZ 3.0, snforge 0.60, hdp removed)
main (f9d9f89 "Tweaked a couple of tests")  ← STALE (origin/main is here too)
   └ feat/rust-sdk (3257f07)  ← Rust SDK only; OLD toolchain (2.9.2 / OZ 0.20 / snforge 0.35 / hdp)
        └ docs/v2-bigger-grid  ← v2 design + spike (inherited the stale half)
```

Consequences:
- `main` is ~20 commits behind the actual state of the project.
- `feat/rust-sdk` (and `docs/v2-bigger-grid` off it) lack the modernization **and** the optimized
  `step_grid` — that's why the v2 branch's `snforge test` fails on the old `snforge_std 0.35.1`.
- The hdp-removal commit on `docs/v2-bigger-grid` (`368d868`) is a band-aid that duplicates work
  already done (more completely) on the modern branches.

## 2. Key facts that make this tractable

| Fact | Source | Implication |
|---|---|---|
| `main` is an **ancestor** of `perf` | `git merge-base --is-ancestor` → yes | `main → perf` is a **clean fast-forward**, zero conflicts |
| `main` is an **ancestor** of `feat/rust-sdk` | same | SDK commits replay cleanly onto the new `main` |
| SDK is **purely additive** | `git diff --stat main feat/rust-sdk`: 4,682 ins, 0 del | no overlap to merge |
| SDK lives in its **own Rust workspace** (root `Cargo.toml` + `crates/`) | `perf` has **no** `crates/` and **no** root `Cargo.toml` | SDK ⟂ Cairo modernization — no manifest conflict |
| SDK commits don't touch `ui/`, `src/*.cairo`, or `Scarb.toml` | footprint is `crates/` + 2 docs | rebase of SDK onto `perf` is essentially conflict-free |
| **Frontend collides** | `perf` modifies `ui/game-of-life/src/**`; working tree **deletes/replaces** the same files | the ONE real conflict zone (see §6) |

## 3. Principles

- **Fast-forward, don't merge, where possible.** `main → perf` needs no merge commit.
- **Back up every branch before rewriting history** (rebases). Backups are free and instant.
- **Verify at each gate** (build + tests) before moving on.
- **The frontend redesign is canonical.** Per project memory the redesign (Phases 0–4) shipped; it
  supersedes `perf`'s earlier Phase-1 frontend. Resolve `ui/` conflicts in its favour, re-wiring to
  `perf`'s deployed addresses / ABIs / on-chain SVG.

## 4. Prerequisite — Stage 0: park the uncommitted working tree

The working tree currently carries uncommitted **SDK tweaks + the frontend redesign** (they rode
along when `docs/v2-bigger-grid` was branched). They do **not** belong on the v2 design branch.
Relocate them to `feat/rust-sdk` first:

```sh
# from docs/v2-bigger-grid
git stash push -u -m "wip: sdk tweaks + frontend redesign"   # -u includes new untracked files
git switch feat/rust-sdk
git stash pop                                                # applies cleanly: tree was based on feat/rust-sdk
# review, then commit in logical chunks, e.g.:
git add crates/ && git commit -m "fix(sdk): config/event-scan/wasm tweaks"
git add ui/ docs/frontend-redesign* && git commit -m "feat(ui): living-gallery redesign (Phases 0-4)"
git switch docs/v2-bigger-grid
```

> The v2 branch's own commits (`d9546cf` doc, `1a5f6db` spike) touch only `docs/` and `spike/`, so
> nothing v2-specific is in this stash.

## 5. Stages

### Stage A — back everything up (do this first)

```sh
git branch backup/main main
git branch backup/feat-rust-sdk feat/rust-sdk
git branch backup/v2 docs/v2-bigger-grid
git branch backup/perf perf/step-grid-modulo-removal
```

### Stage B — promote the trunk: `main → perf` (fast-forward)

```sh
git switch main
git merge --ff-only perf/step-grid-modulo-removal     # clean FF; main now == perf
git push origin main                                  # non-force; main advances. Coordinate w/ team.
```
**Gate:** `scarb build` ✅ · `snforge test` ✅ (perf has the repaired test suite) · confirm the
recorded Sepolia deployment + on-chain SVG are intact.

### Stage C — rebase the SDK onto the modern trunk

```sh
git switch feat/rust-sdk
git rebase main          # replays 7 additive SDK commits + the parked frontend/sdk commits
```
- Expect the **SDK commits to replay clean** (separate workspace, no overlap).
- Expect the **frontend-redesign commit to conflict** with `perf`'s `ui/` (see §6).
**Gate:** `cargo build` (SDK) ✅ · `cargo test -p gol-sdk` ✅ · `scarb build` ✅ · `snforge test` ✅
· `cd ui/game-of-life && npm run build` ✅.

> Alternative if the frontend reconciliation is large: rebase only the **SDK** commits here, and
> carry the frontend redesign on its own branch off the new `main` to reconcile separately. Keeps
> the SDK rebase trivially clean.

### Stage D — rebase v2 onto the modern base, drop the redundant hdp commit

```sh
git switch docs/v2-bigger-grid
git rebase --onto feat/rust-sdk 3257f07     # 3257f07 = old feat/rust-sdk tip
# during rebase: DROP commit 368d868 ("remove unused hdp_cairo dependency")
#   — hdp is already gone upstream and Scarb.toml is now the 2.18/OZ3 version.
```
- `d9546cf` (design doc) and `1a5f6db` (spike + doc edit) replay clean — new files only.
- The spike already pins `snforge_std 0.60.0`, so it now matches the repo toolchain.
**Gate:** `scarb build` ✅ · `snforge test` ✅ (main package now on 0.60) · `cd spike/v2_stepper &&
snforge test` ✅ (unchanged).

## 6. Conflict hot-spots

| Area | Risk | Resolution |
|---|---|---|
| `main → perf` | none | fast-forward |
| `crates/**`, root `Cargo.toml`/`Cargo.lock` | none | new files; take SDK as-is |
| `Scarb.toml` / `Scarb.lock` (v2's hdp commit) | redundant | **drop `368d868`** during Stage D |
| `docs/*.md` | low | distinct filenames (`sdk-plan`, `v2-grid-redesign`, …) — keep all |
| **`ui/game-of-life/src/**`** | **HIGH** | redesign supersedes `perf`'s Phase-1 frontend. Take the redesign's components (`Creature`, `Garden`, `CreatureCard`, …; deletes `game-of-life/index.tsx`, `comparison.tsx`), then re-wire to `perf`'s `lib/contracts.ts`, `lib/abi/*.json`, `useGol.ts`, on-chain SVG `token_uri`. Needs eyes, not a mechanical merge. |

## 7. Rollback

- Any branch: `git reset --hard backup/<name>`.
- `main` push is the only remote change and is a plain fast-forward — recoverable by resetting
  `main` to `backup/main` and force-pushing if absolutely necessary (coordinate first).
- Rebases rewrite only local branches; backups are the safety net.

## 8. Open decisions (need your call before execution)

1. **Trunk = `perf` or `chore`?** `perf` is most advanced (deployed, benchmarked, optimized
   stepper) and contains `chore`. Recommend `perf`. Choose `chore` only if `perf`'s 8 extra commits
   aren't ready to be canonical.
2. **Frontend canonical?** Confirm the redesign supersedes `perf`'s Phase-1 frontend (memory says
   it shipped). If not, the `ui/` resolution flips.
3. **Where does the frontend redesign live** — folded into `feat/rust-sdk`, or its own branch off
   the new `main`? (Affects Stage C vs the alternative.)
4. **Post-integration baseline for v2** — does `docs/v2-bigger-grid` rebase onto `feat/rust-sdk`
   (so it has the SDK too) or directly onto `main`? Recommend onto `feat/rust-sdk` so v2 can use the
   SDK when it needs reads/writes.
5. **`origin/main` push** — confirm no one else is building on the current stale `origin/main`
   before advancing it.
