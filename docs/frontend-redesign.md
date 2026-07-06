# Frontend Redesign — the "Digital Bacteria" web experience

> **Status:** ✅ **SHIPPED & evolved** (signed off; built in `ui/game-of-life`). This stays as the
> design/planning artifact — the *thesis* below still holds, but the app has moved past it (living
> gallery, `/create` editor with a slot-machine score, breathe/feed, owner-editable params, a
> bilingual FR/EN switch). For the **as-built** app, see [frontend.md](frontend.md) (architecture) and
> the app [README](../ui/game-of-life/README.md). Original planning status: *proposal (2026-06-17)*.
> **Scope tier:** internal (AMBER) — references unreleased plans + Sepolia deployment addresses.
> **Audience:** whoever builds the web app; the designer (me) owns the design chart.
> **Companions:** [purpose.md](purpose.md) (the soul), [sdk-plan.md](sdk-plan.md) (the SDK surface this consumes),
> [technical-overview.md](technical-overview.md) (contract mechanics), [overview.md](overview.md) (economy).
>
> Any user-facing copy drafted here is illustrative and **must get a human review pass** before shipping.

---

## 1. Design thesis

[purpose.md](purpose.md) is the brief: *"These creatures look alive but they are not autonomous; they depend on
me. I want to try and set them free."* The web experience is not an NFT marketplace with a Game-of-Life skin. It is
a **tended garden of autonomous digital creatures** — a place you visit to **watch life breathe**, **keep strangers'
creatures alive**, and **set your own discovery free** so it can outlive you.

Three felt qualities, in priority order:

1. **Alive** — the creatures *move*. Stillness is the enemy. Even a still-life breathes (glows).
2. **Contemplative** — calm, unhurried, gallery-quiet. No FOMO, no price tickers, no countdowns.
3. **Honest** — it's a Sepolia experiment about immortal computation; we say so, plainly, and it's still beautiful.

**The economy is the narrative.** A fresh wallet holds 0 NUT. You *earn* NUT by breathing life into any creature
(1 NUT/step), and you *spend* NUT to mint your own discovery (`length × 1 NUT`). So the core journey is a loop the
UI should make legible end-to-end:

```
        ┌─────────────────────────────────────────────────────────┐
        │   watch  →  breathe (earn NUT)  →  discover  →  mint      │
        │     ▲                                              │       │
        │     └──────────  your creature joins the garden  ◀─┘       │
        └─────────────────────────────────────────────────────────┘
```

