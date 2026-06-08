# Frontend (web app)

The web app lives in `ui/game-of-life/` — a Next.js 15 + React 19 + TypeScript app.
Users draw a Game of Life pattern, run it to discover its fate (a loop or death),
connect a Starknet wallet, and mint discovered loops/paths as NFTs.

For setup and the deploy → configure flow, see the app's own
[`ui/game-of-life/README.md`](../ui/game-of-life/README.md). This document explains the
*architecture* so you can extend it.

## Module map

```
ui/game-of-life/src/
├── app/
│   ├── layout.tsx              # wraps the app in <WalletProvider>; page metadata
│   ├── page.tsx                # renders <GameOfLife/> + <LifeformsPanel/>
│   └── comparison/page.tsx     # secondary "canvas vs render" demo route
├── components/
│   ├── game-of-life/index.tsx  # the main interactive grid, fate finder, mint actions
│   ├── lifeforms-panel.tsx     # "my lifeforms" list + token-id lookup + breathe-life
│   ├── grid-preview.tsx        # read-only render of a packed grid id
│   └── connect-button.tsx      # wallet connect/disconnect button
└── lib/
    ├── gameOfLife.ts           # PURE Game of Life core + computeFate() (no React, no chain)
    ├── contracts.ts            # env-driven addresses, RPC provider, ABIs, contract factories
    ├── wallet.tsx              # WalletProvider / useWallet (wallet connection state)
    ├── useGol.ts               # on-chain actions + reads (the only place that builds txs)
    └── abi/*.json              # contract ABIs extracted from target/dev
```

### Responsibilities

- **`lib/gameOfLife.ts`** — the deterministic engine, mirroring the Cairo logic
  (15×15 toroidal grid; cell `(row, col)` → bit `row*15 + col`). `gridToId` / `idToGrid`
  pack and unpack the `bigint` state id; `nextGrid` is one Conway step; **`computeFate(id)`**
  evolves a state until it cycles and returns `{ found, isLoop, loopLength, smallestLoopId,
  loopEntryId, generationsToLoop }`. It is pure (no React, no network), which is why it can
  be unit-tested in isolation and why the minting inputs are reliable.
- **`lib/contracts.ts`** — single source of config. Reads `NEXT_PUBLIC_*` env vars into
  `ADDRESSES` and `RPC_URL`, exposes the four contract ABIs, and builds read-only
  (`readContracts`) or wallet-connected (`writeContracts`) `Contract` instances.
  `isConfigured()` gates all on-chain UI.
- **`lib/wallet.tsx`** — `WalletProvider` holds the connected `WalletAccount`; `useWallet()`
  exposes `{ account, address, connect, disconnect, connecting }`. Connection is via
  `@starknet-io/get-starknet` (wallet selector modal) + `starknet`'s `WalletAccount`.
- **`lib/useGol.ts`** — the **only** module that constructs transactions or reads contract
  state. Actions: `mintLoop`, `mintPath`, `moveForward`; reads: `getNutBalance`,
  `getLifeform`, `listOwnedLifeforms`. Mints are multicalls (`approve` NUT + mint).

## Data flow

1. The user edits the grid (`<GameOfLife/>`); `gameId` is derived from the grid via `gridToId`.
2. **Find My Fate** calls the pure `computeFate(gameId)` once, synchronously, and stores the
   result. A short animation then walks the grid toward the loop (purely visual; detection is
   already done — this is the fix for the old stale-closure bug).
3. Minting uses the fate result:
   - loop → `mintLoop(smallestLoopId, loopLength, address)`
   - path → `mintPath(initialId, generationsToLoop, loopEntryId, loopLength, address)`
   Each first `approve`s the NUT cost to the lifeforms contract, then mints, in one multicall.
4. `<LifeformsPanel/>` reconstructs owned tokens from `NewLifeForm` events (the NFT is not
   Enumerable), reconfirms ownership via `owner_of`, and renders each one's `current_state`.

## Configuration & graceful degradation

All four contract addresses + the RPC URL come from env (`.env.local`, see
`.env.local.example`). With no addresses set, `isConfigured()` is false: the simulation still
runs locally and on-chain controls are hidden behind a "not configured" notice. Addresses are
**deploy-time** values printed by `scripts/deploy_full.ts`.

## Extending the frontend

- **Add a contract action:** add a function to `lib/useGol.ts` (the only tx-building module),
  built from `writeContracts(account)`; surface it in a component.
- **Re-extract ABIs after changing contracts:** see
  [development.md](development.md#abis-keeping-the-frontend-in-sync).
- **Render a state anywhere:** reuse `<GridPreview id={...} />`.

## Known limitations (keep honest)

- ⚠️ The wallet/mint/event code is **type- and build-verified only**; it has not been
  exercised against a live deployment yet (see
  [project-management/STATUS.md](project-management/STATUS.md)).
- Owned-lifeform enumeration scans `NewLifeForm` events from block 0; fine for testnet,
  but a production deployment should use an indexer (Phase 4 in the
  [roadmap](project-management/ROADMAP.md)).
- The `computeFate` search is capped (default 20,000 generations); pathological transients
  report "no loop found within N generations" rather than hanging.
