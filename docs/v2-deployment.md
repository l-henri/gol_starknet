# GoL v2 — Sepolia Deployment

**Network:** SN_SEPOLIA · **Deployed:** 2026-06-22 · **Admin/deployer:** `0x026d87a881bc82eb038c4cc214fbccd16ea72b424b523a7b2b2551a2e495e70f` (strkd `gol-bench`)
**RPC:** `https://sepolia.nodes.starknet.org/rpc/v0_10` · **UDC:** `0x041a78e741e5af2fec34b695679bc6891742439f7afb8484ecd7766661ad02bf` · **deploy script:** `/tmp/goldeploy/deploy.mjs` (strkd-driven)

Fresh v2 collection (separate from v1). NUT is a **fresh** token (1,000,000 NUT minted to the admin). Deployed via strkd (sign + broadcast), starknet.js v10 for class hashes / UDC / calldata.

## Addresses

| Contract | Address | class_hash |
|---|---|---|
| Nutrient (NUT) | `0x60e0a0bd9aafec5fd0346e49eb4c5c47f9c7d6b7f26c705aaf21fd53a84e2c9` | `0x2aa46c9ab8759fd7706e8b52add7fd7eb68e2636b01e1c1865f47542793115a` |
| GolLifeformsV2 | `0x40380471b403f52ac0ed6e674b391de268f83a8a1778d236bb7acc090c4e633` | `0x8b321952b39e032cd471e195af245bf1315d69f61093af34313838d758ded9` |
| GolLoopMinterV2 | `0x024564a234b1bd49aea38efbaf99a0c6d5dc1269fa7fc5ad86ef8f924ea030` | `0x44ecdbfdae4c3a76ff2e864a8e328d4100ba9bc5721486f2d09daebb16e6e97` |
| GolPathMinterV2 | `0x5a3c3aff6117aa8061aa971552c14e2502429a7a9360661daa409f2d510c29f` | `0x18049528f9d02ba0a403d630ec9bb55d6d68d7dd0314344c6a552c4ec5f022b` |

## Wiring (done)
- `NUT.grant_role(MINTER_ROLE, GolLifeformsV2)` — lifeforms can mint NUT on `move_lifeform_forward`.
- `GolLifeformsV2.grant_role(MINTER_ROLE, GolLoopMinterV2)` + `(…, GolPathMinterV2)`.
- NUT address set in the `GolLifeformsV2` constructor (audit fix #2).

## Seed
- `GolLoopMinterV2.mint_loop(<canonical blinker GridState>, 2, admin)` — one live loop lifeform.
  - mint tx `0x3d43b1e5a52804d8e5d1c330c43ff09f46b17a96ec63e3c7c2af5134e5e19b5`.

## Verification (on-chain reads)
- `owner_of(token_id)` = the admin ✓ — the seeded lifeform minted correctly.
- `get_render_params(token_id)` = `{ bg: 0x810da8, cell: 0xd9416, speed: 105 }` ✓ — matches
  `derive_params(token_id)` exactly (cell = token_id low 24 bits, bg = next 24, speed in [1,200)).
  The A-heuristic ran at mint.
- `token_id` = `0x743d91e948cc844ef3e08dc46ede35fe5ea085981a0176d3203810da80d9416` (matches off-chain Poseidon).

### ⚠️ FINDING: `token_uri` reverts `Out of gas` on a node view call
`token_uri(token_id)` reverts with `Out of gas` (`0x4f7574206f6620676173`) on the SNF node's
`starknet_call`. The on-chain HTML + double-base64 render (~162M gas in snforge, with a raised step
limit) exceeds the node's view-call gas budget — so wallets/marketplaces calling `tokenURI` will
fail. This is the live form of the P5 token_uri-cost concern; the JS rework made the payload
density-independent but it's still too heavy to execute as a view here. **Must fix before the NFT
is viewable.** Options: skip the outer JSON base64 (return `data:application/json,<urlencoded>`),
trim/precompute the HTML template, or split the render. Needs design — not deployed-around.

## Notes / gotchas hit during deploy
- Declare requires the contract-class `abi` as the **canonical `formatSpaces` string** (decimal/raw array → node error `invalid type: sequence, expected a string`).
- strkd calldata must be **hex felts** (`num.toHex`), not decimal (error `114: invalid felt`).
- The `GolLifeformsV2` declare bound was ~117 STRK (actual ~50) — funded the agent 200 STRK from the manager first.
- Sierra 1.8.0 declares went through the default SNF node fine (the older "node can't compile 1.8.0" issue did not recur).
