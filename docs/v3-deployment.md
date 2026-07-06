# GoL v3 — Sepolia Deployment

**Network:** SN_SEPOLIA · **Deployed:** 2026-07-06 · **Admin/deployer:** `0x026d87a881bc82eb038c4cc214fbccd16ea72b424b523a7b2b2551a2e495e70f` (strkd agent `gol-bench`)
**Identity model:** orbit-canonical token ids ([v3-identity-spec.md](v3-identity-spec.md)).
**NUT reused** from v2 (`0x60e0a0bd…4e2c9`); v2 collections stay live but are superseded.
Deploy script: scratchpad `goldeploy/v3deploy.mjs` (strkd-driven; UDC salt `gol_v3`, unique=0).

## Addresses

| Contract | Address | class_hash |
|---|---|---|
| GolLifeformsV3 ("Digital Bacteria" / BACT) | `0x1e8e1c75f960faebd6f24c4321aad2f76e54dce00d11d690cb58ff1666ceec` | `0x4d153ec408b8c0cae802f2f9eb1306dcbb40894ac0c8dfe6d7a496cc25517d7` |
| GolLoopMinterV3 | `0x351576a60a9f0423784e0bd2d5e4e630f4b21f49a0b55cf89045e8e1006f3ba` | `0x5a6a0a531e70ec4037c6c1451052ee58080d771a8191d493057ce0f923a8e5c` |
| GolWanderersV3 ("Digital Wanderers" / WNDR) | `0xd43450e4cc02677b193f0a0f25daf1a85a1fcb1071d24674c1db485763042c` | `0x73150b537ab74cff9d0accd0eca361d1ce33180bf9278416344564e0d571386` |
| GolWandererMinterV3 | `0x6d00789bc1808e41fe708aad5f76c978585f184f9a7931f7bb6300c52f23573` | `0x3713ea370d460957014cc4b56ad7d7cbaa5f3fde485a73e9ebbea7d695bd91f` |

## Wiring (one multicall, tx `0xaaeba1ef…871114`)
- `NUT.grant_role(MINTER_ROLE, GolLifeformsV3)` — the feed faucet.
- `GolLifeformsV3.grant_role(MINTER_ROLE, GolLoopMinterV3)`.
- `GolWanderersV3.grant_role(MINTER_ROLE, GolWandererMinterV3)`.
- Admin approved 100 NUT to each NFT (mint escrows).

## Genesis seed (smoke test — reseed of v2 creatures DEFERRED per spec §3)
- `mint_loop(blinker drawn @ row 5, period 2, canonical, g=(d4 0, dr 35, dc 40), k 0)` —
  tx `0x44f93167e47266277ced1ad2b5034114441278db58aaa3bcfd2b14d9cea2d3b`.
- Token id `0x7d4eec5dea95c8a4cf6c781f7c8a7d75c3f05a384bb710a10bcc3ff7ddc4b9`
  (= Poseidon of the TRUE orbit canonical, computed by the SDK's `loop_family_canonical`).
- Verified on-chain: owner = admin; **escrow = 2 NUT** (per-token, the fraud-proof bounty);
  stored canonical matches the SDK's exactly (**Rust ↔ Cairo symmetry conventions agree
  on-chain** — the witness check passed); mint nonce = 1.
- Funding note: declares' fee **bounds** (~156 STRK each) exceeded the agent's 144 STRK even
  though actuals are far lower; funded +300 STRK via `companion_requestFunding` (needs
  `submit: true` — sign-only is the default; it always prompts the operator).

## Pet bonds (deployed 2026-07-06)

The caretaker layer ([pet-mechanism-spec.md](pet-mechanism-spec.md)) — petting = one ceremonial
feed with NUT to the petter, 7-day lapse, permissionless 1-NUT reaper, daycare transfers with the
clock riding along.

| Contract | Address | class_hash |
|---|---|---|
| GolPetBonds | `0x59878490847be8f32e539e60d9cbe849b2b6c77f750ae381236242388f6e337` | `0x7b82f4fc5bd7da93940d0a6f27d538273d7a34043c8fc035137e265f55cb1a2` |

- Wiring: `NUT.grant_role(MINTER_ROLE, GolPetBonds)` (the reap reward), tx `0x338e5d31…2e60f`.
- **Live smoke test:** the agent petted the genesis blinker (tx `0x585e3d12…8c6db`) —
  bond balance 1, `last_pet` stamped, creature breathed one generation.

## Remaining v3 work
- SDK: v3 write-builders (witness mints, `prove_malformed`) + WASM; address book entry.
- Frontend: repoint `.env`/config to v3, thread the witness through `useMint`, duplicate-mint UX.
- The tiled long-loop mint's phase-segment flow is implemented but not yet exercised on-chain.
- Pets: SDK/WASM bindings (pet/reap/transfer_bond, lapsed-bond scan), garden UI clocks + reaper
  feed, caretakers leaderboard.
