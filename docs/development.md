# Development

How to build, test, run, deploy, and maintain the project. For the *what/why* of the
contracts see [technical-overview.md](technical-overview.md); for the web app see
[frontend.md](frontend.md).

## Toolchain

Versions are pinned in [`.tool-versions`](../.tool-versions) (read by the CI actions and by
`asdf`):

| Tool | Version |
|------|---------|
| Scarb / Cairo | 2.18.0 |
| Starknet Foundry (`snforge`) | 0.60.0 |
| Node | 20+ (built with 24) |

Contract dependencies (in [`Scarb.toml`](../Scarb.toml)): `starknet` 2.18, `openzeppelin` 3.0,
`snforge_std` 0.60.

## Contracts: build & test

```bash
scarb build          # compiles to target/dev/*.contract_class.json
snforge test         # runs tests/ (8 tests: grid utils + mint flows)
```

The Cairo source lives in `src/`:

| File | Role |
|------|------|
| `lib.cairo` | module declarations |
| `interfaces.cairo` | all `#[starknet::interface]` traits + `LifeFormData` / `PartialPathData` |
| `gol_utilities.cairo` | the on-chain Game of Life engine (pack/iterate/loop detection) — a component |
| `gol_lifeforms.cairo` | the ERC721 NFT; embeds the utilities component; charges/rewards NUT |
| `gol_nutrient.cairo` | the NUT ERC20 token |
| `gol_loop_minter.cairo` / `gol_path_minter.cairo` | validate patterns and mint lifeforms |
| `gol_metadata.cairo` / `base64.cairo` | on-chain `token_uri` rendering (grid → SVG + ERC721 JSON, base64-encoded) |

Tests live in `tests/` and deploy the full contract graph (mirroring `deploy_full.ts`).
See [project-management/ROADMAP.md](project-management/ROADMAP.md) for known test gaps
(partial-path flows).

## Frontend: run & build

```bash
cd ui/game-of-life
npm install
cp .env.local.example .env.local   # fill in addresses after deploying
npm run dev      # http://localhost:3000
npm run build    # production build = compile + type-check + lint
```

`npm run build` is the frontend's correctness gate (there is no test runner yet — see
[ROADMAP](project-management/ROADMAP.md)). The Game of Life core can be sanity-checked
directly with Node's TypeScript support, e.g. a throwaway script importing from
`src/lib/gameOfLife.ts` and asserting known patterns (block, blinker, L-tromino).

## ABIs: keeping the frontend in sync

The frontend's `src/lib/abi/*.json` are extracted from the compiled contracts. **After any
contract change, rebuild and re-extract:**

```bash
scarb build
cd ui/game-of-life
node -e '
const fs=require("fs"), path=require("path");
const base=path.resolve("../../target/dev");
const map={golLifeforms:"gol_starknet_GolLifeforms",nutrient:"gol_starknet_Nutrient",golLoopMinter:"gol_starknet_GolLoopMinter",golPathMinter:"gol_starknet_GolPathMinter"};
for(const [out,src] of Object.entries(map)){
  const abi=JSON.parse(fs.readFileSync(path.join(base,src+".contract_class.json"))).abi;
  fs.writeFileSync(path.join("src/lib/abi",out+".json"), JSON.stringify(abi,null,2));
}'
```

## Transaction & signing tooling — use strkd, not sncast

**Policy (2026-06-16): every on-chain transaction — declare, deploy-account, invoke, and
SNIP-36 proof-carrying verify — goes through the [strkd](../docs/strkd-feedback.md) wallet
companion.** strkd holds the accounts and signs on our behalf; each sensitive action pops an
on-screen approval the human must accept, and **private keys never leave the wallet**.

Do **not** use `sncast` for transactions, and do **not** use the raw-private-key
`scripts/deploy_full.ts` path (below). Both require a private key in the agent's reach; strkd
exists specifically to avoid that. The one historical reason to fall back to `sncast` — the
proof-carrying verify tx, which old strkd couldn't submit — is gone: `wallet_addInvokeTransaction`
now accepts `proof_facts`/`proof` (the feature request in
[strkd-snip36-feature-request.md](strkd-snip36-feature-request.md) landed).

