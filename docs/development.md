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

## Deploying

`scripts/deploy_full.ts` declares + deploys all four contracts, wires the `MINTER_ROLE`
grants, and sets the nutrient address. Run it from the repo root with a funded account:

```bash
# set DEPLOYER_ADDRESS, DEPLOYER_PRIVATE_KEY, RPC_ENDPOINT in a root .env
scarb build
npx ts-node scripts/deploy_full.ts   # prints the four addresses
```

Then paste the addresses into `ui/game-of-life/.env.local`.

⚠️ **Caveats to fix before relying on this:**
- `deploy_full.ts` ends with a hardcoded **test mint** (`mint_loop("1073856514", 60, …)`) —
  review/remove it for a real deploy.
- The root `package.json` `deploy` script points at a non-existent `scripts/deploy.ts`; use
  the `npx ts-node scripts/deploy_full.ts` command above.

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
