# Game of Immortal Lifeforms — Web App

Next.js frontend for the on-chain Game of Life. Draw a pattern, let it run to find
its fate (a loop or death), connect a Starknet wallet, and mint discovered loops as
NFTs.

## Setup

```bash
npm install
cp .env.local.example .env.local   # then fill in the contract addresses
npm run dev                         # http://localhost:3000
```

## Deploying the contracts (one-time)

The frontend talks to four contracts. Deploy them from the repo root with a funded
Starknet account, then paste the printed addresses into `.env.local`.

```bash
# from the repo root
scarb build
# set DEPLOYER_ADDRESS, DEPLOYER_PRIVATE_KEY and RPC_ENDPOINT in a root .env, then:
npx ts-node scripts/deploy_full.ts
```

`deploy_full.ts` declares and deploys Nutrient, GolLifeforms, GolLoopMinter and
GolPathMinter, wires up the `MINTER_ROLE` grants, and prints each address. Copy them
into `.env.local`:

```
NEXT_PUBLIC_RPC_URL=...                # same network you deployed to
NEXT_PUBLIC_LIFEFORMS_ADDRESS=0x...
NEXT_PUBLIC_NUTRIENT_ADDRESS=0x...
NEXT_PUBLIC_LOOP_MINTER_ADDRESS=0x...
NEXT_PUBLIC_PATH_MINTER_ADDRESS=0x...
```

Until the addresses are set, the simulation still runs locally; on-chain actions are
disabled with a notice.

## Architecture

- `src/lib/contracts.ts` — addresses (from env), RPC provider, ABIs, contract factories.
- `src/lib/wallet.tsx` — `WalletProvider` / `useWallet` (wallet connect via `get-starknet`).
- `src/lib/useGol.ts` — on-chain actions: `mintLoop`, `moveForward`, `getNutBalance`.
- `src/components/game-of-life/` — the interactive grid + fate finder.

ABIs in `src/lib/abi/` are extracted from `target/dev/*.contract_class.json`; re-extract
them after changing the contracts.
