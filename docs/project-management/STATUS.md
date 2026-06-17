# Status

> Snapshot of where the project stands. Keep this short and current — rewrite it each session.
> History lives in [LOG.md](LOG.md); the plan lives in [ROADMAP.md](ROADMAP.md).

**Last updated:** 2026-06-16
**Active branch:** `perf/step-grid-modulo-removal` (built on `chore/modernize-and-prune`; neither merged to `main`, not pushed)
**Build/test:** `scarb build` ✅ · `snforge test` ✅ (35 passing) · `npm run build` ✅
**Tx tooling:** all on-chain transactions go through the **strkd** wallet companion — **not `sncast`** (see [development.md](../development.md#transaction--signing-tooling--use-strkd-not-sncast)).

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
- **Performance — the GoL step engine.** Factored the Conway step into one shared `step_grid`
  free function and added `iterate_life_several_in_place` (unpack the u256 grid once, step in
  place, pack once — vs re-packing every generation; ~3× cheaper per generation). Then removed
  the four `% grid_size` ops per cell (branch-based toroidal wraps) and hoisted the row
  snapshots out of the column loop: **−39% L2 gas** on the 20-generation in-place benchmark
  (152.0M → 92.7M). Added equivalence + toroidal-edge + independent-reference (Python-checked)
  tests. ⚠️ This touches consensus-critical stepping logic — **in scope for the pre-mainnet audit.**

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

## SNIP-36 proving benchmark — RE-MEASURED with the optimized step_grid (2026-06-17)

Max GoL generations advanceable in one tx, on-chain vs off-chain, **re-measured live on Sepolia with
the optimized (`perf/step-grid-modulo-removal`) code** (full detail in [LOG.md](LOG.md)). The
optimized `GolBench` (class `0x41268542…b0da`, Sierra 1.8.0) is deployed at
`0x05f62daf5d63c1c6c310247d2155dcc52fa4328ff7bd8ec4ace6f40f8fa3ec5`; the pre-optimization instance
(`0x0057ac40…eb99`) stays for reference. Not part of the product.

| Path | Old code | **Optimized** | Bound by |
|---|---|---|---|
| On-chain (single tx, in-place) | 170 | **321 gens** | 1.2e9 L2-gas-per-tx protocol cap (n=321 ok, 322 over) |
| Off-chain (SNIP-36, **local** dinner/stwo build) | 43 | **89 gens** | that build's trace/twiddle cap — `Not enough twiddles!` at n=90 |

Both ~2× the old code (1.89× on-chain, 2.07× off-chain) — matching the ~47%-cheaper-per-generation
`step_grid`. On-chain confirmed by real broadcast `move_forward_in_place(321)` (tx `0x5307febe…`,
**actual 1,089,490,115 L2 gas**, 8.72 STRK, `get_age` 0→321). Off-chain pinned via **dinner** (the
local proving companion): n=89 proves (~406 KB proof), n=90 trace-caps.

Round-trip validated end-to-end at n=15 and at the n=43 ceiling (strkd sign → Dinner prove →
on-chain `verify_move_forward`). On-chain (170) and off-chain (43) are **different kinds of
limits**: on-chain is the protocol gas cap (calibrated to the *production* prover); off-chain
is the *local* Dinner stwo build's fixed trace/twiddle capacity. Same prover family, much
smaller local build — raise its max log size / twiddle precompute and the off-chain ceiling
climbs past 170 (off-chain has no 1.2e9 cap; next limits are balance ~220, then RAM). On-chain
ceiling measured via fee estimation (`/tmp/golbench/estimate.py`) and **confirmed by a real
broadcast of `move_forward_in_place(170)`** — tx `0x50fd2c79…bdedc`, SUCCEEDED, `get_age` 58→228,
actual L2 gas 1,085,322,855, fee 8.68 STRK. The earlier "97" was a wrong gas-per-gen estimate.

> **Lessons from getting these numbers (the "declare blocker" was self-inflicted, not infra):**
> 1. **`compiled_class_hash` must be computed with starknet.js ≥ v9.** The frontend's pinned
>    **v7.6.4** uses the old algorithm (returned `0x7eec8e15…`); **v10** returns the correct
>    `0x581b62…` the network expects. A wrong hash is rejected as a `compiled_class_hash` mismatch
>    that *looks* like toolchain/compiler skew but isn't. scarb 2.18 / Sierra 1.8.0 declares fine.
> 2. **Class hash needs the canonical abi serialization** (`formatSpaces`, not plain
>    `JSON.stringify`) or the node derives a different class_hash → "invalid signature" on declare.
> 3. **The SNF nodes rate-limit heavy proof state-fetches.** Solved with a local loopback reverse
>    proxy injecting the `X-SNF-Nodes-Key` header (key in a `/tmp` chmod-600 file, never logged/
>    committed); dinner + strkd point their RPC URL at it. Earlier "Sierra 1.7 / mainnet gate" worry
>    was a red herring — Cairo 2.18 (Sierra 1.8.0) is the supported network version.

At the time, strkd worked for every step except submitting the proof-carrying verify (its
`wallet_addInvokeTransaction` had no `proof`/`proof_facts` param) — see
[strkd-snip36-feature-request.md](../strkd-snip36-feature-request.md); that verify used `sncast`.
**That gap is now closed** — strkd's `wallet_addInvokeTransaction` accepts `proof_facts`/`proof`,
so the whole flow (including verify) runs through strkd and `sncast` is retired.

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
