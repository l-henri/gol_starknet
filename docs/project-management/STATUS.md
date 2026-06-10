# Status

> Snapshot of where the project stands. Keep this short and current — rewrite it each session.
> History lives in [LOG.md](LOG.md); the plan lives in [ROADMAP.md](ROADMAP.md).

**Last updated:** 2026-06-09
**Active branch:** `chore/modernize-and-prune` (not yet merged to `main`, not pushed)
**Build/test:** `scarb build` ✅ · `snforge test` ✅ (24 passing) · `npm run build` ✅

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

## SNIP-36 proving benchmark (2026-06-09)

Measured the max GoL generations advanceable in one tx, on-chain vs off-chain (full detail in
[LOG.md](LOG.md)). Benchmark-only `GolBench` (`src/gol_bench.cairo`) is live on Sepolia at
`0x0057ac40958e78244ba405fcbf4ba37e20af65c45ad8c305bf61d3d211a6eb99` (not part of the product).

| Path | Ceiling | Bound by |
|---|---|---|
| On-chain (single tx, in-place) | **170 gens** | 1.2e9 L2-gas-per-tx protocol cap (~7M gas/gen; n=170 ok, n=171 over) |
| Off-chain (SNIP-36, **local** Dinner stwo build) | **43 gens** | that prover build's trace size — `Not enough twiddles!` |
| (off-chain balance limit @ 30 STRK) | ~220 gens | not reached — local prover caps first |

Round-trip validated end-to-end at n=15 and at the n=43 ceiling (strkd sign → Dinner prove →
on-chain `verify_move_forward`). On-chain (170) and off-chain (43) are **different kinds of
limits**: on-chain is the protocol gas cap (calibrated to the *production* prover); off-chain
is the *local* Dinner stwo build's fixed trace/twiddle capacity. Same prover family, much
smaller local build — raise its max log size / twiddle precompute and the off-chain ceiling
climbs past 170 (off-chain has no 1.2e9 cap; next limits are balance ~220, then RAM). On-chain
ceiling measured via fee estimation (`/tmp/golbench/estimate.py`) and **confirmed by a real
broadcast of `move_forward_in_place(170)`** — tx `0x50fd2c79…bdedc`, SUCCEEDED, `get_age` 58→228,
actual L2 gas 1,085,322,855, fee 8.68 STRK. The earlier "97" was a wrong gas-per-gen estimate. strkd worked for every step except submitting the proof-carrying verify
(no `proof`/`proof_facts` param) — see
[strkd-snip36-feature-request.md](../strkd-snip36-feature-request.md); verify used `sncast`.

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
