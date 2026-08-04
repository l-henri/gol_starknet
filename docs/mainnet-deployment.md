# GoL v3 — Mainnet Deployment

**Network:** SN_MAIN · **Deployed:** 2026-07-31 · **Admin/deployer:** `0x0062e08b2290144311811658035508622fed22c096447d914be8e36b99222118` (strkd agent account, label `gol-mainnet`, client `gol-bench`)
**Identity model:** orbit-canonical token ids ([v3-identity-spec.md](v3-identity-spec.md)) — the same v3 stack as Sepolia, but built from the post-Sepolia `main` (2026-07-31): mint provenance (`minted_at`/`discoverer`), empty-grid genesis in the constructor, `gol_metadata_v2` **with the static `image` SVG**, and the `pet()` CEI fix.
**NUT is FRESH on mainnet** (no v2 here): initial supply **1 NUT** to the creator — Henri's call: "mint only 1 so that death can be spawned by the deployer; once a creature is alive the system can start". (The empty grid actually genesis-mints itself at zero NUT cost; the 1 NUT covers one period-1 mint's escrow.)
Deploy tooling: strkd (declare/invoke, per-request `chainId`), starknet.js v10 for class hashes / UDC address precompute. Scripts in the session scratchpad `goldeploy/` (`hashes.mjs`, `declare.mjs`, `estimate.mjs`, `deploy.mjs`).

## Addresses

| Contract | Address | class_hash |
|---|---|---|
| Nutrient (NUT) | `0x75a2e584fea61cc3e8580fd6b96e065b2e038863c9d8bf4113b29d58eb0ced1` | `0x2aa46c9ab8759fd7706e8b52add7fd7eb68e2636b01e1c1865f47542793115a` |
| GolLifeformsV3 ("Digital Bacteria" / BACT) | `0x5ebd2e7ca95af6a81863e89496ba2ca0b3765bd04227bde4b769afbc13e5784` | `0x16e85f86fde5686bd75eb7433e2ee857bc220dc7c982743134ce69d5f01efa8` |
| GolLoopMinterV3 | `0xe92f01378b0b9c9b9a22c994a24bff5ed897be6c5d218aa0b8adf56f441b3d` | `0x5a6a0a531e70ec4037c6c1451052ee58080d771a8191d493057ce0f923a8e5c` |
| GolWanderersV3 ("Digital Wanderers" / WNDR) | `0x1259a8b553e5ae806620ff422eb85ccbce2b8ff034235e8d09e36060058f64e` | `0x672cf8d960a19fdd64fcf670bb765c2f5481e87e949a7be749c6ab154146d9c` |
| GolWandererMinterV3 | `0x5bf9b9d20523fa4a502cc16ae76f26a228dd73de7d1bcd4078b89cc5e0069ac` | `0x3713ea370d460957014cc4b56ad7d7cbaa5f3fde485a73e9ebbea7d695bd91f` |
| GolPetBonds | `0x492226c4ffc142e1c1c3c248bd8c9398e4379ddf28ce2d7d6eefbdfdae7e8ec` | `0x5330694ad88d3a8d4881a9cc7629e90d3bb7b85bd1b5158ef5620c0ef2c079e` |

Class-hash cross-check: NUT, LoopMinterV3 and WandererMinterV3 hash **identically to the Sepolia
deployments** (source unchanged); LifeformsV3 / WanderersV3 / PetBonds differ because they carry
the 2026-07-24→29 changes (provenance, genesis, `image` metadata, CEI).

## 2026-08-04 — gas-classes migration (perf/stepper-gas, docs/migration-runbook.md)

Feed cost **2,600,839 → 1,148,845 L2 gas/generation** (real receipts on the genesis void:
pre `0x3a645074…e712`, post `0x3a741969…079e` + `0x43243aaf…92ff`). Executed per the
runbook after the same-day Sepolia dress rehearsal.

| Change | Value | tx |
|---|---|---|
| GolLifeformsV3 upgraded in place | new class `0x1c4cb60804ee32b7f749c2500be2af3aac1065c5171039a3078fac624fe4317` | `0x76e2171c9c340da3492a0df4458f40c0d471f5bd43452e82170091bb05bbfd7` |
| GolWanderersV3 upgraded in place | new class `0x4e05202f7ed69bf1692d9651fc533cc116fc3cf2eae18362f7e6ad6859afed8` | (same multicall) |
| **GolLoopMinterV3 REDEPLOYED** | `0x7697efb274b53182aae8daa9945b2674f1d2ad14d29a3950a03b8d2fc4e675b` (class `0x1e9641b2…125f253c`) | `0x7925ab0e346ce5ab960f99d5af20f158cbf56868a79fd3b2cedf87d483407ad` (block 12_759_573) |
| **GolWandererMinterV3 REDEPLOYED** | `0x32931ffd7802f82499e0f9fbe5bf00bc7c86e06d07c11cac73b51e5ceb56341` (class `0x1e078956…6e760470`) | (same multicall, + both grants) |
| Declares (4 classes, ~267 STRK) | lifeforms `0x1e83673d…167f5`, others in scratchpad `declare-results-main.json` | |
| First k>0 mint via the new minter | token `0x6bdfddaa5370bf279bfde266583f49506c19f8d2b186ba407c422fb7f95bfe2` (blinker, drawn = phase B, k=1) | `0x5dd3dd79ce02fa0a7381faa16459a671581ac020b9d3c9eb24e533bb51994d` |