This is the designed funnel (you can't mint without first participating). We feature it, not hide it.

---

## 2. Decisions locked (interview, 2026-06-17)

| Question | Decision | Note |
|---|---|---|
| **Audience / register** | **Art-forward & contemplative** | Generative-art lovers, Conway enthusiasts, the curious. Downplay crypto chrome. |
| **v1 must-have flows** | **Living gallery · Discover & mint · Breathe-life** | "My lifeforms" full collection view = fast-follow. A minimal connected header (address + NUT) is in v1 because mint/breathe need it. |
| **Visual direction** | **Living petri dish (bioluminescent)** | Dark canvas; cells glow; colour encodes age/status; on-chain B&W SVG kept as the provenance/share artifact. |
| **Motion** | **Slow ambient evolution, accelerate on hover/focus** | Creatures step gently on their own; lean in and they speed up; ease back on leave. Still-lifes carry the breathing glow. |
| **Breathe ritual** | **Ceremonial single breath, feed anyone** | One action = one generation, with a visible "inhale." Feed yours *or* a stranger's — it's a commons. |
| **Onboarding** | **Read-first, honest testnet** | Full gallery with no wallet; connect only at mint/breathe; clearly labelled Sepolia experiment + faucet links. |
| **Mint scope (v1)** | **Loops only** | `mintLoopCalls` is already bridged to WASM. Paths/partial-paths = fast-follow (need WASM bridge). |
| **Framework** | **Keep Next.js 15 + React 19 (App Router)** | SSR per-lifeform OG/share images of a *breathing* creature is a real lever for art-forward sharing. WASM loads client-side. |

---

## 2a. As-built (2026-06-17) — Phases 0–4 shipped

Built and verified against Sepolia. `npm run build` green; the read path is confirmed end-to-end in
a headless browser (real `recentLifeforms`/`lifeform`/`tokenUri` reads). The breathe **signing** path
is built and type/lint/build-clean but needs a real wallet + Sepolia gas to exercise fully.

- **Plumbing:** `wasm-pack` wired into the Next build (`predev`/`prebuild` → build + copy glue/.wasm
  to `/public`); `GolSdkProvider` loads the wasm at runtime (bundler-ignored from `/public`) and
  constructs a Sepolia `GolSdk`; `useGolSdk()` / `useWallet()` hooks. Legacy toy removed.
- **The `<Creature>` engine** (`components/Creature.tsx` + `lib/creatures.ts`): the chart's renderer
  as a React component — unpack `current_state`, JS toroidal Conway step, glow, **slow-ambient /
  accelerate-on-hover** cadence, one shared rAF, off-screen pause, reduced-motion path.
- **Garden (`/`)**, **detail (`/life/[id]`)** with the **provenance toggle** (living render ↔ on-chain
  SVG) and traits from `tokenUri`. Wallet connect + NUT chip (get-starknet).
- **Breathe-life ritual (Phase 4):** the detail CTA signs `move_lifeform_forward` via the wallet
  (`starknet.js` `WalletAccount.connect(provider, swo).execute(calls)`; SDK builds the call, JS signs),
  with the full choreography — inhale (stage brightens) while signing/pending → poll receipt →
  refetch the now-older creature, float "+1 NUT", refresh the balance. Gated on Sepolia; friendly
  errors (declined / out of gas). `starknet` + `get-starknet` are lazy-loaded (not in the read bundle).

**Two deliberate deviations from the spec above (both noted inline below):**
1. **Two-strata Garden.** Only **one** lifeform is minted on Sepolia, so a "gallery of minted
   creatures" would be a one-creature wall. The Garden instead shows **"Living on Starknet"** (real
   minted, via a newly-bridged `recentLifeforms(limit)`) **+ "Waiting to be discovered"** (a curated
   bestiary of valid Conway lifeforms rendered as not-yet-born creatures, each a doorway into
   discover-&-mint). This turns the sparsity into purpose.md's "reservoir of life" and drives the
   funnel. `recentLifeforms` was added to the SDK + WASM (closing the §8.3 gap).
2. **Browser RPC = CORS gateway.** The default SNF node (`sepolia.nodes.starknet.org`) sends no CORS
   headers, so browser `fetch` is blocked. The browser SDK uses the CORS-enabled public gateway
   (`api.cartridge.gg/x/starknet/sepolia`, overridable via `NEXT_PUBLIC_GOL_RPC_URL`). See §9.5.

## 3. Audience & principles

