# Status

> Snapshot of where the project stands. Keep this short and current — rewrite it each session.
> History lives in [LOG.md](LOG.md); the plan lives in [ROADMAP.md](ROADMAP.md).

**Last updated:** 2026-06-08
**Active branch:** `chore/modernize-and-prune` (not yet merged to `main`, not pushed)
**Build/test:** `scarb build` ✅ · `snforge test` ✅ (14 passing) · `npm run build` ✅

## Done

- **Phase 0 — modernize.** Removed the dead `hdp_cairo` dep that blocked the build; bumped to
  Scarb/Cairo 2.18, `snforge_std` 0.60, OpenZeppelin 3.0, Starknet 2.18; rewrote the test
  suite into correct integration tests; added `.tool-versions` + CI.
- **Repo cleanup.** Removed the stale Vite frontend and a dead duplicate component;
  standardized on the Next.js app.
- **Phase 1 — frontend ↔ chain (code complete).** Wallet connect, env-driven contract config,
  `useGol` actions (mint loop/path, breathe-life, balance/lifeform reads), a reliable pure
  fate-finder (`computeFate`, unit-verified), a "my lifeforms" view, and grid previews.
  `next build` passes.
- **Phase 2 — on-chain rendering.** `token_uri`/`tokenURI` now return a base64 `data:` URI with
  ERC721 JSON and an SVG of the lifeform's grid (`src/gol_metadata.cairo` + `src/base64.cairo`);
  verified by 6 tests (base64 vectors, exact SVG/JSON, end-to-end after mint).

## In progress

- Nothing actively in flight.

## Blocked

- **Live verification of the frontend** is blocked on a **Sepolia deployment**, which requires
  the maintainer's funded account + private key (an agent must not handle keys). Once deployed,
  set `NEXT_PUBLIC_*` in `ui/game-of-life/.env.local`. Until then the wallet/mint/event paths
  are **build-verified only**, not runtime-verified.

## Next up

Recommended order (see [ROADMAP.md](ROADMAP.md) for detail):

1. **Deploy to Sepolia** (maintainer) → fill `.env.local` → runtime-verify Phase 1 and see the
   on-chain art render.
2. **Phase 3 — economy redesign + security review** before any mainnet (the
   `move_lifeform_forward` NUT faucet must be fixed first).

## Merge state

The branch `chore/modernize-and-prune` holds all work to date. To bring it to `main`:
`git checkout main && git merge --ff-only chore/modernize-and-prune`, or open a PR.