The new loop minter anchors the witness at the DRAWN state (`step^k(drawn)` captured
during the loop walk — v3-identity-spec §4.2 as written) and both minters persist
`pack(verified rows)` as the canonical (2026-08-04 audit hardening). **The old minters
(`0x00e92f01…441b3d`, `0x05bf9b9d…0069ac`) still hold MINTER_ROLE until the site cutover
completes; revoke is the final step.** The old wanderer minter holds 2 partial-path
segments owned by `0x378b9c3c…d94f014` that the revoke orphans (no escrow at risk).

## Transactions (all strkd-approved by Henri, block ~12,553,9xx)

- Funding: `0x13a56413cbceb05fdca393722448563efa17dd94d889ee4a82c0246aacb2750` (20 STRK) +
  `0x7dba5370d7b1cde98eab4779e3b0122e4f900f36fab888a274f5b11800469c7` (302 STRK, after Henri
  topped up the manager). Account deploy: `0x3295be1c4044a8f60e8d18ce0934c58133ca6c49b337d563a46cfdfb38c3198`.
- Declares (biggest-first, TIGHT custom bounds — see fee notes):
  LifeformsV3 `0x2f6d895e50ba1d80e9b8a39663d338381593e6f6b75e90222849d3e1d03c94` ·
  WanderersV3 `0x305aca5fb83a8aacca74ef2e56d6d5983bb5c6d05ca725f7ad54ab522ec4200` ·
  PetBonds `0x3fe7722a91488f6bdedd8cbdeef3f7d403abb47dd2dd4370ccb1c870aaaae9a` ·
  LoopMinterV3 `0x5ec7c6d5dd484230598ecf1122e85fdc3d9482ea65c4d28c8ef2b500a3f2f7b` ·
  WandererMinterV3 `0x362eeff9b9b7aec916a6955567fbdd861bf9523e676486af267fd67e172ce41` ·
  Nutrient `0x622f71b2e3fa4cd986213cded2e735e5ee96209d77daea0225ed2280e06b876`.
- **Deploy + wiring, ONE multicall** (12 calls): `0x4c37dfbe1dd9047241ec3f210a03ee136936ffbfec96e86fcf23dc9d9fcf020`
  (block 12,553,924, fee 1.20 STRK). UDC `deployContract` ×6 with **salt `gol_v3`, unique=0** —
  addresses precomputed from (salt, class_hash, calldata) so later constructors/wiring reference
  earlier contracts in the same tx — then `NUT.grant_role(MINTER_ROLE, LifeformsV3)`,
  `NUT.grant_role(MINTER_ROLE, PetBonds)`, `LifeformsV3.grant_role(MINTER_ROLE, LoopMinterV3)`,
  `WanderersV3.grant_role(MINTER_ROLE, WandererMinterV3)`, `NUT.approve(LifeformsV3, 1 NUT)`,
  `NUT.approve(WanderersV3, 1 NUT)`.

## Genesis

The `GolLifeformsV3` constructor genesis-minted the **empty grid** ("death", the vacuum every dead
creature settles into) to the deployer — token id
`0x2d9fc289c9a2cf292a3000a46579a8a53a67b1f9cdd485d86ecacfdc45d0e4`, nonce 1, escrow 0,
`minted_at`/`discoverer` stamped. **Verified: the SDK's `tokenIdForRows(empty)` equals the minted
id exactly** — the Rust ↔ Cairo orbit-canonical conventions agree on mainnet, same proof shape as
Sepolia's blinker.

## Post-deploy verification (2026-07-31, read-only)

- Class hash at each address matches its declare ✓ (6/6).
- All wiring events in the deploy receipt: 4 × `RoleGranted(MINTER_ROLE)`, 2 × `Approval(1 NUT)`,
  NUT supply mint, genesis `Transfer` + `NewLifeForm` ✓.
- **`token_uri(genesis)` survives a real `starknet_call` on the mainnet public node** and carries
  the static `image` (base64 SVG) + `animation_url` — the metadata-`image` upgrade is live on
  mainnet from day one (the Sepolia classes remain the pre-image versions; see STATUS item).
- wasm SDK smoke on mainnet: `recentTokenIds` finds the genesis via event scan (deploy_block
  12_553_900), `lifeform()` decodes it (still, loop, dead), `nutBalance(creator)` = 1 NUT ✓.

## Fee notes (for the next mainnet declare)

Total spent ≈ **306 STRK** (declares ≈ 305 actual at 35.1 gfri l2-gas price: 105.8 + 100.4 + 34.9
+ 32.0 + 32.0 + 21.5; deploy multicall 1.2). Two traps and their fixes:

- The node's **auto fee bounds pad ~2.2×** over the estimate and the balance must cover the
  *bound*, not the fee — with a tight budget, estimate first (`starknet_estimateFee`, unsigned +
  `SKIP_VALIDATE`) and pass **explicit resource_bounds ≈ 1.15× amount / 1.2× price** to strkd.
- Declare **biggest classes first** while the balance is at its peak; declares are independent
  and idempotent (skip-if-declared), so a mid-sequence stall is always resumable.

Leftover STRK stays in the agent account (~17 STRK after everything).

## Governance / follow-ups

- `DEFAULT_ADMIN_ROLE` on all contracts = the strkd agent account (seed on Henri's machine).
  The pre-mainnet STATUS items — external audit, admin hand-off / immutability endgame — were
  **consciously deferred by Henri** ("let's deploy", 2026-07-31); the 2026-07-29 deep
  cairo-auditor pass (no finding ≥75) is the audit basis for launch.
- Sepolia stays live and untouched (the app no longer points at it); v2 also untouched.
- Genesis reseed / first living creature: the deployer holds exactly 1 NUT — enough escrow for
  one period-1 (still-life) mint whenever Henri wants a first living creature.
