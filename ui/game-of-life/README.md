# Digital Bacteria — web app

The web experience for the on-chain Game of Life (v2): a tended garden of autonomous
Conway creatures living on Starknet (Sepolia). Browse the gallery, draw a pattern and
watch it find its fate, spawn discovered loops as NFTs, feed creatures to earn **NUT**,
and tune the look of the ones you own. Bilingual **FR / EN**.

Built on the Rust **`gol-sdk`** compiled to WebAssembly: every chain read and all
calldata come from the SDK; signing stays in the wallet (the SDK never holds a key).

## Run

```bash
npm install
npm run dev          # http://localhost:3000   (predev builds the wasm SDK first)
```

`predev` / `prebuild` run `npm run wasm`, which compiles `crates/gol-sdk-wasm` with
`wasm-pack` and copies `gol_sdk_wasm.js` + `gol_sdk_wasm_bg.wasm` into `public/` — the app
loads them at runtime from there (bundler-ignored, so Next never tries to resolve the
`.wasm` asset). Prereqs: the `wasm32-unknown-unknown` Rust target and `wasm-pack`. Rebuild
the SDK after changing the Rust:

```bash
npm run wasm
```

> Heads-up: don't run `npm run build` (a production build) while `npm run dev` is live —
> it overwrites `.next/` and breaks the running dev server (`Cannot find module './NNN.js'`).
> If that happens: stop the dev server, `rm -rf .next`, then `npm run dev`.

## Config

The v2 contract addresses are **baked into the SDK** (per network) — there's nothing to
set for them. The only env var, optional:

```
# .env.local
NEXT_PUBLIC_GOL_RPC_URL=https://api.cartridge.gg/x/starknet/sepolia
```

Browser reads need a **CORS-enabled** Sepolia RPC. The default SNF node sends no CORS
headers, so the app defaults to the Cartridge gateway; override only with another https,
CORS-enabled endpoint. The same URL backs both SDK reads and the wallet provider.

## What's here

- **`/`** — the garden: a progressive gallery of every creature minted on Sepolia. A fast
  scan returns just the token ids; each card then hydrates itself, so creatures appear as
  they're detected instead of after one long wait.
- **`/create`** — draw a 41×41 pattern on the left; the right grid evolves it live via the
  SDK's on-chain stepper (matches the contract exactly). A 90s **slot-machine score**
  (Sequence / Loop / Amplitude) reveals *as the grid runs* — Sequence counts up, Amplitude
  tracks the live population swing, Loop spins like a reel until the grid reaches its loop,
  then locks. When it settles into a loop you can spawn it as an NFT.
- **`/life/[id]`** — a creature's page: the exact on-chain render (rebuilt locally, no
  per-view `token_uri` fetch), its traits, **feed it forward** (each generation keeps it
  alive and mints 1 NUT — batched into a single `move_lifeform_forward_n` tx), and, if you
  own it, **edit** its colours + speed.

The **FR / EN** switch lives in the header (choice persisted to `localStorage`; the browser
language is detected on first load).

## Architecture

See [`../../docs/frontend.md`](../../docs/frontend.md) for the module map, the SDK/wallet
data flow, the i18n pattern, and how the `/create` score + on-chain render artifact work.