**Primary persona — "the curious visitor."** Arrives from a shared link (likely a single creature's OG image).
May not have a Starknet wallet. Should be able to fall in love *before* being asked for anything. Stays because the
creatures are mesmerising; converts when they want to keep one alive or set one free.

**Secondary — "the tender."** Returns to breathe life into creatures, watches the garden change, accrues a quiet
sense of stewardship (and NUT).

**Tertiary — "the discoverer."** Enjoys the hunt: seeding grids, finding loops, minting their find.

**Design principles**

- **Motion is the product.** Budget engineering for a smooth render engine before chrome.
- **Read-first.** Everything observable works with zero wallet. Connection is an *intent*, never a gate.
- **One creature, one identity.** A lifeform has a stable look (derived from its state) so it's recognisable across
  gallery, detail, and share image.
- **Quiet chrome.** Typography and negative space do the talking; controls recede until needed.
- **Accessible aliveness.** Honour `prefers-reduced-motion` (see §10) — calm by default, never seizure-risky.
- **Honest provenance.** The on-chain SVG is the canonical artifact; our richer render is a faithful interpretation
  of the *same bits*, never a different creature.

---

## 4. Information architecture

```
/                         The Garden — living gallery of minted creatures (read-only, no wallet)
/life/[id]                A single creature: large live render, traits, age, breathe button, share/OG
/discover                 "Find My Fate" playground — seed a grid, run it, detect a loop, mint it
/about                    The story (purpose.md, distilled) + how the economy works + "this is a testnet"
  (fast-follow) /you      Connected: your creatures + NUT — promoted from the header once it earns its space
```

- `/life/[id]` is the **shareable unit** and the SSR/OG target. Links in the wild point here.
- Wallet state lives in a global provider; a compact **garden header** (logo · NUT balance · connect/account)
  persists across routes. Pre-connect it shows only logo + a quiet "Connect to tend" affordance.

---

## 5. Core flows

### 5.1 Connect wallet (intent-driven)
- Trigger: pressing **Breathe** or **Mint** while disconnected (or the header affordance).
- Mechanism: `get-starknet` v4 → returns a `WalletAccount` (ArgentX / Braavos). Signing stays in JS; the SDK only
  builds calls (§8). Optionally wrap with `starknetkit` for a nicer connect modal — evaluate, don't block on it.
- On connect: read `nutBalance(address)` for the header; lazily kick off `ownedLifeforms(address)` (for the "you"
  fast-follow) but don't block the UI on the genesis-scan.
- Always show the **network honestly**: a small "Sepolia · testnet" pill; if the wallet is on the wrong network,
  guide a switch.

### 5.2 The Garden (living gallery) — `/`
- A responsive grid of **creature cards**, each a live render (§6) at low/slow cadence (ambient evolution + glow).
- Hover/focus a card → it **accelerates** (steps faster) and lifts slightly; leaving eases it back.
- Card chrome (quiet): `#id`, a status glyph (alive ◉ / still ◎ / the rare dead ◌), age. No prices.
- Data: enumerate via `ownedLifeforms` is owner-scoped, so for a *global* gallery we need a creature list.
  v1 source = the SDK's event scan over `NewLifeForm`/`Transfer` (see §8.3 "gallery source" + its caveat). Until an
  indexer lands, cap + lazy-load and **state the cap honestly** ("showing the latest N").
- Empty/loading: a single large "seed" creature breathing in the centre while cards stream in.

### 5.3 Creature detail — `/life/[id]`
- Large hero render (§6), generous space, the creature front and centre and *moving*.
- Read: `lifeform(id)` → `{ is_loop, is_still, is_alive, is_dead, sequence_length, current_state, age, owner }`.
- Traits panel from `tokenUri(id)` attributes (Status / Kind / Sequence Length / Age) + description.
- **Provenance toggle:** "View on-chain artifact" swaps our render for the literal decoded SVG (proof our render
  is faithful to the same bits).
- **Breathe** button (§5.5). Owner shown as a truncated address (link to explorer).
- SSR: this route renders an OG image (§9.4) so a shared link previews the actual creature.

### 5.4 Discover & mint — `/discover`
- The reimagined **"Find My Fate"**: a 15×15 board you can paint, randomise, or seed from a number.
- Run the simulation client-side (we already have Conway + loop detection in the legacy component — port and
  polish it). Detecting a loop yields its **smallest state** (`loop_id`) and **period** (`loop_length`).
- On a found loop, offer **Mint**: `mintLoopCalls(loop_id, loop_length, address)` → `[approve, mint_loop]` →
  `walletAccount.execute(calls)`. Show the NUT cost (`length × 1 NUT`) up front, and if the wallet lacks NUT, route
  them to breathe first (the funnel — §1).
- Honesty: a still-life is `loop_length = 1` (cheapest, 1 NUT) — a perfect first mint. Lead beginners there.
- Optional hardening (later): validate the candidate on-chain with `is_single_loop` before paying gas (needs a WASM
  bridge — §8.4). For v1 the contract validates on submit; we pre-check client-side and surface clear errors.

### 5.5 Breathe-life (the ritual) — anywhere a creature appears
- A single deliberate press. Disconnected → triggers connect first (§5.1).
- `breatheLifeCall(id)` → `[move_lifeform_forward]` → `walletAccount.execute(call)`.
- **Choreography** (the soul): on submit, the creature takes a visible *inhale* (glow swells); on confirmation, it
  **advances one real generation** (our render steps to `iterate_once(current_state)` computed in JS) and a small
  "+1 NUT" rises and fades. Age increments. The whole beat is ~1–2s and feels like giving, not transacting.
- Framing copy (illustrative, **needs review**): *"Breathe life into #98307 — advance it one generation and earn 1
  NUT. Keep it alive."* Emphasise that feeding *anyone's* creature is the point.

### 5.6 NUT balance
- Header chip once connected: `nutBalance(address)` → hex string → `Number(BigInt(hex)) / 1e18`, shown to ~2 dp.
- Refetch after a confirmed breathe/mint. It's information, not a scoreboard — keep it quiet.

---

## 6. The render engine (the heart)

A creature's state is a packed `u256`. The grid is 15×15 = 225 cells; **bit `row*15 + col`** is the live cell
(row-major, LSB = top-left). Verified against the live chain: token 98307 = `0x18003` = bits 0,1,15,16 = a 2×2 block
at the top-left, exactly matching the on-chain SVG's four rects. The unpack:

```ts
const N = 15;
function unpack(stateHex: string): boolean[] {        // length 225, index = row*15 + col
  let s = BigInt(stateHex);
  const cells = new Array(N * N);
  for (let i = 0; i < N * N; i++) { cells[i] = (s & 1n) === 1n; s >>= 1n; }
  return cells;
}
```

Conway step with **toroidal wrap** (matches the contract; the legacy component already does this):

```ts
function step(cells: boolean[]): boolean[] {
  const next = new Array(N * N);
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    let n = 0;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      if (cells[((r+dr+N)%N)*N + ((c+dc+N)%N)]) n++;
    }
    const alive = cells[r*N + c];
    next[r*N + c] = alive ? (n === 2 || n === 3) : (n === 3);
  }
  return next;
}
```

> We simulate **in JS** for animation (cheap, smooth, offline). The chain's `iterate_*` views are the source of
> truth and are used for *validation*, not per-frame rendering. Our render is faithful because we render the *same
> bits*; the provenance toggle proves it.

**Render technology by surface:**

| Surface | Tech | Why |
|---|---|---|
| Gallery cards (many, animating) | **`<canvas>`** (one per card, or one pooled offscreen renderer) | dozens of 15×15 grids at once; canvas avoids 225×N DOM nodes |
| Hero / detail (one, large) | `<canvas>` or crisp inline SVG | single creature; can afford SVG niceties |
| OG / share image | the **on-chain SVG** (decoded from `tokenUri.image`) or a server-rendered frame | provenance-accurate, no client needed |

**Animation cadence (the locked motion decision):**

- **Ambient (default):** advance one generation every ~**1200–1800ms**; a continuous soft glow "breath" on a ~3–4s
  sine independent of stepping. Loops cycle their period forever; still-lifes don't change cells but keep breathing.
- **Engaged (hover/focus/in-detail):** ramp the step interval down toward ~**120–200ms** over a short ease so the
  creature visibly "wakes up"; ease back on blur. (Generalises the legacy 100ms "find fate" loop.)
- **Reduced motion:** no stepping, no glow pulse — show the creature's *current* state statically with a single
  gentle opacity fade-in (§10).

**Colour = life, encoded (bioluminescent palette):**

- Live cell hue shifts with **age** (young = cool teal `#34e2c4` → mature = warm amber `#ffb454`), giving the garden
  visible variety and making "old, long-tended" creatures legibly different from fresh mints.
- **Status accents:** alive = teal/amber glow; **dead** (empty grid, `is_dead`) = ashen grey, no glow, a quiet
  memento (rare and poignant — don't hide deaths, honour them); **still-life** = steady, slow breath.
- Glow via canvas `shadowBlur` / layered alpha; keep it subtle (this is a gallery, not a rave).

---

## 7. Visual design chart — "Living petri dish"

Tokens below are the starting palette/scale; treat as the seed for a small design system (CSS variables + Tailwind
theme). Names are stable; values are tunable in build-out.

### 7.1 Colour

```
--bg-void        #07090d   page background (near-black, faint blue)
--bg-dish        #0a0e14   card / panel surface
--bg-dish-raised #11161f   hover / elevated surface
--line           #1c2430   hairlines, grid gutters
--ink            #e8eef6   primary text
--ink-dim        #8a96a8   secondary text
--ink-faint      #4a5568   tertiary / metadata

--life-young     #34e2c4   teal — newly minted / low age
--life-mid       #6fe39b   green-teal — transitional
--life-old       #ffb454   amber — long-lived
--accent         #5ad1ff   interactive (links, focus rings)
--nut            #c8ff7a   NUT / reward moments
--dead           #3a4150   ashen — empty-grid lifeforms
--danger         #ff6b6b   destructive / errors (sparingly)
```

Dark-first; a light theme is out of scope for v1 (the glow needs the dark canvas).

### 7.2 Type

- **Display / headings:** a humanist or refined grotesk (e.g. *Geist* — already wired — or *Space Grotesk*).
- **Body:** the same family, regular.
- **Numerics / ids / state:** **monospace** (*Geist Mono*, already wired) — ids and states are *data*, set them so.
- Scale (rem): `0.75 · 0.875 · 1 · 1.25 · 1.5 · 2 · 3` · hero `4.5`. Generous line-height (1.5 body), tight on display.

### 7.3 Motion tokens

```
--ease-organic   cubic-bezier(0.22, 1, 0.36, 1)   wake/settle of creatures
--ease-quiet     cubic-bezier(0.4, 0, 0.2, 1)      UI transitions
--dur-fast 160ms · --dur 280ms · --dur-slow 520ms
--breath-period  3.6s     ambient glow sine
--step-ambient   1500ms   gallery generational step
--step-engaged   160ms    hovered/focused step
```

### 7.4 Spatial / layout
- 8px base spacing grid; cards on a responsive auto-fit grid (`minmax(180px, 1fr)`), generous gutters (`--line`).
- Max content width ~1200px on detail/about; the garden can run wider/full-bleed.
- Radius: 10px cards, 6px controls. Hairline borders, not shadows (shadows reserved for glow).

### 7.5 Component inventory (build order roughly follows §12)

- **`<Creature>`** — the render primitive. Props: `state`, `age`, `status`, `cadence: 'ambient'|'engaged'|'static'`,
  `size`. Owns the canvas + the JS step loop + glow. Respects reduced-motion. *The single most important component.*
- **`<CreatureCard>`** — `<Creature>` + quiet chrome (id, status glyph, age), hover-to-engage, links to `/life/[id]`.
- **`<GardenGrid>`** — responsive layout + lazy-load + honest "showing latest N" notice.
- **`<GardenHeader>`** — logo · network pill · NUT chip · connect/account.
- **`<BreatheButton>`** — the ritual: disconnected→connect, submit→inhale, confirm→step + "+1 NUT".
- **`<TraitList>`** — from `tokenUri` attributes.
- **`<ProvenanceToggle>`** — swap render ↔ decoded on-chain SVG.
- **`<DiscoverBoard>`** — paint/randomise/seed 15×15, run, detect loop, mint.
- **`<ConnectAffordance>` / `<AccountMenu>`** — get-starknet wiring.
- **`<NetworkBanner>`** — the honest-testnet note + faucet links.
- **`<TxToast>`** — pending/confirmed/failed, with explorer link.

---

## 8. SDK surface — what the frontend calls, concretely

Imported from the wasm-pack package (`@gol/sdk` → `crates/gol-sdk-wasm/pkg`). Init once, client-side:

```ts
import init, { GolSdk } from "@gol/sdk";
await init();                         // loads the .wasm (client-only)
const sdk = new GolSdk("sepolia");    // or new GolSdk("sepolia", customRpcUrl)
```

### 8.1 Reads (grounded in the generated `.d.ts` + wasm `lib.rs`)

| UI need | Call | Returns (JS) |
|---|---|---|
| Grid dimension | `await sdk.gridSize()` | `number` (15) |
| One creature | `await sdk.lifeform(id)` | `{ token_id, owner, is_loop, is_still, is_alive, is_dead, sequence_length, current_state, age } \| null` — all felt/u256 fields are `0x…` strings |
| Metadata + SVG | `await sdk.tokenUri(id)` | `{ raw, name, description, image, attributes:[{trait_type,value}] } \| null`; `image` is a `data:image/svg+xml;base64,…` URI |
| NUT balance | `await sdk.nutBalance(addr)` | `"0x…"` hex → `Number(BigInt(hex))/1e18` |
| Owned creatures | `await sdk.ownedLifeforms(addr)` | `JsLifeform[]` (same shape as `lifeform`) |

`id` accepts decimal or `0x` hex. `current_state` is the packed grid → feed straight into `unpack()` (§6).

### 8.2 Writes (SDK builds calls; **JS wallet signs** — keys never touch the app)

| UI need | Call | Returns |
|---|---|---|
| Mint a loop | `sdk.mintLoopCalls(loopId, length, recipient)` | `[{contractAddress,entrypoint:"approve",calldata}, {…,"mint_loop",…}]` |
| Breathe life | `sdk.breatheLifeCall(id)` | `[{contractAddress,entrypoint:"move_lifeform_forward",calldata}]` |

Then: `await walletAccount.execute(calls)` (get-starknet). The mint bundle includes the NUT `approve`, so it's a
single user confirmation.

### 8.3 Gallery source — caveat to design around
- `ownedLifeforms` is **owner-scoped**; the *global* garden needs a creature **list** — now served by the
  bridged `recentLifeforms(limit)` (mints = `Transfer` from `0x0`).
- **Event scans MUST start at the deploy block, not genesis.** Some RPC nodes (incl. the cartridge gateway)
  paginate `getEvents` by fixed ~82k-block windows, returning empty pages + a continuation token. A from-genesis
  scan on a mature chain (Sepolia ≈ 10.9M blocks) is then ~130 empty round-trips → the gallery hangs on "scanning…".
  Fixed by baking `deploy_block` (10,590,000) into the SDK's Sepolia config so every scan starts there (~2s). This
  also future-proofs "my lifeforms" (same scan path).
- **Not yet exposed to WASM:** a "list all/recent lifeforms" method. v1 options, pick during build:
  (a) add a small `recentLifeforms(limit)` bridge over the existing `DataSource` event scan; or
  (b) ship a tiny static manifest of known ids for the demo garden and read each via `lifeform(id)`.
  Either way **state the cap honestly** in the UI. The real fix is the indexer (mainnet/Phase 4).

### 8.4 WASM bridge gaps (Rust is built; just not exposed to the browser yet)
These are cheap `#[wasm_bindgen]` additions over already-tested Rust — sequence them with the phases that need them:

| For | Needs bridged | Phase |
|---|---|---|
| Global gallery list | `recentLifeforms(limit)` (over `DataSource`) | v1 (Phase 1) — small |
| On-chain mint pre-validation | `isSingleLoop(state, gens)` (engine view) | fast-follow (hardening) |
| Path minting | `mintPathCalls`, partial-path flow, `approve` | fast-follow (Discover v2) |
| Transfers / gifting | `transferCall` | later |
| Allowance display | `nutAllowance(owner, spender)` | later |

> Rendering/discovery do **not** need `unpack`/`iterate`/`pack` bridged — JS does those for animation. Bridge the
> engine views only where we want the *chain* to be the validator before spending gas.

---

## 9. Technical architecture

### 9.1 Stack
- **Next.js 15 (App Router) + React 19** — kept. TypeScript, Tailwind (already configured).
- **`@gol/sdk`** (wasm-pack output) for all chain reads + call-building.
- **`@starknet-io/get-starknet` v4 + `starknet.js` v7** — *only* for the wallet `WalletAccount` + `execute`. (v7 is
  fine for the wallet path; no contract hashing happens client-side, so the v7 declare-hash issue is irrelevant here.)
- **Data fetching/caching:** TanStack Query (React Query) over the SDK reads — dedup, cache, background refetch after
  txs. Keeps creature reads snappy and centralises the genesis-scan cost.

### 9.2 WASM in Next (the one piece of real plumbing)
- The pkg is `--target web` (ESM + `init()`). It must run **client-side only**:
  - Wrap `GolSdk` in a **client provider** (`'use client'`) that `await init()`s once and exposes the instance via
    context. Components consume the instance through a `useGolSdk()` hook.
  - Ensure the `.wasm` asset is served/copied (Next asset handling or `next.config` `webpack.experiments.asyncWebAssembly`
    if importing directly; with `--target web` we typically `fetch`+`init` the wasm URL, sidestepping bundler quirks).
  - Never import the SDK in a Server Component or in OG-image route handlers without a Node-safe path (see §9.4).
- **Build pipeline:** add `wasm-pack build crates/gol-sdk-wasm --target web` as a `prebuild`/`predev` step (and a CI
  job) so the pkg never goes stale. This keeps sdk-plan §8's pipeline intact.

### 9.3 State & wallet
- Global providers: `GolSdkProvider` (wasm instance) · `WalletProvider` (get-starknet account, address, network) ·
  React Query client. The legacy `useGol`/`contracts.ts` described in sdk-plan §11 **do not exist** — this is
  greenfield; we build a thin `useGolSdk()` + `useWallet()` instead.
- Tx lifecycle: build call (SDK) → `account.execute` → optimistic UI (inhale) → poll/await receipt → confirmed
  choreography (step + NUT) → invalidate the relevant React Query keys.

### 9.4 SSR / share images (the art-forward payoff)
- `/life/[id]` gets `generateMetadata` for OG/Twitter tags.
- OG image options: (a) **simplest & honest** — use the decoded on-chain SVG (rasterised) as the share image, since
  it's exactly the creature; (b) a Next OG route that renders a styled single frame. v1 → (a); (b) is polish.
- Reads in the server context need a Node-capable path. Either fetch `tokenUri` via a thin server RPC call (the data
  URI already contains the SVG — no WASM needed server-side), or pre-generate. **Avoid running the WASM SDK on the
  server**; the SVG is self-contained in `tokenUri.image`.

### 9.5 Networks
- `new GolSdk("sepolia")` defaults to the SNF node (`https://sepolia.nodes.starknet.org/rpc/v0_10`), but **that node
  sends no CORS headers**, so browser `fetch` is blocked (surfaces as `read: error sending request`). The browser
  SDK therefore constructs `GolSdk("sepolia", RPC_URL)` with a **CORS-enabled gateway**
  (`https://api.cartridge.gg/x/starknet/sepolia`), overridable via `NEXT_PUBLIC_GOL_RPC_URL`. **Use https**
  (an http node 301s to https and drops the POST body). The SNF node also rate-limits heavy event scans — front the
  gallery scan with a keyed proxy/dedicated RPC before any real traffic, or move it to the indexer.
- Mainnet is **not deployed**; the UI must degrade gracefully if a user's wallet is on mainnet (guide back to Sepolia).

---

## 10. Accessibility & performance

- **`prefers-reduced-motion`:** no stepping, no glow pulse; render current state statically with a single fade-in.
  This is a first-class path, not an afterthought (a garden of pulsing grids is a real vestibular/seizure concern).
- **Keyboard:** cards are links; Breathe/Mint are buttons; visible `--accent` focus rings; the discover board is
  operable without a mouse (arrow-key cursor + space to toggle).
- **Contrast:** `--ink` on `--bg-*` meets WCAG AA; status is never colour-only (glyph + label).
- **Screen readers:** each creature has a text alt (e.g. *"Lifeform #98307, a still-life, alive, age 0"*).
- **Performance:** cap concurrent animating canvases (pause off-screen via `IntersectionObserver`); pooled
  `requestAnimationFrame` loop rather than N timers; reuse the legacy 100ms loop pattern but rAF-driven. Lazy-load
  the gallery; prefetch `/life/[id]` on hover.

---

## 11. Honest-testnet onboarding

- A persistent but quiet **"Sepolia · testnet experiment"** pill; an `/about` section explaining what that means.
- First mint/breathe with insufficient funds → an inline helper: links to a **Sepolia ETH/STRK faucet** (gas) and a
  one-line explanation that **NUT is earned by breathing**, not bought. This *is* the funnel (§1) made kind.
- No fake urgency, no "limited supply," no price. The value proposition is participation in something that lasts.

---

## 12. Phased implementation plan

Each phase ends shippable/demoable. Don't write frontend code until this doc is signed off (per the brief).

**Phase 0 — plumbing (no UI yet)**
- [ ] Add `wasm-pack build … --target web` as `predev`/`prebuild` + a CI job; wire the pkg as `@gol/sdk` (file: link).
- [ ] `GolSdkProvider` (client, `await init()` once) + `useGolSdk()`; React Query client; verify a live `lifeform(98307)`
      read renders raw JSON in a throwaway page.
- [ ] Decide & implement the **gallery source** (§8.3) — small `recentLifeforms` bridge *or* static id manifest.

**Phase 1 — the render engine + read-only Garden**  *(delivers the "alive" wow with zero wallet)*
- [ ] `<Creature>` (unpack + JS step + glow + cadence + reduced-motion). Validate render == on-chain SVG for 98307.
- [ ] `<CreatureCard>`, `<GardenGrid>`, `/` — slow ambient evolution, accelerate on hover. Honest "latest N" notice.
- [ ] Performance: IntersectionObserver pause, pooled rAF.

**Phase 2 — creature detail + provenance + share**
- [ ] `/life/[id]`: hero `<Creature>`, `<TraitList>` (tokenUri), `<ProvenanceToggle>`, owner.
- [ ] `generateMetadata` + OG image from the decoded on-chain SVG (§9.4).

**Phase 3 — wallet + NUT (minimal connected state)**
- [ ] `WalletProvider` (get-starknet), `<GardenHeader>` with NUT chip, network pill, `<NetworkBanner>` + faucet links.
- [ ] `<TxToast>` lifecycle scaffolding.

**Phase 4 — the breathe ritual**
- [ ] `<BreatheButton>` end-to-end: connect-on-intent → `breatheLifeCall` → `execute` → inhale → confirmed step +
      "+1 NUT" → refetch balance + creature. Tune the choreography until it feels like *giving*.

**Phase 5 — discover & mint (loops)**
- [ ] `/discover` `<DiscoverBoard>`: paint/randomise/seed, run sim, detect loop (smallest + period).
- [ ] Mint via `mintLoopCalls` → `execute`; show NUT cost; route the under-funded to breathe first (the funnel).
- [ ] (Hardening, optional this phase) bridge + use `isSingleLoop` for on-chain pre-validation.

**Phase 6 — polish**
- [ ] Empty/loading/error states, motion tuning, copy pass (**human review of all user-facing copy**), `/about`,
      responsive + a11y audit, OG route (styled frame) if desired.

**Fast-follows (post-v1)**
- [ ] `/you` full collection view (`ownedLifeforms`) once it earns the space.
- [ ] Paths/partial-paths minting (bridge `mintPathCalls` + flow). Transfers/gifting (`transferCall`).
- [ ] Indexer-backed gallery (Phase 4 of the SDK roadmap) to replace the genesis scan.

---

## 13. Open questions / risks

- **Gallery enumeration at scale** — the genesis event scan won't hold up; the indexer is the real answer but is
  mainnet-only today. v1 leans on the small Sepolia population + honest caps. *(Decide §8.3 option in Phase 0.)*
- **WASM-in-Next ergonomics** — first-load wasm weight + init timing; mitigate with a graceful "warming up the
  petri dish" state and code-splitting the SDK behind the client provider.
- **NUT pricing formula** — `length × 10^18` is lifted from the old `useGol`; sdk-plan flags confirming it against
  the minters. The mint UI must show the *actual* approved amount; reconcile before mainnet (audit item).
- **starknet.js v7 vs wallet API drift** — keep it pinned to what the wallets expect; we only use it for `execute`.
- **Dead creatures** — `is_dead` (empty-grid) lifeforms exist; confirm they can be minted/shown and design the
  "memento" state so they're poignant, not broken-looking.
- **Render fidelity** — our colourful render must always match the on-chain bits; the provenance toggle is the
  guardrail, and Phase 1 includes an explicit render-vs-SVG check.

## 14. Out of scope (v1)
- Mainnet. Light theme. Paths/partial-path minting. Transfers/gifting. SNIP-36 proving UI (native-only; the wasm
  surface doesn't include it). A native TUI (separate SDK consumer, later).

---

## Appendix A — verified live data (token 98307, Sepolia)

```
grid_size = 15
lifeform 98307: owner=0x319219…532  age=0  is_loop=true  is_still=true  is_alive=true  state=0x18003
  → 0x18003 = bits {0,1,15,16} = a 2×2 block at top-left  (token_id == current_state == smallest loop state)
iterate_once(0x18003) = 0x18003  (still-life: stable)
tokenUri: name="Lifeform #98307", description="An autonomous Conway's Game of Life lifeform living forever on Starknet."
  attributes: Status=Alive · Kind=Still life · Sequence Length=1 · Age=0
  image (decoded SVG, 316 bytes):
    <svg xmlns='http://www.w3.org/2000/svg' width='150' height='150' shape-rendering='crispEdges'>
      <rect width='150' height='150' fill='#fff'/>
      <rect x='0' y='0' width='10' height='10'/><rect x='10' y='0' width='10' height='10'/>
      <rect x='0' y='10' width='10' height='10'/><rect x='10' y='10' width='10' height='10'/>
    </svg>
```

The on-chain SVG is 15×15 at 10px/cell (150×150), black cells on white, `crispEdges`. Our "living petri dish" render
is the *same bits* re-interpreted on a dark, glowing canvas; the on-chain SVG remains the canonical provenance image.
