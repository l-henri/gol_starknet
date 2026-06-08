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

### Phase 2 — Make the NFTs render ⬜
- [ ] On-chain `tokenURI` returning an SVG (or animated) render of the grid
- [ ] Tests for the metadata/encoding
- [ ] Frontend: show the on-chain art (reuse the rendering logic)

### Phase 3 — Economy + security ⬜ (gate before mainnet)
- [ ] Fix the `move_lifeform_forward` NUT faucet (no ownership/existence check, no rate
      limit, unlimited free NUT) — see the project memory and `usage-guide.md`
- [ ] Reconsider the reward curve and the NUT sink (spent NUT is currently locked with no
      withdrawal path)
- [ ] Independent security review before deploying real value

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
