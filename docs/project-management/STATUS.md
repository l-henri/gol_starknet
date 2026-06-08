# Status

> Snapshot of where the project stands. Keep this short and current — rewrite it each session.
> History lives in [LOG.md](LOG.md); the plan lives in [ROADMAP.md](ROADMAP.md).

**Last updated:** 2026-06-08
**Active branch:** `chore/modernize-and-prune` (not yet merged to `main`, not pushed)
**Build/test:** `scarb build` ✅ · `snforge test` ✅ (23 passing) · `npm run build` ✅

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
- **Phase 3 (started) — movement integrity.** `move_lifeform_forward` now reverts on phantom
  (unminted) token ids (`'Lifeform not minted'`), so NUT is only earned by advancing real
  lifeforms. The NUT economy itself is intentional and unchanged.

## In progress

- Nothing actively in flight. (Partial-path machinery is now covered end-to-end and the
  closing-segment bug is fixed — see the LOG and ROADMAP backlog.)

## Sepolia deployment (live — 2026-06-08)

Deployed via `sncast` from the `deployer` account; roles + allowance wired in one multicall; a
2×2-block loop NFT (token `98307`) minted to confirm the full path. `ui/game-of-life/.env.local`
is set to these (RPC: `https://api.cartridge.gg/x/starknet/sepolia`).

| Contract | Address |
|---|---|
| Nutrient (NUT) | `0x060e3d6a6f181235e0d4993ddde5a7db7d8ff5275830bcc916969dfdbf3e1858` |
| GolLifeforms | `0x0535f6cb8e98f78de9b4dc71b78839cd8119af301b8b300d715b32872d07494e` |
| GolLoopMinter | `0x021f2ee4afeb2593fb957911f500c06424bb045ec64e172bd8ee0af5aefd4ffc` |
| GolPathMinter | `0x07e46847ece8c083da4e8a3eb17bd8d3f7138b08cda3ad6a2ffa884b918d2503` |

Verified on-chain: all three `MINTER_ROLE` grants, the nutrient-address wiring, the allowance, the
mint (owner + `LifeFormData`), the 1-NUT charge, and that `token_uri` returns the base64 JSON+SVG.

## Blocked

- Nothing blocked. (The frontend's wallet/mint/event paths are still **build-verified**; the
  next step is a manual click-through against this deployment — see Next up.)

## Next up

Recommended order (see [ROADMAP.md](ROADMAP.md) for detail):

1. **Manual frontend smoke test** — `cd ui/game-of-life && npm run dev`, connect a Sepolia wallet,
   confirm the NUT balance, the minted lifeform (`98307`) in "my lifeforms", and a fresh mint.
2. **Independent security review** before mainnet (access control, upgrade auth, minter validation,
   and the partial-path semantic change). The NUT economy is intentional, not a bug.
3. **Phase 4 — indexer/gallery, then mainnet.**

## Merge state

The branch `chore/modernize-and-prune` holds all work to date. To bring it to `main`:
`git checkout main && git merge --ff-only chore/modernize-and-prune`, or open a PR.