strkd is a local loopback JSON-RPC service. Learn the API with `GET /` (it returns a full usage
doc); discover the port from `port.lock` in the app data dir. The current local instance is at
`http://127.0.0.1:54483`. Typical flow:

1. **Pair once** — `companion_requestPairing { name, kind:"agent" }` (persists across restarts;
   re-attach with the same name + `reattach:true` to recover the client and its accounts).
2. **Account** — `companion_createAgentAccount` (or reuse an existing one via
   `companion_listAccounts`). New accounts are counterfactual until deployed.
3. **Fund** — `companion_requestFunding { amount }` (fri); always prompts (it spends the user's
   manager account).
4. **Deploy the account** — `companion_deployAccount`.
5. **Invoke** — `wallet_addInvokeTransaction { account_address, calls, submit:true }`, where each
   call is `{ contract_address, entry_point_selector (name or 0x), calldata }`. Sign-only by
   default (returns a broadcast-ready signed tx); `submit:true` broadcasts via strkd's node.
   For SNIP-36, pass `proof_facts` (sign time) + `proof` (broadcast) and explicit `resource_bounds`.

Every call needs headers `X-Companion-Client` and (after pairing) `Authorization: Bearer <token>`.
A node must be configured in the strkd app for the active network to broadcast/estimate; without
one strkd is sign-only and you broadcast the returned tx yourself.

## Deploying

> The four production contracts were deployed to Sepolia via `sncast` in 2026-06 (see
> [STATUS](project-management/STATUS.md) for addresses). **For any future declare/deploy, use
> strkd** (above), not the legacy paths below. `scripts/deploy_full.ts` is retained for reference
> only and should be migrated to strkd or removed before mainnet.

Legacy reference — `scripts/deploy_full.ts` declares + deploys all four contracts, wires the
`MINTER_ROLE` grants, and sets the nutrient address:

```bash
# set DEPLOYER_ADDRESS, DEPLOYER_PRIVATE_KEY, RPC_ENDPOINT in a root .env
scarb build
npx ts-node scripts/deploy_full.ts   # prints the four addresses
```

Then paste the addresses into `ui/game-of-life/.env.local`.

⚠️ **Why this path is deprecated (and caveats if you ever touch it):**
- It needs a raw `DEPLOYER_PRIVATE_KEY` in a `.env` — exactly what the strkd policy avoids.
- `deploy_full.ts` ends with a hardcoded **test mint** (`mint_loop("1073856514", 60, …)`) —
  review/remove it for a real deploy.
- The root `package.json` `deploy` script points at a non-existent `scripts/deploy.ts`.

## CI

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs `scarb build` + `snforge test`
on every push/PR, using the versions from `.tool-versions`. The frontend is not yet in CI.

## Bumping dependencies

When upgrading OpenZeppelin / Starknet, expect breaking changes and migrate against the
compiler. Reference: the 0.20 → 3.0 OZ migration (interfaces moved to
`openzeppelin::interfaces::*`; ERC20 needs `use openzeppelin::token::erc20::DefaultConfig`;
dispatcher vars calling `ref self` entrypoints must be `let mut`). The fastest way to find
the new API is to read the OZ source in the Scarb cache
(`~/Library/Caches/com.swmansion.scarb/registry/src/...`).

## Keeping docs in sync

When you change code, update the matching doc in the same PR:

| If you change… | Update… |
|----------------|---------|
| Contract interfaces / behavior | [technical-overview.md](technical-overview.md) + the relevant minter/token doc |
| Frontend modules or data flow | [frontend.md](frontend.md) |
| Toolchain, build, deploy, CI | this file |
| Project status / plan | [project-management/](project-management/) (STATUS, ROADMAP, LOG) |
