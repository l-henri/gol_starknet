# Frontend (web app)

The web app lives in `ui/game-of-life/` — a Next.js 15 + React 19 + TypeScript app, the
"Digital Bacteria" experience for the **v2** on-chain Game of Life. Browse the gallery,
draw a 41×41 pattern and watch it find its fate, spawn discovered loops as NFTs, feed
creatures to earn NUT, and tune the ones you own. Bilingual FR / EN.

It runs entirely against the live Sepolia v2 contracts through the Rust **`gol-sdk`
compiled to WebAssembly**: all chain reads + calldata come from the SDK; signing stays in
the wallet. For setup, see the app's own [`README`](../ui/game-of-life/README.md). This
document is the *architecture* — read it to extend the app.

## Module map

```
ui/game-of-life/src/
├── app/
│   ├── layout.tsx              # provider stack + header/footer + fonts + metadata
│   ├── page.tsx                # home: hero + <Garden/> (client, for i18n)
│   ├── create/page.tsx         # the editor: draw → live evolve → slot-machine score → spawn
│   └── life/[id]/page.tsx      # a creature's detail page (feed, owner-edit) + dormant bestiary route
├── components/
│   ├── Garden.tsx              # progressive gallery: recentTokenIds → a lazy card per id
│   ├── CreatureCard.tsx        # MintedCard / LazyMintedCard / BeastCard
│   ├── Creature.tsx            # canvas render bus — one rAF drives every creature, at its own speed
│   ├── GolCanvas.tsx           # the 41×41 grid canvas (editable on /create, else static)
│   ├── GardenHeader.tsx        # brand · FR|EN toggle · network pill · NUT chip · connect
│   └── SiteFooter.tsx
└── lib/
    ├── sdk.tsx                 # GolSdkProvider/useGolSdk — loads wasm, constructs the SDK
    ├── wallet.tsx              # WalletProvider/useWallet — connect, execute (sign+send), network
    ├── i18n.tsx                # LangProvider/useT/LangToggle — FR/EN copy
    ├── creatures.ts            # PURE Conway core (41×41): step, pack/unpack, population, colours
    ├── onchainRender.ts        # the contract's HTML renderer, rebuilt locally (no per-view token_uri)
    ├── useMint.ts              # discover-&-mint ritual (approve + mint_loop multicall)
    ├── useBreathe.ts           # feed ritual (move_lifeform_forward_n batch)
    ├── format.ts               # shortAddr, tokenIdDecimal, lifeformKind (bilingual), formatNut
    ├── config.ts               # RPC_URL (CORS gateway), NETWORK, explorerTxUrl
    ├── bestiary.ts             # known patterns (mostly dormant; see "bestiary" below)
    └── types.ts                # JsLifeform & friends (shapes returned by the SDK)
```

## Data flow

The hard rule: **the SDK reads and builds calldata; the wallet signs.** The SDK never
holds a key.

1. **Reads** (async, hit the CORS RPC via the wasm SDK): `sdk.recentTokenIds(n)`,
   `sdk.lifeform(id)`, `sdk.renderParams(id)`, `sdk.nutBalance(addr)`, `sdk.tokenUri(id)`.
2. **Local compute** (synchronous wasm, no network): `sdk.stepRows(rows)` (one on-chain-exact
   Conway step), `sdk.findLoop(rows, cap)`, `sdk.tokenIdForRows(rows)` (Poseidon id).
3. **Calldata builders** (synchronous, return JS call arrays): `sdk.mintLoopCalls(...)`,
   `sdk.breatheLifeCall(id, n)`, `sdk.setRenderParamsCall(...)`.
4. **Signing**: `useWallet().execute(calls)` → `WalletAccount.execute` (wallet popup) → tx
   hash → `waitForTx(hash)`. `useMint` / `useBreathe` wrap build → sign → wait, with a small
   status state machine (`idle | signing | pending | confirmed | error`).

`lib/sdk.tsx` loads the wasm-pack glue + module from `/public` at runtime (a
`webpackIgnore` dynamic import, so Next never bundles the `.wasm`), calls its init, and
constructs `new GolSdk(NETWORK, RPC_URL)`. `lib/wallet.tsx` connects via
`@starknet-io/get-starknet` + starknet.js `WalletAccount`, and **polls `chainId`** so a
wallet network switch is detected (the `networkChanged` event proved unreliable);
`switchToSepolia()` actively triggers the wallet's switch prompt.

### The local Conway engine (`lib/creatures.ts`)

