# Mainnet migration runbook — perf/stepper-gas classes

> Written 2026-08-04 after the **full Sepolia dress rehearsal** (below). Every motion in
> this runbook was executed end-to-end on a disposable Sepolia stack the same day. The
> class hashes are network-independent: the mainnet declares produce the same hashes.

## What ships

| Class | class_hash | compiled_class_hash |
|---|---|---|
| GolLifeformsV3 (upgrade in place) | `0x1c4cb60804ee32b7f749c2500be2af3aac1065c5171039a3078fac624fe4317` | `0x7ff947d1ab91cb5d9722bdd1ac8140803f272f737fc63fee3eb04de0873ca35` |
| GolWanderersV3 (upgrade in place) | `0x4e05202f7ed69bf1692d9651fc533cc116fc3cf2eae18362f7e6ad6859afed8` | `0x1579b6c951009867ec64ca207e83dc3d5be022e9b995d3d1d2dc5d6c4d1cec3` |
| GolLoopMinterV3 (redeploy) | `0x1e9641b248f28fc917da733d5d13e6fc9957c5c6a59bc41c873443b125f253c` | `0x1f3576dededc68d3faad0413eac8f9173166b35ff6837a64d271c80f9a0dce8` |
| GolWandererMinterV3 (redeploy) | `0x1e078956b4af09e9a60a6a187c3817dd7e3ded3de53d82a097763b16e760470` | `0x29211a3bd4c9022a0226802b10c79438bac8b0a8ce2d3236bd4d474c608467c` |

Source: `main` at `173764c` (perf/stepper-gas merged: −56% stepper, drawn-anchored loop
witness, canonical re-pack hardening). **The new SDK emits drawn-relative k, which
REVERTS on the old loop minter — SDK/wasm and the loop-minter cutover must ship together.**

## Measured on the rehearsal (Sepolia, real receipts, modern account)

| | old classes | new classes |
|---|---|---|
| feed, marginal per generation | **2,600,839** | **1,128,745** (−56.6%) |
| blinker mint (period 2) | 21.8M | 17.3M (k=1) |

State carry after the in-place upgrade verified exactly: a creature minted and fed on the
old class had `age`/`current_state` bit-identical to the off-chain reference after the
upgrade, and kept evolving identically (the stepper is consensus-identical by design).

## Mainnet sequence

Admin/deployer: strkd agent **gol-mainnet** `0x0062e08b…2118` (holds DEFAULT_ADMIN_ROLE
everywhere). All txs through strkd; the client's auto-approval grant covers signing.

0. **Preflight**
   - Scan `PartialPathCreated` (key `0x3c8fe243b782ebb4a3c99c56135ee0b394867e70c16a5344a2dc776c14d3b29`)
     on BOTH mainnet minters — registered partial paths are orphaned by the swap. (Sepolia
     had 23, all our own smoke tests.)
   - Check gol-mainnet STRK balance: declare fee **bounds** must clear one at a time
     (~35–100 STRK actuals on Sepolia, 261 total; bounds higher — fund ahead like July).
   - strkd needs a working mainnet RPC (the SNF node rate-limits; publicnode also has
     mainnet: `https://starknet-rpc.publicnode.com`).
1. **Declare** the 4 classes, biggest first (Lifeforms, Wanderers, WandererMinter,
   LoopMinter). Gotchas (all hit in rehearsal, all in `scratchpad` scripts):
   - strip `sierra_program_debug_info` from the artifact — the node rejects unknown fields;
   - abi string must be `hash.formatSpaces(json.stringify(abi))` (starknet.js ≥v9) or the
     declare fails `__validate__` with 'invalid signature';
   - pass an explicit `nonce` fetched fresh and wait for nonce advance between txs.
2. **Upgrade multicall**: `lifeforms.upgrade(new)` + `wanderers.upgrade(new)`. Feeds get
   cheap immediately; existing creatures unaffected (verified).
3. **Deploy + grant new minters** (one multicall): UDC deploy LoopMinter(lifeforms addr)
   and WandererMinter(wanderers addr), then `lifeforms.grant_role(MINTER_ROLE, newLM)` +
   `wanderers.grant_role(MINTER_ROLE, newWM)`. **Do NOT revoke the old minters yet** —
   the live site still mints through them.
4. **Ship the SDK/site**: SDK `Network::Mainnet` address book (new minter addresses +
   deploy blocks for event scans), wasm rebuild, site deploy. Verify a live mint.
5. **Revoke the old minters** (one multicall): `revoke_role(MINTER_ROLE, oldLM/oldWM)`.
   Verified in rehearsal: a revoked minter's mint estimate reverts on the missing role.
6. **Verify + record**: k>0 mint via the site or SDK, feed receipt, update
   `mainnet-deployment.md` with addresses/class hashes/txs the same session.
7. **Post-deploy follow-ups**: raise `FEED_CAP` 82 → ~190 (new legacy-metered worst case
   ≈ 1.129M × 5.28 ≈ 5.96M/gen against the 1.2B wallet cap) — but only after ONE real
   legacy-account (Ready/Argent) feed receipt confirms the multiplier carried over.

## Sepolia rehearsal record (2026-08-04)

Disposable stack, admin = strkd agent account `probe-deployer`
`0x073376cdc34ecb1b013a4b0489fde3511922767bcc14aa41322388a23992ec39`; ~272 STRK spent
(261 declares + deploys/invokes), 78.7 STRK returned-to-idle. Old classes = the 2026-07-06
Sepolia v3 classes; fresh NUT (100 NUT to admin).

| Contract | Address |
|---|---|
| NUT (fresh) | `0x49eb2079bc556c7b50318511e2c1be4521fccf81bb48b6ae88e7e8042df2df3` |
| Lifeforms (old→upgraded in place) | `0x25f8de97b57c650fc670e929b12b7e1b3dd26221fe7cc17302e25215bfa7448` |
| Wanderers (old→upgraded in place) | `0x591a67f018c6d6221cf3055eeb7f12f7da24e8b960ad3ffbb47ddd3a1cb92c7` |
| LoopMinter old (revoked) | `0x253064623754ae322278ef230e0198556bfed618eb3b00a4b59478026e773da` |
| WandererMinter old (revoked) | `0x37d3e07fd87378cf289175d628c2accc3d82f045d4d923fec95aaf3a5d3414f` |
| LoopMinter NEW | `0x4cabacb6e34280188009c6de2e55af6c4bf92b1fbefcd51a1521bc3716f9003` |
| WandererMinter NEW | `0x4f87c4322e10c73cb6f467fe83c89c4f65687cb85c276f71bf7094da00942bf` |

Key txs: stack deploy `0x48e6fecf…5dad`; upgrade `0x7e5dc527…f965a`; minter swap
`0x2308ce05…b5c`; k=1 drawn-anchored mint `0x1ae34bd6…f49f`
(token `0x6bdfddaa…bfe2`, drawn = blinker phase B — the non-time-min — preserved for
display; witness `translate(2,4)` verified from `step^1(drawn)`).

Tooling notes: strkd Sepolia RPC repointed to publicnode (the SNF node rate-limits and a
sign-only workaround was blocked by a strkd `-32006` precondition bug — issue report
generated via `companion_reportIssue`). The JS grid helpers used for witnesses were
validated against the on-chain genesis blinker token id before any tx.
