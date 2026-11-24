# CLAUDE.md — gol_starknet

Conway's Game of Life creatures living on Starknet. This is a **WIP art piece, not a
commercial product** — its outcome is burning gas and creating art. The free NUT faucet
is intentional (proof-of-participation), not a bug. Read `docs/purpose.md` for the vision
and `docs/README.md` for the doc index.

All on-chain transactions go through the **strkd** wallet companion — never sncast or raw
keys (`docs/development.md`).

## Documentation consistency (do this every session)

The doc trail went stale during the v2 pivot (LOG/STATUS stopped 2026-06-17 while the
product changed shape). These rules exist so that never happens again. **A session that
changes contracts, SDK, UI, deployments, or reverses a decision is not done until:**

1. **LOG** — append a dated entry to `docs/project-management/LOG.md`: what changed and
   *why* (the reasoning, not just the diff). One entry per work session, append-only.
2. **STATUS** — rewrite `docs/project-management/STATUS.md`. It is a snapshot; if it
   describes last month, it is wrong. Update the active branch, build/test state, and
   "Next up".
3. **Spec reversals are recorded where the spec lives.** If the work supersedes or
   contradicts a signed-off spec (`frontend-redesign.md`, `v2-grid-redesign.md`,
   `path-creatures-spec.md`, `partial-paths-mint-ux.md`, `sdk-plan.md`), add a dated
   "superseded/changed" note *in that spec* explaining the new decision. A spec that
   silently disagrees with the code is worse than no spec.
4. **Decisions get logged** — architectural/SDK decisions go in `docs/sdk-decisions.md`
   (dated, alternatives + why-not); product/design decisions in the relevant spec's
   decision log.
5. **Deployments** — new addresses, class hashes, upgrades, and role changes go in
   `docs/v2-deployment.md` the same session they happen.
6. **New docs get an index line** in `docs/README.md`.

When picking work back up, follow the resume checklist in
`docs/project-management/README.md` — and if STATUS/LOG disagree with the git history,
fix them first.

## Claude Code and Codex

These instructions apply to both agents. `CLAUDE.md` imports this file. Before
editing a directory, read its scoped `AGENTS.md` when present. Shared local skills
are discoverable under `.agents/skills`; `.claude/skills` provides compatibility.
Use the host's native tools for questions, planning, and delegation when a workflow
mentions a Claude tool name. Preserve the workflow's permission and review gates.
If a required capability is unavailable, report it instead of claiming it ran.

## Checks

- Run `./scripts/check.sh` before you push, and report which checks actually ran. The commit
  hook runs `./scripts/check.sh --fast`; CI runs the full script.
- A missing tool is a failure, not a reason to skip a check.
- Do not loosen a check, delete a test or lower a version pin to get a green run. Say what is
  failing instead.
- Tool versions are pinned (`.tool-versions`, `rust-toolchain.toml`, `ui/game-of-life/.nvmrc`)
  and the lockfiles are committed. Upgrade them in their own change.
- Never commit secrets, keys or `.env` files.
- `.starter.toml` lists the hygiene checks this repository does not meet yet, with reasons.
