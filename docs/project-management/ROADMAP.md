# Roadmap

> The plan. Phases are sequential-ish; the backlog holds cross-cutting work.
> Current state is in [STATUS.md](STATUS.md). Check items off here when a phase advances.

**End goal:** mainnet launch with a sound token economy.

## Phases

### Phase 0 — Modernize ✅ (done 2026-06-08)
- [x] Remove dead `hdp_cairo` dependency (was blocking the build)
- [x] Bump toolchain: Scarb/Cairo 2.18, `snforge_std` 0.60
- [x] Upgrade OpenZeppelin 0.20 → 3.0, Starknet 2.9 → 2.18
- [x] Rewrite the test suite into correct integration tests (8 passing)
- [x] Add `.tool-versions` + CI (`scarb build` + `snforge test`)
- [x] Remove the stale Vite frontend; standardize on the Next.js app

### Phase 1 — Frontend ↔ chain 🟡 (code complete, not runtime-verified)
- [x] Wallet connect (`get-starknet` + `WalletAccount`)
- [x] Env-driven contract config + extracted ABIs
- [x] Reliable pure fate-finder (`computeFate`, unit-verified)
- [x] Mint loop + mint path; breathe-life (`move_lifeform_forward`)
- [x] "My lifeforms" view (events → owner reconfirm) + token-id lookup
- [ ] **Runtime verification against a live Sepolia deployment** (blocked — see STATUS)

### Phase 2 — Make the NFTs render ✅ (done 2026-06-08)
- [x] On-chain `token_uri`/`tokenURI` returning a base64 `data:` URI with ERC721 JSON + an SVG
      render of the grid (`src/gol_metadata.cairo`, `src/base64.cairo`)
- [x] Tests for the metadata/encoding (base64 RFC vectors, exact SVG/JSON, end-to-end `token_uri`)
- [x] Frontend already renders the same grid client-side via `GridPreview` (mirrors the on-chain
      SVG); reading `token_uri` directly is optional polish

### Phase 3 — Security review 🟡 (gate before mainnet)
The NUT economy is **intentional, not a flaw.** NUT is free to *earn* via `move_lifeform_forward`,
but earning it is on-chain movement (gas + effort), and you must earn it to mint — the point is to
turn interest in the protocol into on-chain activity, not to capture value. So this is **not** an
economy redesign: NUT "inflation" and spent-NUT sitting in the contract are by design, and
ownership intentionally doesn't matter (you may advance anyone's lifeform).
- [x] Guard `move_lifeform_forward` so NUT is only earned by advancing a real (minted) lifeform —
      phantom/unminted ids revert with `'Lifeform not minted'` (done 2026-06-08)
- [ ] Independent security review before deploying real value (access control / `MINTER_ROLE`
      wiring, upgrade authorization, minter validation math, cross-contract call ordering)

### Phase 4 — Ecosystem + launch ⬜
- [ ] Indexer + gallery (browse living lifeforms, oldest, longest loops)
- [ ] Sepolia deploy with recorded addresses → mainnet

## Backlog (cross-cutting / known issues)

- [ ] **Partial-path test coverage** — `mint_partial_path` / `combine_partial_path` /
      `mint_*_from_partial_paths` are untested (the originals were incorrect and were removed).
- [ ] **Frontend test runner** — add Vitest; home the `computeFate` checks there.
- [ ] **`deploy_full.ts` cleanup** — remove the hardcoded trailing test-mint.
- [ ] **Root `package.json` `deploy` script** points at a non-existent `scripts/deploy.ts`.
- [ ] **Missing referenced files** — `terminology.md` and a `LICENSE` are referenced from docs
      but don't exist; either create them or drop the references.
- [ ] **Owned-lifeform enumeration** scans events from block 0; replace with an indexer at scale.