A pure, DOM-free 41×41 Conway core used for previews and the rAF render bus. Rows are 41
bitmasks (row `r`, bit `k` = cell at `r,k`); each row `< 2^41`, exact in a JS number.
`step` matches the on-chain stepper, `fromRows`/`rowsFromCells` convert, `liveCountRows`
popcounts a state, `ageColor`/`ageToScale` drive the age gradient. Chain identity (the
token id) is the SDK's Poseidon hash, **not** this module's packing — use
`sdk.tokenIdForRows` for anything on-chain.

## Internationalisation (`lib/i18n.tsx`)

A deliberately small layer — no key files, copy lives at the call site:

```tsx
const { t, lang, setLang } = useT();
<button>{t({ fr: "Créer", en: "Create" })}</button>
```

`LangProvider` (in `layout.tsx`, outermost) holds the language; the default is `en` on the
server **and** the first client render (so hydration matches), then a mount effect applies
the saved choice (`localStorage["gol-lang"]`) or the browser language. The `LangToggle`
(FR|EN) is in the header. To add copy: call `useT()` in any client component and wrap the
string in `t({ fr, en })`.

Two non-component cases:
- **Pure helpers** can't call the hook, so `lifeformKind()` returns a `Dict` (`{fr, en}`)
  and the caller does `t(lifeformKind(lf))`.
- **Hooks** (`useMint`, `useBreathe`) call `useT()` and pass `t` into their `humanize(e, t)`
  error formatter (and list `t` in the callback deps; `t` is memoised on `lang`).

Intentionally left English: the on-chain `LIFEFORM_DESCRIPTION` (canonical, contract-bound)
and the SEO `metadata` in `layout.tsx` (server-rendered, no language preference available).

## The `/create` slot-machine score

A 90s casino score sits above the two grids and is revealed **live, as the right grid
advances** — never the final answer up front. Two sources drive it:

- `gen` — the live generation counter, incremented by the sim interval (which steps the
  right grid at the chosen speed; it only runs once there's a drawing).
- `fate` — computed ahead in a debounced (250 ms) effect that steps until the pattern
  loops or dies (cap **10,000** generations on the finite torus). Gives `steps` (transient
  length), `period`, and the canonical loop state for minting.

The score:
- **Sequence** counts up with `gen`, frozen at `loop.steps` once the grid settles.
- **Loop** is a reel that **spins** (CSS strip `translateY` animation) until the live grid
  reaches its loop (`gen >= steps`), then locks onto `period`.
- **Amplitude** is tracked in **real time**: each generation folds the population
  (`liveCountRows`) into running `popMin`/`popMax` refs; the displayed value is `max − min`
  so far. It resets with the drawing.

`settled = gen >= steps` drives the lock; `win` (settled on a real loop) blinks the marquee.
Digits use the **Press Start 2P** font (`--font-arcade`, loaded in `layout.tsx`).

## The on-chain render artifact (`lib/onchainRender.ts`)

`/life/[id]` shows the **exact** contract render without a per-view `token_uri` fetch (which
is gas-heavy and slow over RPC). The contract's HTML renderer template is bundled here;
`onchainHtml(rows, bg, cell, speed)` rebuilds a token's artifact locally from cheap reads.
To stay honest against the deployed contract, `sdk.tsx` refreshes the template once per app
start from a live token (`REF_TOKEN_ID`) via `adoptTemplateFromHtml` (fire-and-forget; the
bundled template serves until/if it resolves).

## Config

The v2 contract addresses are baked into the SDK per network — nothing to set. The only env
var is `NEXT_PUBLIC_GOL_RPC_URL` (optional; must be https + CORS-enabled — browser reads
can't use the default SNF node, so it defaults to the Cartridge gateway). The wasm SDK is
built by `npm run wasm` (run automatically by `predev`/`prebuild`) into `public/`.

## The bestiary (mostly dormant)

`lib/bestiary.ts` holds known Conway patterns. The "waiting to be discovered" gallery
section was removed, so nothing links to them now, but `/life/[id]` still routes a bestiary
key to `BeastDetail` (find-loop → mint) if one is opened directly. Kept (and translated) in
case the discover flow returns; safe to delete with `BeastDetail` if it doesn't.

## Extending the frontend

- **New chain action:** add a calldata builder to the SDK (Rust → `npm run wasm`), then a
  hook that builds → `execute` → `waitForTx` (mirror `useBreathe`/`useMint`).
- **New copy:** `useT()` + `t({ fr, en })`; pure helpers return a `Dict`.
- **Render a state anywhere:** `<Creature rows={...} />` (or `coords` / `cells`).
- **Don't** run `next build` while `next dev` is live — it clobbers `.next` and 500s the dev
  server. Use `tsc --noEmit` (the app's local binary) to typecheck.
