# Status

> Snapshot of where the project stands. Keep this short and current — rewrite it each session.
> History lives in [LOG.md](LOG.md); the plan lives in [ROADMAP.md](ROADMAP.md).

**Last updated:** 2026-07-31
**Framing:** WIP **art piece**, not a commercial product — the outcome is burning gas and creating art.

## 🎉 MAINNET (2026-07-31)

**The v3 stack is LIVE on Starknet mainnet and the production site points at it.** Six contracts
(fresh NUT · LifeformsV3/BACT · LoopMinterV3 · WanderersV3/WNDR · WandererMinterV3 · PetBonds)
declared + deployed + wired via strkd — one deploy multicall, total ≈ 306 STRK, every address/
class hash/tx in [mainnet-deployment.md](../mainnet-deployment.md). The mainnet classes are the
POST-Sepolia ones: mint provenance, `pet()` CEI fix, and `gol_metadata_v2` **with the static
`image`** — verified end-to-end (`token_uri` executes on the mainnet public node, image present),
so the wallet-render gate that still blocks Sepolia is CLOSED on mainnet. Genesis = the **empty
grid** minted by the constructor to the deployer; its id matches the SDK's `tokenIdForRows(empty)`
exactly (Rust ↔ Cairo proof on mainnet). NUT initial supply is **1 NUT** (Henri: death is free at
deploy; 1 NUT = one period-1 escrow to seed the first living creature). Admin/creator = strkd
agent `gol-mainnet` (`0x0062e08b…2118`); external audit + admin hand-off consciously deferred —
the 2026-07-29 deep cairo-auditor pass (no finding ≥75) is the launch basis. See LOG 2026-07-31 (4).

**Frontend/SDK repointed same session:** SDK `Network::Mainnet` address book (deploy block
12_553_900) + wasm rebuilt; app `NETWORK="mainnet"`, chain checks derive from it
(`onAppChain`/`switchToAppChain`), `REF_TOKEN_ID` = the mainnet genesis, copy network-neutral.
⚠️ **No wallet click-through on the live mainnet site yet** — mint/breathe with real funds is
unverified in a browser (as is the 2026-07-31 breath basket, on any network).

**Build/test:** `scarb build` ✅ · `snforge test` ✅ (91, +11 ignored benches) · `cargo test -p gol-sdk` ✅ (44) · `next build` ✅ · `tsc` ✅
**Live site:** https://gol-starknet.vercel.app — Vercel auto-deploys every push to `main`; the mainnet flip ships with this session's push.
**Tx tooling:** all on-chain transactions via **strkd** — pair `gol-bench` + `kind:"agent"`; per-request `chainId` (felt, e.g. `0x534e5f4d41494e`); never sncast/raw keys. Mainnet fee craft (tight bounds, biggest-first declares) in [mainnet-deployment.md](../mainnet-deployment.md).

## Recent (still fresh)

- **2026-07-31 breath basket:** breathe taps across MULTIPLE creatures bundle into ONE multicall
  (`lib/breathBasket.tsx`, BreatheControl rewritten, `useBreathe.ts` deleted); cap = bundle sum;
  route change discards un-sent taps. Needs a live click-through (2 creatures → one prompt).
- **2026-07-31 /pets perf:** wallet-scoped sweep + batched `bondStatuses`/`lifeformsBatch`
  (one JSON-RPC round-trip each), progressive render. See sdk-decisions 2026-07-31.
- **2026-07-31 copy pass:** em dashes gone, "…go on living forever" thesis, "Oldest
  loops"/"Oldest wanderers" boards.
- **2026-07-29 audit:** deep cairo-auditor over all 25 contracts — no finding ≥75; `pet()` CEI
  fixed; v1 minter source removed. LOG 2026-07-29 (4).

## Where the product is

- **Mainnet v3 is the live product line** — orbit-canonical ids, witness mints, escrowed
  fraud-proofs, pets. [mainnet-deployment.md](../mainnet-deployment.md).
- **Sepolia v3** stays deployed (2026-07-06 classes — PRE-provenance/image; the app no longer
  points at it). Upgrade to the mainnet classes only if a testnet mirror is wanted:
  [v3-deployment.md](../v3-deployment.md). **v2** superseded but live: [v2-deployment.md](../v2-deployment.md).
- **Frontend** (`ui/game-of-life`): petri redesign complete, English-only;
  [frontend.md](../frontend.md).
- **Specs ready to build:** [leaderboards.md](../leaderboards.md) backlog;
  [audience-research.md](../audience-research.md) plays (Seed Grant, genesis bestiary, essay).

## Next up

1. **Henri's mainnet browser pass** — connect on the live site, mint the first living creature
   (deployer holds exactly 1 NUT = one period-1 escrow), breathe it, check /pets + /leaderboards;
   exercise the breath basket (tap 2+ creatures → ONE prompt).
2. Governance: decide the admin hand-off / immutability endgame for the mainnet contracts
   (currently: strkd agent account holds DEFAULT_ADMIN_ROLE everywhere).
3. Outreach package (audience-research plays): manifesto essay, genesis bestiary, no-wallet share
   loop, Seed Grant (check SNF conflict-of-interest).
4. Decide Sepolia's fate: upgrade its classes to the mainnet versions (image metadata,
   provenance) as a mirror, or freeze it as history.
5. Exercise the tiled phase-segment loop mint on-chain (now on mainnet).
