# Work log

> Append-only history, **newest first**. One entry per work session. Never rewrite past
> entries — correct course in a new entry. See [README.md](README.md) for the process.

## Entry template (copy this)

```
## YYYY-MM-DD — <short title>
- **Goal:** what this session set out to do
- **Branch:** <branch> · **Commits:** <hashes or "uncommitted WIP">
- **Changed:** the substantive changes
- **Verified:** what you actually ran (build/test results) — be precise about what is NOT verified
- **Decisions:** notable choices and why
- **Next:** the handoff — what the next session should do first
- **Blockers:** anything stopping progress, and who/what unblocks it
```

---

## 2026-07-31 (4) — MAINNET: the garden goes live on Starknet mainnet
- **Goal:** Henri: "let's deploy to mainnet". Take the v3 stack (current `main`, incl. provenance,
  empty-grid genesis, metadata `image`, CEI pet fix) live on SN_MAIN and point the app at it.
- **Branch:** `main` · **Commits:** this session's commit (contracts unchanged — deploy + SDK/UI
  repoint + docs).
- **Changed:** (1) declared 6 classes + deployed 6 contracts + full wiring in ONE multicall via
  strkd (agent account `gol-mainnet` `0x0062e08b…2118` = creator/admin) — every address, class
  hash, tx and fee in the new [mainnet-deployment.md](../mainnet-deployment.md); (2) SDK
  `Network::Mainnet` address book filled (deploy_block 12_553_900, fresh-NUT note) + new
  `mainnet_address_book_loads` test; (3) frontend flipped: `NETWORK="mainnet"`,
  `onSepolia/switchToSepolia` renamed `onAppChain/switchToAppChain` with `TARGET_CHAIN_ID`
  derived from NETWORK, `REF_TOKEN_ID` per-network (mainnet = the empty-grid genesis), all
  user-visible "Sepolia" copy made network-neutral; wasm rebuilt.
- **Decisions (Henri):** deploy NOW, external audit + governance hand-off consciously deferred
  (2026-07-29 deep cairo-auditor pass is the launch basis); NUT initial supply **1** ("so death
  can be spawned by the deployer; once a creature is alive the system can start"); fresh strkd
  agent account (the Sepolia deployer no longer lists under this client); site flips to mainnet
  after verification. Fee craft: tight custom resource_bounds (1.15×/1.2×) because auto-bounds
  pad ~2.2× and the balance must cover the bound; biggest declares first. Total ≈ 306 STRK.
- **Verified:** genesis token id == SDK `tokenIdForRows(empty)` (Rust↔Cairo proof on mainnet);
  6/6 class hashes at addresses; all wiring events in the receipt; `token_uri` executes on the
  mainnet public node WITH the `image` field (the metadata gate is closed on mainnet);
  wasm SDK mainnet smoke (recentTokenIds → genesis, nutBalance = 1 NUT); `cargo test -p gol-sdk`
  44 ✅ · `tsc` ✅ · `next build` ✅. NOT verified: a wallet click-through on the live mainnet
  site (mint/breathe with real funds).
- **Next:** Henri's live-site pass on mainnet (connect, breathe the genesis? it's dead — mint the
  first living creature: deployer holds exactly 1 NUT = one period-1 escrow); consider admin
  hand-off/immutability; Sepolia classes still lack the `image` metadata (upgrade or let the
  testnet lag).

## 2026-07-31 (3) — Feature: the shared breath basket (feed many creatures in ONE tx)
- **Goal:** Henri's feature request — tapping "breathe" on several creatures should bundle all
  intents into a single multicall transaction instead of one tx per creature.
- **Branch:** `main` · **Commits:** uncommitted WIP (working tree).
- **Decisions (Henri, via 4-question interview):** hard cap at ONE tx (the per-tx feed cap —
  ×82 legacy / ×340 modern — applies to the bundle's SUM, extra taps shake and add nothing);
  the shared basket applies EVERYWHERE BreatheControl appears (garden tiles, /pets, /life/[id]);
  navigating to another page CANCELS un-sent taps (no surprise wallet prompt on another page;
  a bundle already signing is left to land); per-card feedback only, no global chip (each tapped
  card keeps its ×n badge + the shared drain bar; the hint shows "×total of ×cap in this breath"
  when several creatures are queued).
- **Changed (ui only — no contract/SDK changes; Starknet accounts are natively multicall):**
  - NEW `lib/breathBasket.tsx` — `BreathBasketProvider` (mounted in layout inside WalletProvider):
    one Map of creature→depth, ONE shared 1s window re-armed by any tap; on drain it builds
    `move_lifeform_forward_n(id, n-1) + pet(id)` per creature, concatenates, and sends ONE
    `execute()`. `waitForTx` still bumps txEpoch → ward clocks/NUT chip refresh as before.
    Per-creature `onExhaled(n, ok, txHash, error)` callbacks (last tap wins) return each card
    its slice.
  - `BreatheControl` rewritten to consume the basket (no local timer/depth); new props
    `creatureId` + `onExhaled` replace `cap` + `onExhale`. All controls lock while a bundle signs.
  - Consumers rewired: garden `BacteriaTile` (fire-and-forget), `/pets` `WardBreathe` (error
    line from callback), `/life/[id]` (fast-forward + confirm message now driven by the
    callback's `{n, hash}` instead of useBreathe's status machine).
  - `lib/useBreathe.ts` DELETED (fully superseded; its `humanize` moved into the basket).
  - `docs/frontend.md` module map + data-flow + extending sections updated.
- **Verified:** `tsc --noEmit` ✅ · `next build` ✅ (all routes). NOT yet exercised with a real
  wallet — the multi-creature multicall (2+ creatures, mixed depths) needs one live click-through.
- **Next:** browser pass — tap A ×2 then B ×1, confirm one wallet prompt, both bonds renewed,
  both cards settle; check the cancel-on-navigation path.

## 2026-07-31 (2) — /pets load fix: wallet-sized batched sweep instead of dish-sized serial one
- **Goal:** /pets was multi-second for wallets with several creatures — diagnose and fix.
- **Branch:** `main` · **Commits:** uncommitted WIP (working tree).
- **Why it was slow (all four compounding):** the page called `bondStatus` for EVERY creature
  anyone had ever petted (the render then discarded the non-mine entries anyway); each
  `bondStatus` was 3 sequential `starknet_call` round-trips; each kept ward paid 2 more serial
  calls (`lifeform` = owner_of + get_lifeform_data); and nothing rendered until the whole
  6-wide pool drained. ≈ (dish-wide petted count ÷ 6) × 3 RTT before first paint.
- **Changed:**
  - SDK (`rpc.rs`): new `bond_statuses(creatures, holder)` — 3 calls per creature in ONE
    `call_batch` HTTP round-trip, input-ordered, reverts read as `(false, 0, false)`.
  - WASM: `bondStatuses(ids, holder)` and `lifeformsBatch(ids)` (wraps the existing
    `lifeforms_batch` the gallery fix added). Rebuilt via `bun run wasm`.
  - `/pets` page: filters the pet graph to the connected wallet's pairs FIRST (the page only ever
    shows petted-by-me entries — the old global sweep was pure waste), then two batched round-trips
    (bonds, then lifeform states), rendering clocks as soon as bonds land and hydrating thumbnails
    right after (`Ward.lf: undefined` = hydrating vs `null` = gone). `runPool` deleted.
  - Decision logged in [sdk-decisions.md](../sdk-decisions.md) 2026-07-31 (list reads = batched
    JSON-RPC, callers shrink the id list before batching).
- **Verified:** `cargo test -p gol-sdk` ✅ (43) · `bun run wasm` ✅ (d.ts shows the new methods) ·
  `tsc --noEmit` ✅. NOT yet clicked through in a browser with a bonded wallet.
- **Next:** eyeball /pets with Henri's wallet; same batching would also suit the per-card
  `renderParams` calls if thumbnails ever feel slow.

## 2026-07-31 — Copy pass: kill the em dashes, plainer garden voice
- **Goal:** apply Henri's copy corrections across the site.
- **Branch:** `main` · **Commits:** uncommitted WIP (working tree).
- **Changed (ui/game-of-life only, strings — no logic):**
  - Removed the em dash (—) from every user-visible string (13 files: all pages + CreatureCard,
    Garden, GardenHeader, BreatheControl, useMint error copy, the metadata `title`), rewriting each
    with a comma/colon/period that keeps the sentence's cadence. Code comments keep theirs — they
    aren't on the website. The `/pets` unknown-clock placeholder "—" became "…".
  - `/` thesis: "…learned to stay alive, and go on living forever." (was "…— and go on breathing
    without you.")
  - Feature caption: "One of the most popular creatures, N generations and counting." (was "One of
    the most-breathed lives in the dish — …")
  - Garden loops wall: desc is now just "living loops" ("— kept alive by breath" removed).
  - `/create`: removed the ownership line "When you set it free, it belongs to whoever keeps it
    alive." (it's also not literally true — the NFT owner doesn't change with care).
  - `/leaderboards`: board labels "Longest-lived" → "Oldest loops", "Methuselahs" → "Oldest
    wanderers" (labels only; keys/data unchanged).
- **Why:** Henri's copy review — the em-dash tic reads as AI voice; the breath metaphor was
  overloaded in captions; Methuselah is CA-insider jargon the labels shouldn't require.
- **Verified:** `tsc --noEmit` clean; grep confirms zero em dashes left outside comments. Not
  eyeballed in a browser this session.
- **Next:** unchanged — Henri's browser pass (/pets, /leaderboards, a pet from the UI) now also
  covers this copy.

## 2026-07-29 (4) — Security audit (cairo-auditor deep) + pet() CEI fix + v1 dead-code removal
- **Goal:** run a thorough Cairo security audit of the whole contract suite (the free NUT faucet is
  an intentional valueless proof-of-participation sink, explicitly out of scope), then act on it.
- **Branch:** `main` · **Commits:** uncommitted WIP (working tree).
- **Audit:** deep run — 4 attack-vector specialists + 1 adversarial reasoner over all 25 in-scope
  `.cairo` files (~6.1k lines). Result: **no finding at or above the 75-confidence threshold.** The
  live v3 invariants held under attack — orbit-canonical id + mint-time copy-prevention, D4
  symmetry fraud-proofs, per-token escrow zeroed-before-payout (CEI-correct), pet-bond clock
  carry-on-transfer, and cross-contract mint gating. Six low-confidence hardening notes surfaced.
- **Changed (acted on 2 of the 6 notes):**
  - **#1 pet() CEI (`gol_pet_bonds.cairo`):** reordered `pet()` so the ERC-1155 bond mint + the
    `last_pet` clock write happen BEFORE the external `move_lifeform_forward_n_for` feed call
    (effects-before-interaction), closing the latent reentrant double-mint / clock-desync window.
    Behaviour preserved: an unminted/burned creature still reverts the whole tx (rolling the bond
    mint back atomically) — proven by `petting_a_burned_creature_reverts`.
  - **#2 v1 dead-code removal:** deleted the superseded, bug-carrying v1 minter stack —
    `gol_lifeforms.cairo`, `gol_loop_minter.cairo`, `gol_path_minter.cairo` (the recipient-keyed
    partial-path registry bug, already fixed + annotated "Audit #4" in v2/v3) and
    `tests/test_minters.cairo`; pruned the now-dead `IGolLoopMinter` / `IGolPathMinter` /
    `IGolLifeForms` traits from `interfaces.cairo`; updated `lib.cairo`. Repointed
    `tests/test_grid_utils.cairo` to host the shared `GolUtilitiesComponent` on `GolBench` (which
    embeds the same ABI) instead of the removed v1 `GolLifeforms`.
- **Kept (turned out NOT dead):** `gol_metadata.cairo` — `gol_metadata_v2` reuses its
  `u32_to_decimal` / `u256_to_decimal` helpers (the build caught this; restored + noted in
  `lib.cairo`); `gol_utilities.cairo` — still used by `gol_bench` + `test_grid_utils`;
  `interfaces.cairo` / `gol_nutrient.cairo` / `base64.cairo` — shared by v2/v3/pets.
- **Verified:** `scarb build` ✅ · `snforge test` ✅ (91 passed, 0 failed, 11 ignored benches). The
  count fell 103 → 91 = exactly the removed v1 `test_minters` cases; all 8 pet-bond tests pass on
  the reordered `pet()`.
- **Decisions:** #4 (repointing `nutrient_token_contract` strands per-token escrow and reverts all
  `prove_malformed`/`challenge_burn` bounty payouts) **deferred per Henri** — admin-gated +
  recoverable; revisit before the escrow model is relied on for anything of value. #3 (pet clock
  not bound to the NFT mint epoch → stale after burn+re-mint), #5 (unchecked ERC-20 transfer return
  on escrow/bounty), #6 (`gol_bench.verify_move_forward` missing start-state anchor) left as noted
  low-confidence items.
- **Next:** commit/branch these working-tree changes if desired; optional follow-ups on #3/#5.
- **Blockers:** none.

## 2026-07-29 (3) — SHIP: /why manifesto + perf/provenance merged to `main` → production
- **Goal:** Henri: "go ahead and merge" — ship the `/why` manifesto and the pending
  perf/provenance work to the live site.
- **Branch:** `main` (fast-forwarded from `perf/garden-batching`).
- **What shipped (3 commits over the old trunk):** the gallery-batching perf pass (batched
  `recentPaths` + cached read RPC); the **`/why` manifesto** (a ~640px Inter reading surface with
  the founding essay from `docs/purpose.md` in first person at 41×41, three LIVE Conway sims —
  R-pentomino evolving / spark going out / blinker looping — reduced-motion-aware, nav gains a
  dimmer WHY + a quiet "why this exists" Garden doorway); and the **mint-time provenance** work
  (`minted_at` + `discoverer` + empty-grid genesis).
- **Caveat:** the provenance CONTRACT changes are code only — **not yet upgraded on Sepolia** — so
  `/life`'s "Discovered by" hides gracefully (`sdk.discoverer` → null) until the classes are
  upgraded. Frontend deploys fine regardless.
- **How:** `git merge --ff-only perf/garden-batching` on `main` + `git push origin main`; Vercel
  auto-deploys → https://gol-starknet.vercel.app.
- **Verified:** `next build` green at HEAD (all routes incl. `/why` 4.33 kB). ⚠️ Wallet-signed flows
  still not clicked through with a real wallet (standing caveat).
- **Next:** upgrade the v3 classes on Sepolia (discoverer/minted_at); live-site wallet pass.

## 2026-07-29 (2) — empty-grid genesis at deploy + "Discovered by" surfaced end-to-end
- **Goal:** (a) the empty grid ("token 0") isn't mintable from the website (you can't draw
  nothing) — mint it in the `GolLifeformsV3` CONSTRUCTOR to the deployer; (b) surface the new
  `discoverer` field in token metadata and on `/life/[id]`.
- **Branch:** `perf/garden-batching` · **Commits:** `feat(v3,sdk,ui): mint-time provenance + empty-grid genesis` (one commit for both 07-29 entries).
- **Changed:**
  - **Genesis:** the constructor now mints the empty grid to `creator`: period-1 still/dead loop,
    drawn == canonical == empty, nonce 1 (user mints start at 2), `minted_at`/`discoverer`
    stamped, **escrow 0** (no NUT can exist at deploy; the empty grid is the global lex-minimum,
    so `prove_malformed` can never fire — regression-tested). NOTE: constructors do NOT run on
    upgrades, so live Sepolia won't gain this via class upgrade — it's a fresh-deploy (mainnet)
    feature. On Sepolia the empty grid remains mintable by calling `mint_loop` directly
    (`is_single_loop(empty, 1)` holds); on mainnet genesis-at-deploy guarantees the deployer gets
    the vacuum rather than a sniper.
  - **Metadata:** `gol_metadata_v2` gains `token_uri_with_discoverer` (+ an `address_to_hex`
    helper); a non-zero discoverer appends a `"Discovered by"` attribute (hex address). The 3-arg
    `token_uri` stays as a zero-discoverer wrapper so v2 contracts are untouched. Both v3 NFTs
    call the new fn with their stored discoverer.
  - **SDK:** `Reader::discoverer` / `path_discoverer` (`get_discoverer`, revert-tolerant —
    returns `None` for unminted/grandfathered-zero/pre-upgrade classes) + WASM `discoverer` /
    `pathDiscoverer` (hex or null).
  - **UI:** `/life/[id]` shows a copyable "discovered by" row (loop + wanderer views), hidden
    when the SDK returns null.
- **Verified:** `scarb build` ✅ · `snforge test` ✅ (103 passed — +2 genesis tests; nonce/balance
  assertions updated for genesis) · `cargo test -p gol-sdk` ✅ (43) · wasm-pack build ✅ ·
  `next build` ✅. NOT verified: live Sepolia behavior (classes not upgraded; discoverer row
  correctly stays hidden there by design until the upgrade ships).
- **Next:** upgrade the Sepolia v3 classes (lifeforms + wanderers) so discoverer starts
  accruing, or fold that into the pending `gol_metadata_v2` image upgrade (same classes).

## 2026-07-29 — pre-mainnet irreversibility review + loops get `minted_at` + `discoverer`
- **Goal:** review what must be in the contracts before mainnet because it can't be added later;
  fix the first findings: loops don't record their mint timestamp (wanderers do, via
  `PathFormData.minted_at`), and neither NFT records WHO discovered a creature.
- **Branch:** `perf/garden-batching` · **Commits:** same commit as the (2) entry above.
- **Changed:**
  - `GolLifeformsV3` now stamps `minted_at` (block timestamp) at mint, in its own
    `Map<u256, u64>` + `get_minted_at` getter (`interfaces_v3.cairo`). Own map, NOT a new
    `LifeFormData` field: the struct is shared with deployed v2 contracts, and appending to it
    would churn every minter/metadata ABI; a side map is storage-append-safe for an in-place
    Sepolia upgrade. Convention: `0` = grandfathered (minted before the field existed), same as
    `mint_nonce` 0. Data is mint-time-only — it cannot be backfilled, hence "before mainnet".
  - BOTH v3 NFTs (lifeforms + wanderers) now stamp `discoverer` — permanent artist attribution =
    the mint's `minter` param (the escrow payer: the human caller of the minter contract, not the
    recipient, which may be a gift target). No minter ABI change needed (they already pass
    `get_caller_address()`). `Map<u256, ContractAddress>` + `get_discoverer` (zero address =
    grandfathered), and `discoverer` APPENDED to `NewLifeFormEvent`/`NewWandererEvent` — safe:
    the SDK reads mints from ERC-721 `Transfer` events and parses others by leading positional
    fields with `>=`-length guards.
- **Verified:** `scarb build` ✅ · `snforge test` ✅ (101 passed, 11 ignored; mint tests assert
  both stamps, timestamp via cheatcode) · `cargo test -p gol-sdk` ✅ (43 — no event-shape coupling).
- **Decisions (review findings, not yet implemented):** the mainnet one-way doors are (1) the
  identity scheme (Poseidon/orbit-canonical/N=41/packing/`lt` ordering) frozen at first mint;
  (2) event schemas + mint-time fields (can't backfill); (3) the un-upgradeable minters holding
  the partial-path registry (replacing a minter strands in-flight mints); (4) the immutability
  endgame's role topology — `upgrade()` and MINTER_ROLE-granting are BOTH behind
  `DEFAULT_ADMIN_ROLE`, so renouncing it to freeze code also kills the ability to wire future
  periphery (pets v2, new minters) into NUT/NFT mint roles → needs a separate UPGRADER_ROLE
  before any renounce; (5) pluggable metadata renderer seam if art should evolve past the freeze.
- **Next:** the rest of the pre-mainnet checklist (audit, tiled mint exercise, metadata image
  upgrade). UPGRADER_ROLE separation: Henri points out it's addable later by upgrade — correct;
  reclassified as a step on the immutability-endgame runbook (MUST land before any renounce),
  not a mainnet-deploy blocker.
- **Goal:** confirm on-chain that the new `token_uri` (image + RUN_CAP=16, ~64–87M L2) survives the
  canonical Sepolia node's `starknet_call` budget before upgrading the live classes.
- **Branch:** `new_design`.
- **Did:** read the live `token_uri` on `sepolia.nodes.starknet.org` — the OLD image-less metadata
  returns fine (baseline). Built a throwaway probe contract (view fns calling the new `token_uri` on
  representative states) to measure the new path on-chain. Hit two blockers and stopped short:
  1. **strkd can't recover the funded `gol-bench` deployer.** Re-pairing gave a fresh empty client;
     account derivation is forward-only (`createAgentAccount` → index 11, unfunded) with no
     derive-by-index / import-by-address / recover method. Reported via STRKD-FEEDBACK (relayed to
     Henri). Funded a fresh account (`0x073376…ec39`, ~1 STRK left) instead.
  2. **Declaring the probe class costs ~1.03B L2 gas (~47 STRK at current Sepolia prices)** —
     node-confirmed (`actual used: 1031526945`), NOT a strkd quirk; declare gas scales with the
     class's Sierra size (~7.4k felts). Funding ~50 STRK for a throwaway wasn't worth it.
- **Decision:** ship on evidence. RUN_CAP=16 caps `token_uri` at ~64–87M, comfortably under the
  ~162M known-fail line (deployed 38.6M works), so the view call is very likely safe; on-chain
  confirmation is deferred to the real upgrade. Probe removed (never committed).
- **⚠️ Deploy-cost finding (for the real upgrade):** re-declaring the image-updated BACT + WNDR
  classes — LARGER than the probe — will cost **≥ ~1B L2 gas each to DECLARE** (~50+ STRK/class at
  current Sepolia l2 prices). Budget for it. This is a declare-fee concern, separate from the
  (still-inferred-safe) ~87M view-call gas.
- **Next:** at upgrade time, fund the deployer for the re-declares, then in-place upgrade BACT + WNDR
  (reversible) and confirm `token_uri` via a node `starknet_call` — that IS the definitive view-gas
  test. Consider raising RUN_CAP once the node's real view budget is measured.

## 2026-07-24 (7) — docs: how to display lifeforms safely (integration guide)
- **Goal:** document how a third-party surface (wallet, explorer, marketplace) should read the
  on-chain metadata and render each visual field **safely** — the companion to LOG (6)'s dual-field
  metadata. Prompted by the MC Wallet integration, where the untrusted `animation_url` needed a
  sandbox and the (not-yet-deployed) static `image` is the easy path.
- **Branch:** `docs/nft-rendering` · **Commits:** committed this session.
- **Changed:** new [nft-metadata-rendering.md](../nft-metadata-rendering.md) — decode `token_uri`;
  render `image` (`data:image/svg+xml`) in an `<img>` (script-less, safe); render `animation_url`
  (`data:text/html`, untrusted code) only in a cross-origin sandboxed iframe **plus** an
  egress-blocking CSP (the sandbox attribute alone does NOT stop `fetch`/beacons — the IP↔address
  leak), inject via `srcdoc`/`document.write` not a `data:` frame, reveal on user action, fail closed
  to the image. Documents the **version skew** (v2/v3 source emits both fields, but deployed Sepolia
  tokens are an earlier build with `animation_url` only). Wired into the docs index, the
  `development.md` docs-sync map, and cross-linked from STATUS's on-chain-render bullet. Links the
  MC Wallet reference implementation (starknet-innovation/mc-wallet#166).
- **Verified:** docs-only, no contract/frontend code touched. Baseline confirmed: `scarb build` ✅,
  `snforge test` ✅ **101 passed, 0 failed, 11 ignored**. Relative links and `path:line` refs checked
  against the current sources.
- **Decisions:** its own doc (new "Integration" category) rather than a section in frontend.md,
  since it targets any consumer, not the project's own app (which rebuilds the renderer locally).
  Kept the "emit a static `image`" recommendation OUT — it's already implemented in
  `gol_metadata_v2` (LOG 6); documented rendering, not a contract change.
- **Next:** unchanged from (6) — ship the `gol_metadata_v2` `image` upgrade (confirm token_uri
  survives a real Sepolia `starknet_call`, then upgrade the live classes) so deployed tokens carry
  the `image` this guide tells wallets to prefer.
- **Blockers:** none for the docs. The image-in-wallets outcome is still blocked on the v2/v3
  metadata redeploy (STATUS "Next up" #5).

## 2026-07-24 (6) — v2 metadata: static SVG `image` re-added (run-length), gas-measured
- **Goal:** a wallet couldn't show GoL NFTs — `gol_metadata_v2` emits only `animation_url` (untrusted
  on-chain HTML/JS the wallet won't execute), so it fell back to a placeholder. Re-add a static
  `image` (the standard dual-field NFT pattern) without reintroducing the density blow-up that made
  v2 drop SVG in the first place.
- **Branch:** `new_design` · **Commits:** metadata + this doc trail, committed this session. NOTE:
  the metadata work was first accidentally swept into a parallel UI commit (`860ad90`) by a broad
  `git add` in another session; history was split so the UI work (now `179d474`) and this metadata
  work are separate commits. LOG (4)/(5)'s "uncommitted WIP" are now `46371c3` / `179d474`.
- **Changed (`src/gol_metadata_v2.cairo`):** new `render_svg(state, bg, cell)` — unpacks the 41×41
  `GridState` with the EXACT `render_html` bit convention (row r, bit c = cell at x=c,y=r), emits
  **run-length `<rect>`s** (one per horizontal run of live cells) inside a single `<g fill>`, unit
  cells in a `0 0 41 41` viewBox, colours as `#RRGGBB`. `token_uri` now emits `image`
  (`data:image/svg+xml;base64`) + `animation_url`; `build_metadata_json` gained an `image` param
  (internal only — the `token_uri`/`derive_params` signatures every contract uses are unchanged).
- **Verified:** `scarb build` ✅; `snforge test` ✅ **101 passed, 11 ignored**. New tests: SVG places
  live cells at the right coords (runs + isolated cells + gaps); over-cap states fall back to the
  emblem while real creatures render in full. Gas benches (snforge L2 gas — SAME basis as the deployed
  38.6M — full `token_uri`): **sparse 64.1M, in-full ceiling (15 runs) 83.6M, over-cap fallback
  86.9M** → token_uri is now uniformly ~64–87M for ANY state. (A naive per-cell SVG was ~2.11B on a
  solid grid and would revert; run-length + the cap fix it.) NOT deployed to Sepolia.
- **⚠️ Calibration caveat:** the node view-call budget is a WINDOW — 38.6M (deployed, node-verified)
  works, ~162M reverts (v2-deployment.md). The image lifts token_uri to ~64–87M, INSIDE that window,
  so viability must be confirmed with a real `starknet_call` on the target Sepolia RPC before deploy.
  If that node caps below ~90M, the image needs more base64 optimisation (or raw-SVG) or a lower cap.
- **Decisions:** run-length over per-cell to keep clustered creatures cheap and bound `token_uri`.
  **Run-count cap (RUN_CAP=16) with a generic glider-emblem fallback** (Henri's call): over the cap,
  render_svg returns a fixed emblem in the token's colours so token_uri is revert-proof and roughly
  uniform-cost; set LOW because the view budget is tight, so only simple creatures render in full
  (busier ones show the emblem until the cap is raised post-calibration). SVG (and HTML) stay base64
  inside the raw-JSON `data:` URI (the `#` in colours would truncate a raw data URI). `image` = static
  current-generation snapshot / fallback; `animation_url` stays the canonical piece. Wallet-side, the
  rich view is safe only in a cross-origin `sandbox="allow-scripts"` iframe (the app already does
  this) — the `image` is what makes third-party wallets work without that.
- **Next:** confirm token_uri survives a real `starknet_call` on the target Sepolia RPC (the gating
  step — see the calibration caveat); tune RUN_CAP up if there's headroom. Then upgrade the deployed
  v2/v3 lifeforms + wanderers classes (all call `gol_metadata_v2::token_uri`) so live NFTs gain the
  `image`.
- **Blockers:** none for the code; deployment gated on Henri's go + the cap decision.

## 2026-07-24 (7) — SHIP: petri redesign merged to `main` → production
- **Goal:** Henri: "push to main." Ship the whole petri redesign + NUT/breathe work to the live site.
- **Branch:** `main` (fast-forwarded from `new_design`) · **Commits:** e074275 (24 ahead of the old
  963d24c trunk).
- **What shipped:** the entire `new_design` line — Garden/chrome/`/create`/`/incubator`/`/life`/
  `/pets`/`/leaderboards` petri redesign, the RPC v0.10 proxy (`/api/rpc`, with a v0.8 `?spec=compat`
  lane for starknet.js), the mint-multicall fix, NUT visibility + gating, and the rhythmic-tap breathe
  (creature page + Garden tiles + Ward cards; always feeds+adopts). Also carries the (not-yet-deployed)
  `gol_metadata_v2` `token_uri` image commits — inert repo code, no live-site effect.
- **How:** `git checkout main && git merge --ff-only new_design && git push origin main`. Clean
  fast-forward (main was an ancestor). Vercel auto-deploys `main` → https://gol-starknet.vercel.app.
- **Verified:** `next build` green at HEAD before the push; tsc/eslint clean across the session.
  ⚠️ NOT verified: any wallet-signed flow with a real wallet (mint / breathe / pet) — code-verified
  and fee-estimated only. Verify on the live site.
- **Next:** live-site wallet pass (set a creature free; tap-breathe on /life, a Garden tile, a ward);
  confirm the Vercel `NEXT_PUBLIC_GOL_RPC_URL` env; then the `gol_metadata_v2` image deploy.

## 2026-07-24 (5) — rhythmic tap on the Ward pet button too
- **Goal:** Henri: use the rhythmic-tap breathe on `/pets` ward cards (replacing the single "Pet"/
  "Adopt again" button).
- **Branch:** `new_design` · **Commits:** uncommitted WIP
- **Changed (`src/app/pets/page.tsx`):** new `WardBreathe` sub-component — its own `useBreathe` +
  `useBreathCap` + a compact `<BreatheControl>`; `onExhale(n) → breathe(cid, n)` (breatheLife(n-1)+
  pet → N gens, N NUT, bond renewed). Dropped the old `usePet`/`doPet`/`petLabel`/`petAction`, the
  `activeId`/`epoch` state and the pet-confirm effect — a confirmed breath bumps `txEpoch`, which the
  ward-walk already depends on, so the list + clocks refresh automatically. Used in both "Your wards"
  and "The reaper's rounds" (a breath there re-adopts). Header/reaper copy nudged to "breathe / tap
  again to go deeper".
- **Verified:** tsc + eslint clean, `next build` green. The control itself was verified earlier
  (harness); ward cards are wallet-gated so the live tap+exhale is part of Henri's wallet pass.

## 2026-07-24 (4) — BREATHE reframed as a rhythmic tap (creature page + Garden tiles)
- **Goal:** Henri's amendment — replace the ×1/×5/×10/×100 selector with a RHYTHMIC TAP: tap opens a
  1-second window; each tap within it +1 gen and refills the window; when the window empties the
  accumulated breath sends as ONE tx (N gens, N NUT, bond renewed — never auto-signed). Dynamic cap =
  the wallet's deepest single breath (×10 fallback). Full feedback: depth counter, draining window
  bar, hint line, exhale state with fast-forward. Feel: tap = button pulse + grid shimmer (NO
  stepping during accumulation — grid advances only on the confirmed exhale). Reduced-motion aware,
  spacebar taps, JetBrains Mono. Creature page primary; also the Garden tile hover affordance.
- **Branch:** `new_design` · **Commits:** uncommitted WIP
- **Changed (`ui/game-of-life`):**
  - `src/components/BreatheControl.tsx` (new, reusable): the tap state machine (idle → accumulating →
    exhaling), 1s window via timer + a key-restarted CSS drain bar (or a numeric countdown under
    reduced motion), depth counter (`×N`, rolls, pulses/shakes at cap), hint line, spacebar/Enter,
    button scale-pulse (WAAPI), `onExhale(n) → Promise<boolean>`, `onTap` for the grid shimmer. Taps
    past the cap pulse + refill but don't add.
  - `src/lib/gasCaps.ts`: `useBreathCap()` — `feedCap` for the connected tier (82 legacy / 340
    modern), ×10 when disconnected/unknown.
  - `src/lib/useBreathe.ts`: `breathe` now resolves `boolean` (confirm/reject) so the control can
    leave "exhaling…". (Still breatheLife(N-1)+pet → N gens, N NUT, bond.)
  - `src/components/BreathCanvas.tsx`: reel now ~250ms/gen (capped ~6s); dropped the unused BREATH_MS.
  - `src/app/life/[id]/page.tsx`: replaced the depth chips with `<BreatheControl>`; on confirm the
    on-chain render fast-forwards the N gens (BreathCanvas overlay) while the counter rolls, reward
    "You gave it N breaths. +N NUT."; a per-tap shimmer flashes the slide (WAAPI, reduced-motion off).
  - `src/components/CreatureCard.tsx`: `BacteriaTile` restructured — the dish+meta are a `.petri-tile-link`;
    a compact `<BreatheControl>` sits OUTSIDE the link, revealed on hover/focus (so tapping it never
    navigates). Wanderers (portraits) unchanged.
- **Verified (headless + CDP):** temp harness — 3 quick taps → "×3" + "breathe deeper" + drain bar;
  window closes → one exhale of 3 → confirmed (log `tap tap tap exhale:3 confirmed:3`); 14 fast taps
  cap at "×10" ("a full breath — release to send"). Garden — 7 bacteria tiles carry the hover control
  (opacity 0 until hover, "Connect to breathe" / "tap to give a breath"), links to /life intact,
  wanderers untouched. tsc + eslint clean, `next build` green. NOT verifiable headlessly: the wallet
  exhale itself + the on-render fast-forward (Henri's pass).
- **Note:** cap uses `feedCap` (max single move_lifeform_forward_n); the breath is breatheLife(N-1)+pet
  so ~N gens total — within the same budget. The tile control has no fast-forward reel (secondary
  surface); the creature page is the full treatment.

## 2026-07-24 (3) — deep breath also adopts; exact NUT costs (loop=period, path=seq_len)
- **Goal:** Henri's answers — (1) the deep breath should ALSO adopt (open/refresh the caretaker
  bond); (3) show the exact on-chain NUT cost for whatever's being minted.
- **Branch:** `new_design` · **Commits:** uncommitted WIP
- **Verified the cost model in Node** (loaded the WASM SDK, read each mint plan's `approve` amount):
  a **loop costs its period** NUT (period 2 → 2), a **wanderer costs its sequence_length** NUT
  (seq 1 → 1, 2 → 2, 211 → 211). So cost = the creature's generation count = the `period`/`seq_len`
  we already carry — the displayed figures are exact. Also confirmed the combined breathe+pet
  multicall estimates fine (`move_lifeform_forward_n` + `pet`).
- **Changed (`ui/game-of-life`):**
  - `src/lib/useBreathe.ts`: a breath is now `move_lifeform_forward_n(id, N-1)` + `pet(id)` in ONE tx
    (for N=1, just `pet`) — N generations forward, N NUT minted, AND the caretaker bond opened/
    renewed. So the deep breath adopts.
  - `src/app/life/[id]/page.tsx`: restored the bond (`useBond`) + the "in your care · N days left"
    clock (breathing manages it again); note reworded to say the breath takes it into your care.
  - `src/app/create/page.tsx`: the wanderer mint ("keep the journey as a Wanderer") now shows
    "the journey costs {seq_len} NUT · you have M" and gates on it (amber note when short), matching
    the loop's gate. Loop cost stays `period`, path cost = `sequence_length` — both exact.
- **Verified:** Node cost/estimate checks above; headless /life renders the depth selector + the
  care-inclusive note; tsc + eslint clean, `next build` green. NOT verifiable headlessly: the
  wallet tx (deep breath + adopt, the gates) — Henri's pass.
- **Point 4 (resolved 2026-07-24):** Henri chose to keep Garden tiles as plain links — removed the
  decorative "breathe" hover affordance (`.petri-breathe` span + CSS + keyframes) from `BacteriaTile`
  and `FeatureTile`. The subtle dish-lift on hover stays (link affordance). No direct breathe-tx on
  tiles; all breathing happens on `/life`.

## 2026-07-24 (2) — NUT woven in (visibility + gating) and deeper breaths (multi-gen)
- **Goal:** Henri's amendment. NUT is sustenance (free faucet), never currency. (1) NUT visibility:
  top-bar chip, /create birth-cost gate, /incubator per-egg cost. (2) Deeper breaths: a ×1/×5/×10/×100
  depth on the breathe control — one tx, N generations, N NUT — with the render fast-forwarding.
- **Branch:** `new_design` · **Commits:** uncommitted WIP
- **Changed (`ui/game-of-life`):**
  - `src/lib/useNut.ts` (new): `useNutBalance()` — reads `sdk.nutBalance(address)` (18-dec → whole
    NUT), refetched on `txEpoch`.
  - `GardenHeader`: quiet mono NUT chip (`.tb-nut`, #7a7a88) next to the address when connected,
    linking to /pets.
  - `/create`: birth cost = the loop's period in NUT. Before the single-tx "Set it free" shows
    "This birth costs N NUT · you have M"; if short, the button is disabled and a warm amber note
    (`.nut-note`, #f97316, never red) invites breathing, linking to the Garden. `useNutBalance`.
  - `/incubator`: each hatch-in-progress egg shows "costs N NUT · you have M" + the same amber note
    when short.
  - `BreathCanvas`: new `breathDepth` prop — a breath now reels through N generations (perGen scaled
    so the whole exhale stays ~2.8 s), reduced-motion snaps N gens instantly.
  - `/life` `LoopDetail`: **reframed "Breathe life" as a deep breath** — a ×1/×5/×10/×100 selector
    (`.depth-chip`) → `useBreathe.breathe(id, depth)` (`move_lifeform_forward_n`, N gens + N NUT).
    During the breath the on-chain iframe is overlaid by BreathCanvas fast-forwarding the N gens
    (mounted throughout so the signal fires), the counter rolls up by N, and the reward reads
    "You gave it N breaths. +N NUT.", then it settles back to the iframe with the advanced state.
- **Decisions / flags (need Henri):**
  - The breathe button previously *petted* (1 gen + opened a caretaker bond / "adopt automatically").
    The amendment reframes it as the deep breath (`breatheLife`, no bond), so I **removed the pet
    call + bond clock from /life**. Net effect: no caretaker bond is created from /life anymore
    (the /pets ward list + reaper still read existing bonds). If breathing should also adopt, or if
    adoption wants its own control, say so — small change.
  - The amber note links to the Garden home (the "needs a breath" lens was removed earlier).
  - `/incubator` cost uses the egg's `period` (loop length); the on-chain NUT cost for *paths* may
    differ — using `period` as the shown figure for now.
  - Garden tile hover stays a link into /life (where ×1 is default); I did not add a direct
    breathe-tx on tiles.
- **Verified (headless + CDP, live Sepolia):** /life shows the ×1/×5/×10/×100 selector (×1 default),
  reframed note, on-chain iframe as the resting view; NUT chip correctly absent without a wallet.
  tsc + eslint clean, `next build` green. NOT verifiable headlessly (wallet-gated): the NUT chip
  value, the /create + /incubator gates, and the actual deep breath + fast-forward animation.
- **Next:** Henri's wallet pass on the preview — breathe ×5/×10, watch the fast-forward + NUT tick;
  set a creature free and hit the NUT gate. Then the pet/bond decision above.

## 2026-07-24 — /create: hatching one of a loop+wanderer pair saves the other for incubation
- **Goal:** Henri: a loop-with-transient yields BOTH a loop and a wanderer. Hatching one redirects
  to the newborn's page and the other is lost. Keep the non-hatched one in the incubator: hatch the
  loop → save the wanderer; hatch the wanderer → save the loop.
- **Branch:** `new_design` · **Commits:** uncommitted WIP
- **Changed (`ui/game-of-life/src/app/create/page.tsx`):** extracted a `bookmark(...)` helper
  (owner-stamped `addBookmark`). `openLoop` now bookmarks the wanderer (`pathTokenId`, when
  `pathMintable && !pathMinted`) before minting the loop; `openPath` bookmarks the terminal loop
  (`tokenId`, when `fate.kind==="loop" && !already`) before minting the wanderer. `sendToIncubator`
  reuses the same helper. The saved creature lands in `/incubator` → "Saved creatures" for the
  connected wallet (owner-scoped), and auto-clears if it's later minted.
- **Verified:** tsc + eslint clean, `next build` green. NOT verifiable headlessly: the hatch itself
  is wallet-gated (the `openLoop`/`openPath` buttons only appear with a connected wallet), so the
  save-the-other behavior needs Henri's wallet pass on the preview. The bookmark write is synchronous
  and fires before the mint, so it persists regardless of the mint outcome/redirect.
- **Next:** Henri's wallet pass on the `new_design` preview (mint a loop-with-transient, confirm the
  wanderer shows up in the Incubator, and vice-versa), then breathe/pet QA + ship decision.

## 2026-07-10 (evening, 14) — ROOT CAUSE of "Set it free": a malformed multicall (+ v0.10/starknet.js split)
- **Goal:** finally fix "Set it free". After the direct-wallet rewrite it stopped hanging and
  surfaced the wallet's generic `Error: Execute failed` (inpage.js) with `txCalls: Array(3)`.
- **Branch:** `new_design` · **Commits:** uncommitted WIP
- **How it was found:** loaded the WASM SDK **in Node** (the call-builders are pure), rebuilt a real
  mint's calls, and ran `estimateInvokeFee(skipValidate)` against the agent account to surface the
  hidden revert. Two findings:
  1. **The real bug:** every SDK call-builder returns an **array** of calls (`[{...}]`).
     `useMint` did `plan.steps[last].calls.push(sdk.setRenderParamsCall(...))` — pushing the *array*
     as one nested element → the mint multicall became `[approve, mint_loop, [set_render_params]]`.
     The 3rd element has no `contractAddress`/`entrypoint`, so the wallet rejects the whole tx with a
     generic "Execute failed". The appearance feature is always on now (random roll), so EVERY
     `/create` mint was broken. **Fix: spread it** — `push(...sdk.setRenderParamsCall(...))`. With the
     spread, a fresh (unminted) toad **estimates OK** (overall_fee returned) → the mint is valid.
  2. **Bonus incompat:** the official **v0.10 node is unusable by starknet.js 7.6.4** — it speaks RPC
     0.8.1 and the node refuses it ("spec not supported"; also rejects `block_id:"pending"`). That
     silently broke our `pollTx` (tx confirmation) and `detectTier` (gas tier). The Rust/WASM SDK
     handles v0.10 fine (reads load).
- **Changed (`ui/game-of-life`):**
  - `src/lib/useMint.ts`: spread `setRenderParamsCall` / `setPathRenderParamsCall` into the plan's
    calls (both loop + path).
  - `src/lib/config.ts`: `UPSTREAM_RPC` (v0.10, SDK) + new `UPSTREAM_RPC_COMPAT` (v0.8, starknet.js);
    `RPC_URL` = proxy default, `RPC_URL_COMPAT` = proxy `?spec=compat`.
  - `src/app/api/rpc/route.ts`: `?spec=compat` forwards to the node's v0_8 endpoint; default → v0.10.
  - `src/lib/wallet.tsx`: `pollTx` + `detectTier` now use `RPC_URL_COMPAT` (v0.8) so starknet.js can
    actually talk to the node. (The write path already goes straight to the wallet, its own node.)
- **Verified:** Node estimate — fresh toad mint **ESTIMATE OK** (spread fix). Proxy: `/api/rpc`
  → 0.10.3-rc.0, `/api/rpc?spec=compat` → 0.8.1. Garden loads through the v0.10 proxy (no CORS).
  tsc + eslint clean, `next build` green. NOT verifiable headlessly: the wallet popup + a real mint
  (needs Henri, and his account needs `period` NUT — earned by breathing).
- **Next:** Henri retests "Set it free" — it should now prompt and go through (given NUT balance).
  Then breathe/pet QA and the ship decision.

## 2026-07-10 (evening, 13) — wallet write path: hand tx straight to the wallet; /create play-on-click
- **Goal:** Henri: (1) `/create` right grid should play immediately when a pixel is clicked; (2)
  "Set it free" STILL stuck — now hangs on "Confirm in your wallet…" with NO console error and no
  popup (so `execute()` isn't throwing — it's hanging with no signature prompt).
- **Branch:** `new_design` · **Commits:** uncommitted WIP
- **Root cause (write path):** read starknet.js 7.6.4's `WalletAccount.execute` — it does NOT
  estimate via the provider; it reformats the calls and calls `swo.request("wallet_addInvokeTransaction")`,
  passing `calldata` THROUGH UNMODIFIED, and `WalletAccount.connect` adds a `requestAccounts` round
  trip on first use. The most likely hang is the wallet silently choking on numeric/BigInt calldata
  (or the extra connect step) — either way it never pops and never rejects, so nothing is logged.
- **Changed (`ui/game-of-life`):**
  - `src/lib/wallet.tsx`: `execute()` now bypasses `WalletAccount` entirely and calls
    `swo.request({ type:"wallet_addInvokeTransaction", params:{ calls }})` directly, normalising each
    call to `{contract_address, entry_point, calldata}` with **calldata forced to felt strings**
    (`BigInt(x).toString()`). No provider, no estimate, no extra connect → our RPC node/spec can't
    block the prompt, and numeric calldata can't hang the wallet. Removed the now-dead `accountRef`
    (+ its resets in connect/disconnect/switch/poll). Raw failures still `console.error`'d.
  - `src/app/create/page.tsx`: the drawing-changed effect now `setPlaying(true)` so any click on the
    seed plays the right grid immediately — fixes the freeze after a pattern died (`detect` had set
    `playing=false` and nothing turned it back on). Also wired the mint **stall recovery** into the
    verdict: if the wallet doesn't open within ~25 s, a "The wallet didn't open — knock again" button
    appears (`stalled`/`continueMint`) so a hang is recoverable instead of an infinite spinner.
- **Verified (headless + CDP, live Sepolia):** play-on-click — a `?rows=` single cell dies
  ("gone at gen 1", playing=false), then drawing a block replays to "wandered 1 · still life"
  [REPLAYED]. tsc + eslint clean, `next build` green. NOT verifiable headlessly (no wallet): whether
  the direct `wallet_addInvokeTransaction` path fixes the prompt — needs Henri to retest.
- **Next:** Henri retests "Set it free". If it now pops → great; if not, the `[gol] wallet execute
  failed` line (or the "knock again" button appearing) tells us if it's reaching/leaving the wallet.

## 2026-07-10 (evening, 12) — RPC → official v0.10 nodes via a same-origin proxy
- **Goal:** Henri: use the official Starknet nodes — `https://sepolia.nodes.starknet.org/rpc/v0_10`
  and `https://mainnet.nodes.starknet.org/rpc/v0_10` (given in response to the wallet write-path
  debugging; the v0.10 spec may matter for the wallet).
- **Branch:** `new_design` · **Commits:** uncommitted WIP
- **Finding:** those nodes send **no CORS headers** (verified: `starknet_specVersion` → 200
  `0.10.3-rc.0`, but the OPTIONS preflight is 405 and there's no `Access-Control-Allow-Origin`).
  Pointing the browser at them directly broke every read — the Garden loaded empty with CORS errors
  in the console. This is exactly why the config previously used the Cartridge gateway.
- **Changed (`ui/game-of-life`):**
  - `src/app/api/rpc/route.ts` (new): a same-origin JSON-RPC proxy. The browser POSTs to `/api/rpc`
    (no CORS), and the route forwards to `UPSTREAM_RPC[NETWORK]` server-side, passing the body
    through. `force-dynamic`, no caching, 502 on upstream failure.
  - `src/lib/config.ts`: `UPSTREAM_RPC` holds the two official v0.10 node URLs; `RPC_URL` now
    defaults to the same-origin `/api/rpc` (absolute in the browser via `window.location.origin`),
    still overridable with `NEXT_PUBLIC_GOL_RPC_URL` to hit a CORS-enabled node directly.
  - Both the WASM SDK reads and the wallet's `RpcProvider` now flow through the proxy → the official
    node.
- **Verified (headless + CDP, live Sepolia):** `/api/rpc` returns spec `0.10.3-rc.0`; the Garden
  loads creatures through the proxy with ZERO CORS errors (feature + 4 bacteria). tsc + eslint clean,
  `next build` green (`/api/rpc` is a dynamic route). NOT verified (needs wallet): whether routing
  the wallet provider through the v0.10 node fixes "Set it free" — retest + the `[gol] wallet execute
  failed` console line will confirm.
- **Tradeoff / note:** every SDK read + wallet-provider read is now one function invocation on
  Vercel (the Garden fans out to many). If that's too heavy, set `NEXT_PUBLIC_GOL_RPC_URL` to a
  CORS-enabled gateway to let the browser read a node directly and bypass the proxy. Also: the
  existing `.env.local` sets `NEXT_PUBLIC_RPC_URL` (wrong name — inert; the config reads
  `NEXT_PUBLIC_GOL_RPC_URL`), so the proxy default is what's active locally; check the Vercel env
  before merging to `main`.
- **Next:** Henri retests "Set it free" on the v0.10 proxy; if still no prompt, the console error
  pins the write-path fix.

## 2026-07-10 (evening, 11) — /create: settle-counter + bigger mints; wallet-execute logging
- **Goal:** Henri: (1) on `/create`, freeze the right-grid generation counter once a creature
  settles, and disclose the wanderer length (transient) + final loop length; (2) raise the mint tx
  ceiling so creatures up to ~2500 generations are mintable; (3) "Set it free" STILL doesn't prompt
  — now shows "Confirm in your wallet…" then "Try again" with no popup, so the failure moved into
  `execute()` itself.
- **Branch:** `new_design` · **Commits:** uncommitted WIP
- **Changed (`ui/game-of-life`):**
  - `src/app/create/page.tsx`: the sim only increments `gen` while `!resolvedRef.current`, so the
    counter freezes the moment the fate resolves (the grid keeps cycling the loop). The right board
    caption now reads the fate instead of the live counter: loop → `wandered {steps} · loops every
    {period}` (or `still life`; the `wandered …` prefix only when steps>0), dead → `gone at gen
    {steps}`, else `generation {gen}`.
  - `src/lib/gasCaps.ts`: `MAX_TX` 8 → **48**, sized so a ~2500-gen creature is mintable even under
    legacy metering (2500-step loop ≈ 43 tx; modern ≈ 10). Big ones route to the Incubator
    (resumable). This value gates both the client `plannedTxCount` checks and the SDK planner.
  - `src/lib/wallet.tsx`: wrapped `execute()` in try/catch that `console.error`s the *raw* failure
    plus the `calls` payload — the humanized/truncated UI message hides the real cause, and the write
    path can't be driven headlessly, so we need the actual error to fix the no-prompt bug.
- **Verified (headless + CDP, live Sepolia):** counter freezes and discloses — blinker
  "loops every 2", block "still life", single cell "gone at gen 1", row-of-4 "wandered 2 · still
  life" (all stable across 2.2 s). tsc + eslint clean, `next build` green. NOT resolved: the
  wallet-execute failure — needs Henri's console error (now logged as `[gol] wallet execute failed`).
- **Next:** Henri to paste the `[gol] wallet execute failed` console output so the write path can be
  fixed; then the ~2500-gen mint can actually be exercised.

## 2026-07-10 (evening, 10) — fix: "Set it free" not prompting the wallet
- **Goal:** Henri: on `/create`, clicking "Set it free" doesn't prompt a wallet action.
- **Branch:** `new_design` · **Commits:** uncommitted WIP
- **Diagnosis:** in `useMint.runPlan`, a pre-flight on-chain read (`alreadyMinted` → `sdk.lifeform`,
  a self-heal for interrupted mints) is `await`ed *before* the mint loop sets `signing` and calls
  `execute()` (the signature request). If that read stalls — and the browser RPC gateway does stall
  on `lifeform` reads (seen this session: a `/life` loop hung ~23 s on the same call) — then
  `execute()` is never reached: the wallet never pops and the button looks dead (status is still
  `idle`). Not caused by the modal removal; that just made the first click the mint trigger.
- **Changed (`ui/game-of-life/src/lib/useMint.ts`, `runPlan`):** set `status="signing"` immediately
  (the click can't look dead), then race the `alreadyMinted` read against a 2.5 s timeout — on
  timeout/error, proceed to mint anyway (a duplicate final mint reverts harmlessly on-chain, as the
  existing comment notes). A healthy read (<½ s) still short-circuits an already-minted creature; a
  stalled read can no longer block the wallet prompt. Covers both `mint` and `mintPath`.
- **Verified:** tsc + eslint clean, `next build` green. NOT verifiable headlessly (no wallet): the
  actual prompt — needs Henri to retry with a connected wallet.
- **Next:** Henri to confirm the wallet now prompts on "Set it free"; then wallet-connected QA of
  the rest (breathe/pet, hatch), then ship decision.

## 2026-07-10 (evening, 9) — Incubator per-wallet + auto-clean; daycare removed
- **Goal:** Henri, on `/incubator`: rename "Mints in progress"→"Hatches in progress" and
  "Saved patterns"→"Saved creatures"; remove a creature from the incubator once it's hatched;
  add "Open in Create" under hatches-in-progress; hide pending mints when no wallet is connected;
  and make the incubator per-wallet (switching accounts must not show the other's eggs / midway
  hatches). On `/pets`: remove the daycare (the "hand to daycare" hand-off and the whole section).
- **Branch:** `new_design` · **Commits:** uncommitted WIP
- **Changed (`ui/game-of-life`):**
  - `src/lib/incubator.ts`: added `owner?: string` to `Bookmark` and `MintProgress` (the wallet the
    egg belongs to; legacy entries without it are shown to nobody now).
  - `src/lib/useMint.ts`: `MintMeta` carries `owner`; `mint`/`mintPath` pass the connected `address`
    (post-guard, so it's non-null), and `persist()` stamps it on saved progress. (Passed via meta,
    not read in `runPlan`, to avoid the stale-closure trap — `runPlan`'s deps don't include address.)
  - `src/app/create/page.tsx`: `sendToIncubator` stamps `owner: address` on the bookmark.
  - `src/app/incubator/page.tsx`: `refresh()` filters both lists by `sameAddr(owner, connected)`
    (BigInt compare); no wallet → "Connect to see your incubator" (nothing leaks). Renamed both
    headings. An effect now removes any entry found on-chain (`lifeform`/`pathLifeform`) from local
    storage + refresh, so a hatched creature disappears from the incubator (the "hatched" cards are
    gone). Added "Open in Create →" to hatches-in-progress (via the `?rows=` hand-off).
  - `src/app/pets/page.tsx`: removed the daycare entirely — transfer state, `doTransfer`,
    `daycareControl`, the `gol:lent` lent-tracking, and the "Sitting for a friend"/"Out at daycare"
    categories + Daycare section. Only "Your wards" + "The reaper's rounds" remain; ward cards show
    just the Pet action. `reaped` = every lapsed bond you petted.
  - `src/app/life/[id]/page.tsx`: for consistency, also removed the loop page's daycare hand-off
    (the "hand to daycare →" button + transfer form + state); the bond clock stays. Dropped the now
    -unused `execute`/`waitForTx` from its wallet destructure.
- **Verified:** built client bundle contains "Hatches in progress" / "Saved creatures" /
  "Open in Create" / the two connect prompts, and has ZERO matches for "Mints in progress",
  "Saved patterns", "hand to daycare", "hand back", "Sitting for a friend", "Out at daycare",
  "pet-sit while". Headless (no wallet): `/incubator` and `/pets` render their per-wallet connect
  prompts without error. tsc + eslint clean, `next build` green (`/pets` 5.45→4.69 kB,
  `/life` 8.39→8.02 kB). NOT verifiable headlessly (needs a connected wallet + local eggs): the
  per-wallet filtering across two accounts, the hatched-→-removed cleanup, and "Open in Create".
- **Next:** unchanged — wallet-connected QA, then ship decision.

## 2026-07-10 (evening, 8) — /create: no colour modal (roll at random); 15 fps; breathe wording
- **Goal:** Henri: (1) on `/life` loops, change the pending label "The chain is writing…" to
  "Breathing…"; (2) on `/create`, drop the pick-colours/speed modal — "Set it free" mints straight
  away with a look rolled at random; (3) default the `/create` sim to 15 fps. (His wanderer
  "bound for a loop" bullet was already shipped in evening-7 — no change needed.)
- **Branch:** `new_design` · **Commits:** uncommitted WIP
- **Changed (`ui/game-of-life`):**
  - `src/app/life/[id]/page.tsx`: LoopDetail breathe button pending state "The chain is writing…" →
    "Breathing…" (signing stays "Drawing breath…").
  - `src/app/create/page.tsx`: removed the set-free colour/speed modal (`freeing`/`Free` state, the
    swatch/segmented picker, the "Release it →" panel). `openLoop`/`openPath` now `rollLook()` —
    pick a random cell colour + background + speed from the existing palettes — and call
    `mint`/`mintPath` immediately. Minting progress + errors now render inline in `verdict-actions`
    ("Confirm in your wallet…" / "Breathing it to life…" / "Try again"). The "it's alive" born drop
    stays (uses a new `bornPreview` + the rolled colours). Sim default speed 10 → **15 fps**.
- **Verified (headless + CDP, live Sepolia):** `/create` speed slider defaults to 15; no picker
  modal / swatches in the DOM; loading a blinker still detects "This one lives." and the actions
  render (already-minted → "already lives → meet it"). tsc + eslint clean, `next build` green
  (`/create` 4.76 → 4.5 kB). NOT verifiable headlessly (needs wallet + an unminted pattern): the
  straight-to-mint tx with the rolled colours.
- **Next:** unchanged — wallet-connected QA, then ship decision.

## 2026-07-10 (evening, 7) — /life wanderers: "bound for" resolves to a real loop
- **Goal:** Henri: a wanderer's "bound for a loop" should point somewhere real. If the loop it
  settles into already exists on-chain, link to that loop's page; if it isn't born yet, hand it to
  /create with the loop preloaded so it can be set free.
- **Branch:** `new_design` · **Commits:** uncommitted WIP
- **Changed (`ui/game-of-life`):**
  - `src/app/life/[id]/page.tsx` (`PathDetail`): after loading a wanderer, check
    `sdk.lifeform(target_loop_id)`. The "Bound for" trait now resolves three ways: `a loop…`
    (checking) → `a loop →` linking to `/life/<loop>` when it exists → `a loop — not yet born, set
    it free →` linking to `/create?rows=<canonical>` when it doesn't. The canonical rows come from
    `sdk.findLoop(start_state, sequence_length + period + 8).smallest` (falls back to `start_state`).
  - `src/app/create/page.tsx`: the load effect now also accepts `?rows=a,b,c…` (41 row bitmasks) and
    drops them onto the left seed grid, then rewrites the URL to `/create` (same pattern as the
    existing `?load=<bookmark>` hand-off from the Incubator).
- **Verified (headless + CDP, live Sepolia):** a wanderer whose loop is NOT minted shows
  "a loop — not yet born, set it free →" linking to `/create?rows=<encoded canonical>`; following a
  `?rows=` link drops the pattern on the left grid, the right grid evolves it (gen 89), and the
  verdict reads "This one lives — a rhythm every 2 beats" (blinker), URL rewritten to `/create`.
  The existence check resolves (returned `false` for that wanderer, so the on-chain call works); the
  loop-exists branch is the pre-existing `/life/<loop>` link. tsc + eslint clean, `next build` green.
- **Next:** unchanged — wallet-connected QA, then ship decision.

## 2026-07-10 (evening, 6) — /life loop detail: one act, on-chain renderer only
- **Goal:** Henri wants the loop detail stripped down: (1) a single "Breathe life" button that
  *pets* (adoption is automatic — no separate adopt/pet button); (2) drop the replay progress bar;
  (3) make the on-chain renderer the only view (no "view the on-chain renderer" toggle, no
  replayable BreathCanvas); (4) remove the redundant "Lived generations" section.
- **Branch:** `new_design` · **Commits:** uncommitted WIP
- **Changed (`ui/game-of-life/src/app/life/[id]/page.tsx`, `LoopDetail`):**
  - **One action:** removed `useBreathe` and the anonymous "Breathe life" path entirely. The single
    button now runs `doBreathe → connect / switchToSepolia / pet(id)`, so breathing = petting =
    automatic adoption + a renewed 7-day bond. Reworded the note to say so. The bond clock + daycare
    hand-over stay (they only surface once you're connected and hold a bond).
  - **Renderer:** the left slide is now always the on-chain iframe (`onchainHtml`); dropped the
    `showIframe` toggle, the `BreathCanvas` instance, the replay scrubber (`.life-scrub`) + `scrubGen`
    / `breathSignal` state, and the `view the on-chain renderer` button. Kept the generation counter.
  - **Below:** removed the "Lived generations" section (prose duplicated the counter + loop-period
    trait) and the now-orphaned `Filmstrip` component; `.life-below` → single column. Pruned the
    now-unused imports (`useMemo`, `fromRows`/`step`/`Cells`, `useBreathe`).
- **Verified (headless + CDP, live Sepolia, genesis blinker loop):** the acts row has exactly one
  button ("Connect to breathe" logged-out); no scrubber / no range input; no on-chain toggle; the
  slide is an `<iframe>` (on-chain renderer) with no BreathCanvas; the only `life-below` section is
  "Caretakers"; the "344 generations lived" counter remains. tsc + eslint clean, `next build` green
  (route 9.25 → 8.22 kB). NOT verified (needs wallet): the breathe/pet tx itself.
- **Next:** unchanged — wallet-connected QA, then ship decision.

## 2026-07-10 (evening, 5) — Garden trims + wanderers finally wander
- **Goal:** Henri: (1) drop the "Found a living pattern? Set it free" invite and the newly/oldest/
  hungry lens toggle from the Garden home — default to newest; (2) make the big "creature of the
  moment" one of the top-10 most-fed loops OR one of the top-10 longest methuselahs (not just the
  hungriest/eldest); (3) answer why the wanderer render sits frozen and fix it.
- **Branch:** `new_design` · **Commits:** uncommitted WIP
- **Changed (`ui/game-of-life`):**
  - `src/app/page.tsx`: removed the `.invite` "Set it free" link (and the now-unused `Link` import).
    The lead is just eyebrow + thesis now.
  - `src/components/Garden.tsx`: removed the lens toggle (`Lens` type, `LENS_LABEL`, the button
    group, and the page-reset-on-lens effect) — the walls are always newest-first. The **feature is
    now picked once** (when both loops+paths have loaded) from a pool of the top-`FEATURE_POOL=10`
    most-fed *living* loops (by `age`) + the top-10 longest *live* methuselahs (paths by
    `sequence_length`), chosen at random so the spotlight rotates between visits. Both walls exclude
    whoever's featured so nobody appears twice.
  - `src/components/CreatureCard.tsx`: `FeatureTile` now takes a `FeatureData` union
    (`{kind:"loop",lf} | {kind:"path",pf}`) so it can spotlight a wanderer too — a loop cycles in
    place (with the breathe affordance), a wanderer plays out its journey (`animate`, no breathe).
    Its caption line reflects why it's featured (most-breathed count / journey length).
  - `src/app/life/[id]/page.tsx` (`PathDetail`): the wanderer was **deliberately frozen** —
    `BreathCanvas playing={false} scrubGen={0}` pinned it to frame 0 (it was never the on-chain JS
    renderer; that's the iframe, loop-only). Now `playing={true} scrubGen={null}` so it steps its
    start-state forward at the on-chain speed — i.e. it travels toward its loop. Reworded the eyebrow
    ("a journey toward a loop") and the description (dropped "portrait / caught moment", now "a
    journey, not a pet … playing out from where it began").
- **Verified (headless + CDP, live Sepolia):** Garden home shows no invite line and no lens toggle;
  feature = "Period-164 Loop · one of the most-breathed lives — 1,927 generations"; walls render in
  on-chain colours. On a wanderer's `/life` the slide canvas `toDataURL()` differs across a 1.5 s gap
  (frozen → moving, confirmed) and the new copy renders. tsc + eslint clean, `next build` green.
  NOT changed/re-verified: any wallet-connected tx.
- **Next:** unchanged — wallet-connected QA, then ship decision.

## 2026-07-10 (evening, 4) — /create amendment: back to two grids
- **Goal:** Henri: restore the old two-grid "draw left, watch right" layout (it was the best part).
  The single-grid + background-fate version replaced it this session; bring the matched pair back.
- **Branch:** `new_design` · **Commits:** uncommitted WIP
- **Changed (`ui/game-of-life`):** `src/app/create/page.tsx` — top half rewritten to TWO 41×41 grids:
  - **LEFT** = the seed (input), always editable, light blue `#9ad1ff` ("yours — not yet alive");
    toolbar Clear / Invert / Randomize + Blinker/Glider/Block presets.
  - **RIGHT** = the live sim (output), read-only green `#7ef9a0`, generation number in mono above,
    Play/Pause + speed below. Advances one Conway gen per tick via `sdk.stepRows` (no separate JS
    engine — matches the contract). Resets to gen 0 whenever the left drawing changes.
  - **Destiny is now read FROM the right grid's evolution** (not a background full-run): a `detect()`
    called once per step accumulates visited states, catching a repeat (LOOPS, with period +
    canonical from the visited loop), an empty grid (GOES OUT), or giving up after 4,096 gens
    (still wandering). StrictMode-safe (detection runs in the interval tick + seed recorded on reset).
  - Kept intact: the warm verdict, the set-free colours ritual (cell + bg via `set_render_params`,
    no name input — name shown in the success state), the multi-sig → /incubator handoff, the
    wanderer secondary, and the "it's alive" drop → garden.
  - `globals.css`: `.create-stage` → two equal columns; added `.board` / `.board-cap` / `.board-gen`;
    stacks under 900px (both grids stay visible).
- **Verified (headless + CDP, live Sepolia):** 2 grids render (blue seed / green life), the right
  grid evolves (gen 5 → 30), and the verdict is read from that evolution — Blinker → "loops every 2
  beats" (+ already-lives link for the genesis one), Block → "still life". tsc + eslint clean,
  `next build` green. NOT re-verified (needs wallet): the set-free tx (unchanged from prior QA).
- **Next:** unchanged — wallet-connected QA, then ship decision.

## 2026-07-10 (evening, 3) — Garden amendment: fewer, bigger creatures
- **Goal:** Henri: the dense mosaic rendered 41×41 creatures as "green confetti" — prefer FEWER,
  LARGER tiles so a creature is legible and its owner-defined colours read. Wonder over density.
- **Branch:** `new_design` · **Commits:** uncommitted WIP
- **Changed (`ui/game-of-life`):**
  - `globals.css`: `.petri-grid` min tile 148px → `min(100%, 300px)` → ~3 large columns on desktop
    (was 6–8); bigger gap. Added `.petri-feature` / `.feature-*` (the hero) and `.petri-more`.
  - `CreatureCard.tsx`: tile canvas res 280 → 440 for crispness at the larger size; new
    **FeatureTile** — a large render beside a caption.
  - `Garden.tsx`: on the default lens, feature a **"creature of the moment"** above the wall — the
    hungriest living bacterium, else the eldest (by age) — excluded from the wall so nobody repeats.
    Per-collection **"show more"** pagination (`PAGE=8`) reveals the rest; resets when the lens changes.
- **Verified (headless + CDP, live Sepolia):** feature = "Period-164 Loop" (the eldest), 3 large
  bacteria-wall tiles with distinct on-chain colours (teal/green/magenta, legible — not confetti),
  1 feature + 2 collection headings (no dup), pagination wired. tsc + eslint clean, `next build` green.
- **Next:** unchanged — wallet-connected QA, then ship decision.

## 2026-07-10 (evening, 2) — /leaderboards (Records) rebuilt: the garden's census — sweep complete
- **Goal:** rebuild `/leaderboards` per the brief — a discovery census / hall of fame, celebratory
  and communal, never a competition for money. Finishes the redesign sweep.
- **Branch:** `new_design` · **Commits:** uncommitted WIP
- **Changed (frontend, `ui/game-of-life`):** `src/app/leaderboards/page.tsx` rewritten from six
  stacked boards to **three toggleable** ones:
  - **Longest-lived** — creatures by generations lived (`recentLifeforms` sorted by `age`).
  - **Methuselahs** — longest transients before settling (wanderers by `sequence_length`).
  - **Most devoted** — addresses by total breaths given (`topBreathers`).
  Each row: rank in mono, a tiny live on-chain thumbnail (creature boards), name/short-id or
  truncated address, and the metric in **#22c55e**. Rank #1 gets a green glow + larger thumbnail +
  green rank + row tint. Clean dark table on **#0c0c10** panels, **#1f1f28** dividers. No medals, no
  emoji, no money figures. Creature rows → `/life/[id]`. All values from chain.
  - `globals.css`: `.records-*` / `.record-row` / `.rec-tab` styles.
- **Verified (headless Chrome + CDP, live Sepolia):** all three boards populate with real data —
  Longest-lived #1 "Period-164 Loop" 1,927 gen (glow + larger thumb), Methuselahs #1 Wanderer 821
  gen, Most devoted #1 addr 2,884 breaths; toggle switches boards; on-chain thumbnail colours
  faithful. tsc + eslint clean, `next build` green.
- **Redesign sweep COMPLETE:** Garden, global chrome, Create, Incubator, Life, Wards, Records — all
  in the petri look. No pages left on the old design.
- **Next:** wallet-connected QA pass across the whole flow (set-free mint, hatch, breathe/pet/
  daycare — the only parts not exercisable headlessly); then decide about pushing `new_design` /
  opening a PR / merging to `main`.
- **Blockers:** none.

## 2026-07-10 (evening) — /pets (Wards) rebuilt: the caretaker home
- **Goal:** rebuild `/pets` per the brief — a windowsill of the creatures you keep alive. Tender,
  never a scold; loss-aversion as the gentle engine; hunger shown as warmth, never alarm-red.
- **Branch:** `new_design` · **Commits:** uncommitted WIP
- **Changed (frontend, `ui/game-of-life`):** `src/app/pets/page.tsx` rewritten into three sections:
  - **Your wards** — every creature you hold a bond for AND have petted; sorted **soonest-to-hungry
    first**. Card = live on-chain thumbnail + name + the **hunger clock as hero** ("3 days until
    hungry", amber #f97316 when ≤2 days / wilting, green otherwise), a one-tap **Pet** (shared usePet;
    resets the 7-day clock), and **hand to daycare**.
  - **The reaper's rounds** — bonds you once petted but no longer hold (lapsed & reaped), shown with
    dignity: "The reaper passed. You're no longer its keeper — but it lives on if others tend it."
    Offers a gentle "Adopt again" (petting re-mints the bond). Soft, never a punishment popup.
  - **Daycare** — hand a bond to a friend's address to pet-sit (`transfer_bond`), a **Sitting for a
    friend** list (bonds you hold but never petted → received via daycare → "hand back"), and an
    **Out at daycare** list (bonds you lent, tracked locally).
  - **Honest derivation:** walks the bond graph (`petPairs` + `bondStatus(creature, me)` for every
    creature with bond activity — finds bonds you hold even if you never petted them). "Petted by me"
    distinguishes wards from sat bonds; a local `gol:lent` set distinguishes a daycare loan from a
    reaping (they look identical on-chain). `usePet` exposes `txHash` (from the /life work).
  - `globals.css`: `.wards-*` / `.ward-card` / `.ward-clock` styles. NUT framed only as "a small
    thank-you for the breath — nothing more" (no earn/yield/APR anywhere).
- **Verified (headless Chrome + CDP, live Sepolia):** pointed the page at the agent caretaker account
  read-only — rendered "Your wards" with the blinker ward, live magenta thumbnail, "3 days until
  hungry" (green, comfortable), Pet + hand-to-daycare, and the Daycare explainer (no reaper/sitting
  for that account). Connect + empty states render. tsc + eslint clean, `next build` green. NOT
  verified (needs a wallet): the pet tx, daycare transfer, and the amber/wilting/reaper/sitting
  variants (no account is in those states right now).
- **Next:** the redesign sweep is done except **/leaderboards (Records)**. Then a wallet-connected
  QA pass across the whole flow, and decide about pushing `new_design` / opening a PR.
- **Blockers:** none.

## 2026-07-10 (later still) — /life/[id] rebuilt: the ritual surface + the breath animation
- **Goal:** rebuild the single-creature page per the brief — the most intimate screen: an authentic
  framed render, the two acts of care, and a carefully designed one-generation "breath".
- **Branch:** `new_design` · **Commits:** uncommitted WIP
- **Changed (frontend, `ui/game-of-life`):**
  - `src/components/BreathCanvas.tsx` (new): the stage canvas. Renders a creature in ITS OWN
    on-chain colours (bg/cell — never restyled), autoplays its cycle at the on-chain speed, holds a
    scrubbed generation, and plays the **breath** — exactly one Conway generation (via `creatures.step`,
    matching the contract) revealed with a gather-then-ripple-from-centre. One rAF, prop-mirrored refs,
    reduced-motion aware (snaps instead of animating). NO confetti.
  - `src/app/life/[id]/page.tsx` rewritten:
    - LOOP (Bacterium) = the ritual surface. LEFT: BreathCanvas in a **microscope-slide** frame
      (thin border, corner ticks, petri texture), a big JetBrains-Mono **generations-lived** counter,
      a live/scrub replay slider over the cycle, and a "view the on-chain renderer" toggle (the exact
      contract iframe on demand — authenticity without losing scrub/breath). RIGHT: derived type
      **name + short id** (no rename affordance — there's no on-chain name field; the raw on-chain name
      is just "Lifeform <id>"), born-at block, "set free by" (owner, truncated), traits, state. Two
      acts: **Breathe life** (one gen, anonymous, a little $NUT, no bond) and **Pet** (the committed
      breath — opens/refreshes the caretaker bond + 7-day clock; shows "bond: N days left", amber when
      low; **hand to daycare** = `transfer_bond`). On confirm: the breath animation plays, the counter
      ticks, the clock resets, quiet "You gave it a breath. Bond renewed." + tx hash. BELOW:
      **caretakers** ("the pack", from `petPairs`+`bondStatus`) and **lived-generations** (a filmstrip
      of the creature's cycle).
    - PATH (Wanderer) = a static **portrait** page: the caught travelling state, its story, NO
      breathe/pet/bond affordances.
    - Bestiary (unminted) discover-&-set-free case kept, in English + the new frame.
  - `src/lib/usePet.ts`: expose `txHash` (so the pet's tx can be linked). `useBreathe` already had it.
  - `globals.css`: new `.life-*` / `.slide` / `.bond-clock` / `.pack` / `.filmstrip` styles.
- **Decisions:** appearance is now chosen at set-free (/create) — the old owner-only colour editor was
  DROPPED from /life to keep the ritual surface clean (re-editing could return later). Breathe is one
  generation (the multi-gen feed slider dropped) so the action matches the single-breath animation.
  Left render uses the controllable canvas by default (needed for scrub + breath) with the authentic
  iframe one click away — both show the exact on-chain colours.
- **Verified (headless Chrome + CDP, live Sepolia, genesis blinker):** renders "Period-2 Loop
  0x7d4e…c4b9", born block 11,642,283, set-free-by, 6 traits, on-chain colours faithful (magenta bg /
  cream cell), scrubber + counter (344 lived), Caretakers pack (2 holders, 3d/6d left), filmstrip
  (2 phases). tsc + eslint clean, `next build` green. NOT verified (needs a wallet): the breath
  animation on confirm, breathe/pet txs, daycare transfer.
- **Next:** wallet-connected pass — watch a real breath, pet+bond clock, daycare hand-off.
- **Blockers:** none.

## 2026-07-10 (later) — /incubator rebuilt: eggs not yet hatched
- **Goal:** rebuild `/incubator` per the brief — a warm workbench for births in progress and saved
  patterns, with progress shown as a warming egg (not a progress bar).
- **Branch:** `new_design` · **Commits:** uncommitted WIP
- **Changed (frontend, `ui/game-of-life`):**
  - `src/app/incubator/page.tsx` rewritten: two groups — **Mints in progress** (interrupted
    multi-tx mints from `listMintProgress`; egg + "signatures done/total" + **Continue hatching**
    → resumes via `useMint`, stall "knock again", hatched → "Meet it") and **Saved patterns**
    (bookmarks; **Open in Create →** `/create?load=<id>` to edit/set-free, quiet "hatch it here"
    for handed-off big ones, Forget). Inviting empty state ("No eggs yet — draw something in
    Create and save it to hatch later" + Go to Create). Reuses the proven persistence
    (`incubator.ts` localStorage) and on-chain minted-detection.
  - The **warming-egg** metaphor (`.egg` in globals.css): an oval shell holding the pattern under a
    warm amber light that RISES with progress (`height = done/total`), a soft incubation pulse, and
    a green wash + glow on hatch. Not a progress bar.
  - `src/app/create/page.tsx`: added `?load=<id>` support — opens a saved bookmark's pattern onto
    the grid (then cleans the URL), so Incubator's "Open in Create" round-trips.
  - `globals.css`: new `.inc-*` / `.egg*` styles.
- **Verified (headless Chrome + CDP, live Sepolia):** empty state renders (three breathing egg
  outlines + Go to Create); seeding localStorage with a bookmark + a 2/3 mint-progress shows both
  groups — the in-progress egg glows amber, filled to ~2/3, labelled "signatures 2/3" with
  "Continue hatching"; saved pattern shows "Open in Create → / hatch it here / Forget". tsc +
  eslint clean, `next build` green. NOT verified (needs a real wallet): an actual resume-to-hatch
  and the round-trip mint.
- **Next:** wallet-connected pass across create → incubator → hatch → garden.
- **Blockers:** none.

## 2026-07-10 — /create rebuilt: the "slot machine of life" (discovery + set-free)
- **Goal:** rebuild `/create` per the brief — a playful, kid-first discovery flow (an 8-year-old is
  a real primary user): draw a seed, watch what it becomes, set the living ones free.
- **Branch:** `new_design` · **Commits:** uncommitted WIP
- **Decision (asked Henri):** the contract has **no on-chain name field** — Henri chose
  **appearance-only** for the set-free ritual (no naming). Creatures stay auto-named by pattern/type.
- **Changed (frontend, `ui/game-of-life`):**
  - `src/app/create/page.tsx` fully rewritten: ONE big tactile 41×41 grid (draw = green #22c55e on
    #070709, click/drag), toolbar (Clear / Invert / green **Randomize** lever + Blinker/Glider/Block
    presets), Play / Step / Rewind + speed. Destiny detected by stepping the seed and hashing each
    generation for a repeat → a **warm verdict**: green "This one lives" for still-life/oscillator
    (shows period + steps), gentle neutral "It goes out" for death, "still wandering" for transients.
    Never punitive. "Set it free" is gated on a living verdict.
  - **Set-free ritual** = a colours modal (8 cell swatches, 5 backgrounds, 3 paces) with a live
    preview → writes the chosen appearance **on-chain in the same mint tx** → a celebratory "It's
    alive" drop animation → redirect to the newborn. Framing line: "When you set it free, it belongs
    to whoever keeps it alive." Single-shot only; **big patterns hand off to /incubator** (bookmark +
    link). Wanderer (path) minting kept as a quiet secondary for dying/transient-into-loop drawings.
  - `src/lib/useMint.ts`: `mint()`/`mintPath()` take an optional `appearance {bg,cell,speed}` and
    append `set_render_params` / `set_path_render_params` to the plan's FINAL step, so colours land
    atomically in the creature-creating tx. Everything else (planning, resume, stall recovery) intact.
  - `globals.css`: new `.create-*` / `.verdict` / `.free-modal` / swatch styles. Left the old
    `.slot`/`.reels` casino-reel CSS in place but unused (no longer rendered — the brief says no
    scores); can be removed later.
- **Notes / simplifications vs. the old page:** dropped the casino Score reels (no scores, per brief);
  dropped the sibling auto-bookmark on redirect; grid is **41×41** (contract size; the brief's
  "e.g. 15×15" was illustrative). "Green is a tool colour here" (draw grid, lever, set-free button) —
  the creature's own colours are chosen in the modal.
- **Verified (headless Chrome + CDP click harness, live Sepolia):** Blinker → "loops every 2 beats"
  and correctly detects the genesis blinker already lives → "meet it"; Block → "still life";
  Randomize → a still life after 694 generations (fate engine + step count work); Play advances
  gen 0→15; the set-free modal opens with preview + swatches + pace + "Release it →", preview
  recolours on swatch pick. tsc + eslint clean, `next build` green. NOT verified (needs a real
  wallet): the actual set-free tx with appearance, the "It's alive" drop, and the redirect —
  logic reuses the proven `useMint` path.
- **Next:** wallet-connected end-to-end mint QA (colours on-chain, drop animation, redirect);
  confirm the multi-tx → /incubator handoff starts/resumes cleanly.
- **Blockers:** none.

## 2026-07-09 (later still) — Global chrome: the "petri" top bar, wordmark, blinker favicon
- **Goal:** the persistent chrome from the design brief — a quiet top bar on every surface, the
  "petri" wordmark, and a Conway-blinker favicon. "The quiet rim of the petri dish."
- **Branch:** `new_design` · **Commits:** uncommitted WIP
- **Changed (frontend, `ui/game-of-life`):**
  - `src/components/GardenHeader.tsx` rebuilt as the sticky top bar: LEFT = pulsing #22c55e
    heartbeat dot (the only animated thing in the bar) + lowercase-mono `petri` wordmark +
    small-caps descriptor → links home; CENTER = GARDEN/CREATE/INCUBATOR/WARDS/RECORDS with
    `usePathname` active-detection (only the active item lit #f2f2f5); RIGHT = living census
    ("N alive"), wallet connect → truncated address, and an amber dot when a connected caretaker
    has a hungry ward (→ /pets). Collapses to a slide-in sheet under 820px.
  - `src/components/FaviconBlinker.tsx` (new) + `src/app/icon.svg` (new): favicon is a Conway
    blinker (3 green cells on #070709). Static `icon.svg` is the social/app mark + first-paint
    favicon; the component swaps the icon href between the two phases (h↔v) every 1s, holding one
    phase under prefers-reduced-motion. Deleted the old `src/app/favicon.ico`.
  - `src/app/layout.tsx`: mounts `<FaviconBlinker/>`; metadata title → "petri — a garden of
    digital bacteria".
  - `src/components/SiteFooter.tsx`: wordmark → "petri"; dropped the FR `useT`.
  - `globals.css`: replaced the old `.site-header`/`.brand`/`.nut-chip` block with a `.topbar`/
    `.tb-*` system (translucent #070709 @ 82% + blur, 1px #1f1f28 border, mono ~12px) + the mobile
    burger/sheet.
  - **Dropped from the bar** vs. the old header (per the brief's right-side spec): the NUT-balance
    chip and the persistent "Sepolia · testnet" pill. Kept a quiet "Wrong network" affordance only
    when connected to the wrong chain (safety).
- **Decisions:** the census counts alive **Bacteria** (loops) — the living things — via
  `recentLifeforms(0)`; should move to an indexer count at scale (noted in code). The sheet is
  rendered as a **sibling of `<header>`, not a child** — `.topbar`'s `backdrop-filter` makes it the
  containing block for `position:fixed`, which was confining the sheet to the 56px bar (caught in
  verification; see below).
- **Verified (headless Chrome + a CDP click harness against live Sepolia):** desktop bar renders
  with all elements; active nav tracks the route (GARDEN on `/`, CREATE on `/create`); census read
  a real "4 alive"; favicon carries both the static `icon.svg` and the JS-swapped data-URI blinker;
  mobile collapses (nav/descriptor/census hidden, burger shown); **clicking the burger opens the
  sheet** with all 5 links + active state + census/Connect in the foot, page dimmed behind. tsc +
  eslint clean, `next build` green. NOT verified (needs a real wallet): connected address display,
  the hungry-ward amber dot, and the wrong-network affordance.
- **Next:** carry the `.tb-*` chrome language to the inner pages; wallet-connected QA pass.
- **Blockers:** none.

## 2026-07-09 (later) — Garden home rebuilt: the living gallery ("Petri")
- **Goal:** overhaul the home page ("/") into the living gallery from the design brief — a dense,
  inhabited petri dish that legibly separates the two collections and reads life at a glance.
- **Branch:** `new_design` (branched off `main` this session) · **Commits:** uncommitted WIP
- **Changed (frontend only, `ui/game-of-life`):**
  - `src/app/page.tsx` → server component: a quiet poetic lead + a soft `/create` invitation
    (no hard CTA), then `<Garden />`. Dropped the old hero/`useT`.
  - `src/components/Garden.tsx` rewritten: two labelled collections — **Digital Bacteria**
    (living loops) and **Digital Wanderers** (static portraits) — a 3-way lens
    (**newly set free / oldest / hungry**), and parent-level data via `recentLifeforms` +
    hydrated `recentPathTokenIds` (bounded-concurrency pool, order preserved).
  - `src/components/CreatureCard.tsx` rewritten into presentational tiles `BacteriaTile` /
    `WandererTile`. The site owns only the FRAME (`#070709` backdrop, `#1f1f28` border, faint
    petri stipple); the render inside is the creature's OWN on-chain look (`renderParams`
    bg/cell/speed passed straight to `<Creature>` — never recoloured). State dot: alive `#22c55e`,
    hungry `#f97316`, gone out `#4a4a56`. Bacteria get a hover "breathe" affordance; wanderers
    don't (they're portraits, rendered static). Short-hash caption (`shortAddr`) — the v3 ids are
    76-digit Poseidon hashes and overflowed as decimals.
  - `globals.css`: new `.petri-*` / `.lens` / `.collection` namespace appended. Left the existing
    `.creature-card` / `.dish` / `.garden-grid` classes untouched — `incubator` + `leaderboards`
    still use them.
  - `src/app/layout.tsx`: `suppressHydrationWarning` on `<html>` + `<body>` — a browser extension
    was injecting attributes before hydration and tripping React 19's attribute-mismatch warning
    (couldn't repro in a clean headless browser; no render-time browser globals in our code). Only
    suppresses those two elements one level deep; real mismatches elsewhere still surface.
  - **"Hungry" is derived honestly**, not faked: there's no creature-level hunger flag, so Garden
    walks the bond graph once (`petPairs` → `bondStatus`) and marks any creature whose keeper is
    within 2 days of (or past) the 7-day lapse. Empty bond graph → "the garden is well tended".
- **Verified:** `tsc` + eslint clean; `next build` green (`/` static, 4.4 kB). Drove it headless
  (Chrome) against live Sepolia: 7 tiles across both collections, on-chain palettes faithful,
  breathe affordance only on the 3 bacteria, lens + state dots present, caption contained.
  NOT yet verified: hungry/oldest lens interaction against real bonds (no near-lapse bonds live
  right now); mobile widths; a full click-through on device.
- **Decisions:** kept the shared-rAF `<Creature>` canvas (already IntersectionObserver-gated) as
  the tile render rather than per-tile on-chain iframes — the brief's perf requirement rules out
  N iframes. Wanderers render static (`animate={false}`) to match "travelling portraits".
- **Next:** repoint the rest of the site to this design language; Henri's browser/device pass;
  decide whether the breathe affordance should breathe inline or keep leading to `/life/[id]`.
- **Blockers:** none.

## 2026-07-09 — French temporarily disabled; site defaults to English
- **Goal:** Henri: "disable the French version for now — the wording is confusing. Remove the
  fr/en toggle at the top and default to English. We'll add it back later."
- **Branch:** `main` · **Commits:** uncommitted WIP
- **Changed:** minimal, reversible. `src/lib/i18n.tsx` pinned to `lang: "en"` (dropped the
  localStorage + `navigator.language` FR detection and the `LangToggle` component; `setLang` is
  now a no-op); removed `<LangToggle />` + its import from `GardenHeader.tsx`; deleted the dead
  `.lang-toggle` CSS from `globals.css`. **All ~250 inline `{ fr, en }` copy pairs left in place**
  — `t()` just always resolves `en`, so restoring French later is: bring back the language state +
  detection and re-add `<LangToggle />` (previous impl is in this file's git history).
- **Verified:** `tsc --noEmit` clean; grep confirms no remaining `LangToggle` / `.lang-toggle`
  references outside i18n's own API. Not run: `next build`, browser pass.
- **Decisions:** kept the FR strings rather than stripping them — the ask is "for now / add back
  later", so a full copy teardown would be wasted work and lose the reviewed FR voice.
- **Next:** Henri to eyeball the header in a browser; revisit FR wording before re-enabling.
- **Blockers:** none.

## 2026-07-06 (copy pass) — Full website copy review + rewrite in one voice
- **Goal:** Henri: "full in-depth review of all the wording — is this the best we can do?" It
  wasn't. Review at [copy-review.md](../copy-review.md); Henri's register calls: **tu**,
  **vagabonde** (the FR Wanderer), dark-but-soft reaper — and **no reaper UI at all** ("it's a
  bot thing"), **"set free"** as the EN mint verb.
- **Branch:** `main` · **Commits:** (this one) · pushed
- **Changed (~130 strings):** the Wanderers finally wander (path/chemin → wanderer/vagabonde
  everywhere user-facing; "chemin/path" survives only as the math trait); minting speaks the
  world's language (spawn/mint → set free/libérer; "tx pending" → "the chain is writing";
  "Verifying" → "Proving it lives"; "· 4 txs" → "· 4 signatures"); whole-site tutoiement (the
  tu/vous mix is gone); $NUT unified; death unified on Éteinte/Gone out; engine → petri dish;
  /pets lost its reaper section (bots reap; humans just see "le faucheur passe" on wilted bonds);
  /create gained its invitation ("Dessine une graine. Regarde sa destinée."); EN grammar fix on
  the home thesis.
- **Verified:** `next build` green; sweeps confirm no stray vous/chemin/spawn in FR/EN copy.
- **Next:** Henri's full review pass; then outreach package.
- **Blockers:** none.

## 2026-07-06 (later still) — Pet UI shipped: wards, clocks, the reaper's rounds
- **Goal:** the client side of the caretaker layer ("go ahead on the pet UI"). Also: Henri
  confirmed the multi-tx stall fix — **the long wanderer mint worked**.
- **Branch:** `main` · **Commits:** (this one) · pushed
- **Changed:**
  - SDK: `pets` address in the book, `RpcReader::bond_status` (held/last_pet/reapable in one
    shot), `pet_pairs()` event scan (the caretaker graph), `pet`/`reap`/`transfer_bond` builders;
    WASM `petCall`/`reapCall`/`transferBondCall`/`petPairs`/`bondStatus`.
  - `/life/[id]`: 🤲 pet button (adopt/pet, one ceremonial breath) + the bond clock ("X days
    before it wilts" / "your bond has wilted — anyone can reap it").
  - **`/pets`** ("Mes protégés / My wards"): your bonded creatures with clocks + pet actions, and
    the reaper's rounds (all wilted bonds, reap = 1 NUT). Header nav link.
  - `/leaderboards`: **Caretakers** board (active bonds per holder).
- **Verified:** 43 SDK tests; `next build`; live probe reads the real caretaker graph (the
  agent's genesis bond: held, clock stamped, not reapable). ⚠️ Pages not yet eyeballed in a
  browser (same caveat as /leaderboards).
- **Next:** Henri's browser pass (/pets, /leaderboards, a pet from the UI); then the outreach
  package (essay, bestiary, share loop, Seed Grant).
- **Blockers:** none.

## 2026-07-06 (late) — GolPetBonds built + tested; deploy queued on strkd unlock
- **Goal:** the pet/caretaker layer per pet-mechanism-spec.md, against v3 ("go do the pet contracts").
- **Branch:** `main` · **Commits:** f7888af · pushed
- **Changed:** `src/gol_pet_bonds.cairo` (ERC-1155 caretaker bonds; pet = one ceremonial feed via
  `move_lifeform_forward_n_for` with NUT to the petter; 7-day lapse; permissionless reaper minted
  1 NUT from nothing; daycare `transfer_bond` with the clock riding along — invariants in the
  ERC-1155 hook so raw transfers obey them too; orphaned bonds age out naturally) +
  `IGolPetBonds` + 8 integration tests.
- **Verified:** full suite **99 Cairo tests green** (91 + 8). **DEPLOYED to Sepolia after Henri's
  unlock**: GolPetBonds `0x59878490…6e337` (class `0x7b82f4fc…cb1a2`), NUT MINTER granted, and a
  live smoke test — the agent petted the genesis blinker (bond 1, clock stamped, creature aged).
  Details in [v3-deployment.md](../v3-deployment.md).
- **Next:** SDK/WASM pet bindings + the garden/pet UI (loss-aversion clocks, reaper feed);
  caretakers leaderboard; Henri's validation pass (stall fix, /leaderboards, long-wanderer resume).
- **Blockers:** none.

## 2026-07-06 (night) — First real v3 usage: two UX bugs found by Henri, fixed
- **Goal:** Henri minted loops + a path on v3 (works), then hit: (1) long-wanderer multi-tx mints
  stall after 1-2 txs (/create AND incubator resume); (2) spawning one of two discoveries loses
  the other on redirect.
- **Branch:** `main` · **Commits:** (this one) · pushed
- **Diagnosis (1):** live probe with the app's exact starknet.js against the app's RPC shows fresh
  txs go PRE_CONFIRMED → ACCEPTED_ON_L2 in ~3s — the acceptance poll is innocent. The stall is the
  NEXT wallet request: Ready silently drops a programmatic `wallet_addInvokeTransaction` that
  doesn't originate from a user gesture; the execute() promise never settles.
- **Fix (1):** useMint watchdogs each wallet request (25s) → "wallet showing nothing? re-request
  step k/N" button in /create + incubator, re-firing the SAME step from the click
  (first-settle-wins, late duplicates harmless). Progress persisted at step start.
- **Fix (2):** the confirmed-redirect bookmarks the un-spawned sibling discovery into the
  incubator before leaving.
- **Verified:** next build green; ⚠️ the stall fix needs Henri's retry of the long wanderer mint
  (wallet-side behavior can't be driven headlessly). His partial progress resumes.
- **Next:** Henri retries the long mint; pets on v3; tiled phase-segment mint on-chain.
- **Blockers:** none.

## 2026-07-06 (evening) — SDK + frontend repointed to v3; the app speaks orbit ids
- **Goal:** close the v3 gap ("go"): write-builders, WASM, frontend id derivation.
- **Branch:** `main` · **Commits:** 373e287 · pushed
- **Changed:** v3 address book (NUT keeps its own deploy block so breathing history spans
  collection versions — top breathers survived the reset); mint builders compute the orbit
  canonical + witness internally (callers pass drawn rows, drawn orientation preserved);
  `prove_malformed_{loop,wanderer}` + `breathe_life_for` builders; `plan_loop_mint` chunks a
  phase segment when the witness phase exceeds one tx; WASM `familyTokenId` /
  `proveMalformed*Call` / `breatheLifeForCall`; every UI mint-facing id derivation switched to
  `familyTokenId` (the existing already-minted check thereby becomes the duplicate-family check);
  renderer template ref token → the v3 genesis blinker.
- **Verified:** 91 Cairo + 43 SDK tests; `next build`; live board probe reads v3 (1 genesis loop)
  AND the cross-version breather history (6 breathers, top 830). ⚠️ Not yet exercised: a real v3
  mint from the UI (manual click-through), the tiled phase-segment flow on-chain, /leaderboards
  eyeballing.
- **Next:** manual click-through of /create → v3 mint on Sepolia; pets on v3; genesis reseed
  whenever Henri wants it.
- **Blockers:** none.

## 2026-07-06 (later) — v3 BUILT AND LIVE: orbit-canonical identity on Sepolia
- **Goal:** execute the approved v3-identity-spec end to end (Henri: "untrack the pdf, push, do v3").
- **Branch:** `main` · **Commits:** b58a140 (+ this docs commit) · pushed to origin
- **Changed:**
  - **Contracts:** `GolLifeformsV3` (BACT) + `GolWanderersV3` (WNDR) + two witness-assisted
    minters. Witness mint (family membership verified, one transform, anchored on the walk's
    time-lex-min), drawn state preserved for display, per-token mint escrow, `prove_malformed`
    on both, `feed_for` + feeder-in-event ride-alongs, sub-path challenge carried to Wanderers.
    **91 Cairo tests green** (10 new: witness mints, copy-collision reverts, fraud proofs both
    directions, feed_for, sub-path regression).
  - **SDK:** `grid::loop_family_canonical` (orbit × phase min returning the contract-matching
    witness); `v3_seed` example emits genesis calldata. 43 SDK tests green.
  - **Deployed to Sepolia** (addresses/classes/txs in [v3-deployment.md](../v3-deployment.md)):
    4 declares, 4 UDC deploys, one wiring multicall, genesis blinker seeded with its TRUE orbit
    canonical — **the on-chain witness check passing is the Rust↔Cairo convention proof.**
- **Verified:** owner/escrow(2 NUT)/canonical/nonce read back correctly; suites green.
- **Findings:** declare fee BOUNDS (~156 STRK) exceeded the agent's balance though actuals are
  ~50 — funded +300 STRK; `companion_requestFunding` is sign-only by default (`submit:true`
  needed) and always prompts. strkd was locked at first attempt (operator unlock).
- **Next:** SDK v3 write-builders + WASM; frontend repoint (env, witness through useMint,
  duplicate-mint UX); exercise the tiled phase-segment mint on-chain; then pets on v3.
- **Blockers:** none.

## 2026-07-06 — Symmetry challenge-burn LIVE on Sepolia (in-place upgrades via strkd)
- **Goal:** finish spec item #1 — declare + upgrade both NFT contracts with the symmetry mechanism.
- **Branch:** `experiment/frontend-redesign` · **Commits:** uncommitted WIP (contracts committed
  state unchanged since 07-03 session; deploy artifacts from current build)
- **Changed (on-chain, Sepolia):** declared `GolLifeformsV2` class `0x38b639…f326f` and
  `GolPathLifeformsV2` class `0x3db4bc…80700`; one multicall upgraded both live contracts in place
  and revoked the admin's leftover `MINTER_ROLE` on the path NFT (cleanup #1). Old classes remain
  declared (revertible). Details + tx hashes in [v2-deployment.md](../v2-deployment.md).
- **Verified:** `getClassHashAt` matches both new classes; `get_mint_nonce(seeded blinker) = 0`
  (grandfathered tier); `has_role(MINTER, admin)` on path NFT = 0. Cleanup #3 (old path minter's
  role on loop lifeforms) deliberately NOT executed — optional, needs Henri's sign-off.
- **Decisions / findings:** strkd pairing identity is **(name, kind)** — a 3-day blocker traced to
  pairing without `kind:"agent"` silently creating a parallel app-kind client (`-32002`, no
  prompt). Reported upstream via `companion_reportIssue` (prefilled GitHub issue handed to Henri).
  Node quirk: this RPC node wants raw (uncompressed) `sierra_program` in declares.
- **Same day — SDK symmetry support + leaderboards v1 (Henri: "fix the SDK, then leaderboards"):**
  - SDK (`gol-sdk`): `grid::{apply_d4, translate, apply_symmetry, symmetry_canonical, find_witness}`
    (d4 table mirrors the Cairo consensus-critical convention; equivariance + group tests);
    `writes::challenge_burn` updated to the new path ABI (+d4/dr/dc) and `challenge_burn_loop`
    added; event scanner gains `feed_rewards()` (top-breathers aggregation from NUT faucet mints,
    initial-supply mint excluded by size guard) and `recent_{path_}mints_with_blocks()`.
    **42 tests green.** WASM: `challengeBurnCall` (new signature), `challengeBurnLoopCall`,
    `symmetryCanonical`, `findWitness`, `topBreathers`, `recentMints`, `recentPathMints`.
  - Frontend: **`/leaderboards`** page (FR/EN) — the four launch boards from
    [leaderboards.md](../leaderboards.md): longest loops, methuselahs (length ÷ seed cells), top
    breathers, discoveries of the week (block-window ≈ 20k blocks). Header nav link; `.board` CSS.
    `next build` green.
  - **Live-verified the data layer** (`examples/board_probe.rs` against Sepolia): 6 breathers (top
    830 generations), 24 loop mints, 9 path mints — the boards have real content. The page itself
    is ⚠️ not yet eyeballed in a browser (`npm run dev` → /leaderboards).
- **Same day — v3 identity decided (Henri's proposal) + spec written.** Henri asked the right
  question: if the orbit key is universal and 0.75 ms to derive, why keep two id systems? Answer:
  don't. **`docs/v3-identity-spec.md`**: `token_id = Poseidon(orbit canonical)`, witness-assisted
  mint (family membership verified exactly, one transform), optimistic **minimality** with
  permanent escrow-staked fraud-proofs, drawn state stored for display, sub-path challenge kept,
  loop symmetry challenge not carried into v3 (copies revert at mint). Locked (interview round 1):
  escrow-staked proofs, permanent window, **fresh v3 + curated genesis reseed**. Round 2 went
  unanswered (AFK) — sequencing (consolidate→v3→pets), naming (drop version markers), genesis to
  original owners, ride-alongs (feeder-in-event + `feed_for`) are **PROVISIONAL in spec §3**.
  Supersedes-notes added to symmetry-challenge-spec.md and v2-grid-redesign.md §5.
- **Same day — v3 spec APPROVED in full + repo consolidated.** Henri settled §3: sequencing
  consolidate→v3→pets; genesis reseed deferred ("don't yet"); paths renamed **"Digital Wanderers"
  / `WNDR`** (his pick over Comets/Spores); ride-alongs = both (feeder-in-event + `feed_for`).
  Consolidation executed: session work committed in four logical commits (contracts / SDK / UI /
  docs), **`experiment/frontend-redesign` merged into `main`** (its three stray cherry-picked
  commits were content duplicates; resolved preferring the branch) — `main` is now the single
  trunk, verified green post-merge (81 Cairo + 42 SDK tests, `next build`). Not pushed — remotes
  and Vercel wiring are Henri's call. **This log backfilled** for 2026-06-17→07-02 (see notice
  below). Stray untracked `docs/starknet-metering-census.pdf` left for Henri to place.
- **Next:** build v3 (contracts per v3-identity-spec.md, incl. both ride-alongs) → deploy fresh
  collections → pets on v3. Also: eyeball /leaderboards in dev; v2 cleanup #3 now moot (v2
  superseded by v3 shortly).
- **Blockers:** none.

## 2026-07-03 — First-principles review; symmetry-burn + leaderboard docs; doc discipline restored
- **Goal:** review the project's reasoning trajectory against the original ask (docs, not code),
  then act on Henri's responses.
- **Branch:** `experiment/frontend-redesign` · **Commits:** uncommitted WIP (docs only)
- **Changed:**
  - Review delivered. Reframings from Henri: the project is a **WIP art piece** ("burning gas and
    creating art"); proving is deliberately sequenced *after* v1 (accessibility first, proving for
    enthusiasts later — the TUI's purpose); users pay their own gas (no paymaster); immutability is
    aspirational, later; the casino `/create` was user-research-driven (the main user is an
    8-year-old high-score hunter), leaderboards next.
  - **`CLAUDE.md` created** (repo root): session-end doc-consistency rules — LOG entry, STATUS
    rewrite, spec reversals recorded in the spec they reverse. (This log had silently stopped on
    2026-06-17 while v2 shipped.)
  - **`docs/symmetry-challenge-spec.md`** (interview-derived): witness-based challenge-burn for
    translation/rotation/reflection copies, unified with the sub-path rule (`(g, k)` witness),
    loops via in-place upgrade, loop bounty minted from nothing, **mint nonce replaces the
    timestamp direction guard** (superseded-note added to `path-creatures-spec.md`),
    grandfathered tokens = nonce 0, strict no-diptych-exemption.
  - **`docs/leaderboards.md`**: ~20-board catalogue; key finding: no contract changes required
    (states on-chain + Life deterministic ⇒ all pattern metrics are indexer compute); two optional
    event/nonce deltas; recommend leaderboards = the indexer project's first product.
  - Pet/ERC1155 parameters pinned by interview: petting **is** feeding, 1 generation per pet
    (ceremonial), 7-day lapse, permissionless reaper rewarded with NUT minted from nothing
    (amount TBD in the pet spec — proposed 1 NUT). Pet spec itself not yet written.
  - Audience research completed → **`docs/audience-research.md`** (19 verified claims; synthesis:
    position as Autoglyphs-lineage on-chain art; primary = fully-on-chain genart collectors,
    secondary = ConwayLife/CA enthusiasts approached as a discovery census, kids/education later;
    stay on Starknet + market chain-agnostically; Cellula = anti-model; Seed Grant + genesis
    bestiary + manifesto essay + leaderboards-before-outreach as concrete plays).
- **Verified:** docs only; no build/test run.
- **Decisions:** see the spec's "Decisions locked" table and the review memory.
- **Later same session:** Henri set the order 4→1→3→2. **`docs/pet-mechanism-spec.md` written**
  (final interview: reap reward 1 NUT flat; bonds **transferable** — "daycare" use case — with the
  clock carried per (creature, holder) on transfer and max 1 bond/holder/creature to close the
  self-transfer dodge; orphaned bonds lapse naturally). Henri approved the symmetry spec **as
  drafted** → implementation started.
- **Symmetry mechanism IMPLEMENTED** (same session, spec approved as drafted):
  - `gol_grid_v2`: `apply_d4` (8-element table, inverse-mapped per-cell copy), `translate`
    (row re-index + u128 bit rotation), `apply_symmetry` = translate ∘ d4. The d4 index table is
    consensus-critical (SDK must match).
  - `GolLifeformsV2`: `next_nonce`/`mint_nonce` storage (new maps only — in-place-upgrade-safe;
    unwritten = 0 = grandfathered tier), nonce stamped in `mint`, new `challenge_burn(a, b,
    a_state, d4, dr, dc, k)` — preimage pinned by hash, equal-period + `k < period` asserts,
    bounty = `b.sequence_length` NUT **minted from nothing**, `ChallengeBurned` event.
  - `GolPathLifeformsV2`: same nonce plumbing; `challenge_burn` generalized with the
    `(d4, dr, dc)` witness (`k` = length gap; identity keeps the strictly-longer + same-target
    rules; escrow bounty unchanged); **nonce replaces `minted_at` as the direction guard**.
  - Inline verification only for now (fine to ~450 steps at 41×41); tiled-`k` challenges via the
    partial-path registry remain a follow-up (spec §4.2).
- **Verified:** `scarb build` ✅; `snforge test` ✅ **81 passed, 0 failed** — new: d4 group
  properties, translation wrap/composition, step∘g equivariance (all 8 elements), loop copy burn
  with minted bounty (+ nonce getter), newer-cannot-burn, non-copy refused, path rot90+translate
  copy burn (escrow paid, target pre-filter skipped), stepped-symmetry copy burn, equal-length
  identity-witness refused; legacy sub-path tests pass under the nonce guard.
- **Next:** **Sepolia declare + upgrade of both NFT contracts — BLOCKED on strkd (companion not
  running)**; also revoke the leftover admin `MINTER_ROLE` on the path NFT during that deploy, and
  update the SDK challenge_burn signature + `symmetryCanonical`/`planChallenge`. Then
  leaderboards/indexer (#3); then repo consolidation + log backfill 2026-06-17 → 07-01 (#2).
- **Blockers:** none.

- **Goal:** get the *real* on-chain and off-chain (SNIP-36) generation ceilings for the optimized
  `step_grid`, on testnet, via strkd (signing) + dinner (proving) — no sncast, no self-run prover.
- **Results:**
  - **On-chain: 321 gens** (old 170; **1.89×**). `estimateFee` binary search → n=321 @1.198e9 L2
    gas (cap 1.2e9), n=322 over. **Confirmed by real broadcast** `move_forward_in_place(321)` — tx
    `0x5307febe27d888a3da21e52caafa3f7e505c119deacd43ba2af54aab8262c87`, SUCCEEDED, **actual L2 gas
    1,089,490,115**, 8.72 STRK, `get_age` 0→321. (Old 170 used 1.085e9 gas → ~same gas, ~1.9× gens.)
  - **Off-chain (SNIP-36, local dinner/stwo): 89 gens** (old 43; **2.07×**). Binary search via dinner
    `POST /v1/prove`: n=89 proves (~406 KB proof, proof_facts len 9), **n=90 → `Not enough twiddles!`**
    (the build's trace/twiddle cap). Both ceilings ~2× — matches the ~47%-cheaper-per-gen step.
- **Contract:** optimized `GolBench` class `0x41268542f2ed071e93bd85f25c9008fcf772086674690781a46974cda74b0da`
  (Sierra 1.8.0) was already declared; deployed a fresh instance at
  `0x05f62daf5d63c1c6c310247d2155dcc52fa4328ff7bd8ec4ace6f40f8fa3ec5` (glider seed) via UDC through strkd.
- **Tooling:** strkd signed everything (sign-only for the virtual prove txs; submit:true for deploy +
  the 321 broadcast); **dinner** (local proving companion, `:9909`, native backend) produced the
  proofs. RPC went through a **local reverse proxy** (`127.0.0.1:8651`→sepolia, `:8652`→mainnet) that
  injects the `X-SNF-Nodes-Key` bypass header (the SNF nodes rate-limit heavy proof state-fetches);
  key kept in a `/tmp` chmod-600 file, never logged/committed. dinner + strkd point their RPC at it.
- **The "declare blocker" was self-inflicted (3 wrong theories, all wrong), root-caused to:**
  (a) `compiled_class_hash` computed with the frontend's stale starknet.js **v7.6.4** (wrong algo →
  `0x7eec8e15…`; v10 → correct `0x581b62…`); (b) class hash needs the **canonical abi serialization**
  (`formatSpaces`, not `JSON.stringify`) or the node derives a different class_hash → "invalid
  signature". **Sierra 1.8.0 / Cairo 2.18 declares fine on the SNF nodes** — no toolchain change.
- **Verified:** strkd sign+submit works on the current network (test 0-STRK self-transfer
  `0x7d7f2e6c…` succeeded); proxy forwards both networks with the key (logs method/path/status only).
- **Next:** tear down the temp proxy + revert dinner/strkd RPC when done; resume the mainnet track
  (frontend smoke test → security review incl. the `step_grid` rewrite + partial-path change). The
  off-chain 89 < on-chain 321 is the *local* prover's trace cap, not a SNIP-36 limit — a bigger
  prover build raises it.
- **Blockers:** none.

---

> **Backfill notice (written 2026-07-06):** the entries from 2026-06-17/18 through 2026-07-02 below
> were reconstructed after the fact from git history and the topic docs — the log had lapsed during
> that stretch (see the 07-03 entry). Details live in the linked docs; these entries restore the
> narrative, not the full session-level detail.

## 2026-07-02 (backfilled) — Path creatures shipped: contracts, SDK, frontend, Sepolia
- **Goal:** mint transients-into-a-loop as their own collection with anti-farm burning.
- **Commits:** ddb14d0 · **Docs:** [path-creatures-spec.md](../path-creatures-spec.md), [v2-deployment.md](../v2-deployment.md)
- **Changed:** interview-derived spec (identity = hash(start), alive/frozen/dead, escrowed mint,
  timestamp-guarded `challenge_burn`); new `GolPathLifeformsV2` + repointed minter; SDK readers/
  planners; `/create` path spawn + `/life` path view. **Deployed 2026-07-01** and live-tested
  (frozen L-tromino mint; a challenge-burn paying its 1-NUT bounty).

## 2026-06-30 (backfilled) — Sierra-gas metering root cause; per-wallet caps; Vercel build
- **Goal:** explain the ~5× per-account feed-cost discrepancy.
- **Commits:** 42fe8de, 5ee14a9, e89e181 · **Doc:** [sierra-gas-metering-discrepancy.md](../sierra-gas-metering-discrepancy.md)
- **Found & source-confirmed:** the sender account class's **Sierra version selects the metering
  mode** (≥1.7.0 → Sierra-gas; older → legacy Cairo-steps, ~5.2× for compute), inherited down the
  call stack (sticky downgrade, confirmed in blockifier source). Shipped per-wallet tier detection
  + gas caps (`gasCaps.ts`), the self-contained Vercel build, and the incubator page.

## 2026-06-29 (backfilled) — Real gas measured; partial-paths mint UX spec
- **Goal:** stop the silent feed/mint reverts with measured numbers.
- **Commits:** 514236a · **Doc:** [partial-paths-mint-ux.md](../partial-paths-mint-ux.md)
- **Measured (receipts, not estimateFee):** 2.7–13.9M gas/gen state-dependent; `estimateFee` 4.7×
  under on active creatures → FEED_CAP=82, CHUNK≈60, ≤8-tx mint ceiling, preconfirmed waits,
  incubator + bookmarks spec'd. Frontend docs rewritten for the as-built app.

## 2026-06-24→26 (backfilled) — v2 frontend built out; the register shifts to high scores
- **Commits:** 47c1abf, d8a005d, af4c9cd, ba9cd4f, b0a4968, 6edd875, 4af50b9, f90727c, b4471da
- **Changed:** gallery wired to live v2; faithful local on-chain render + progressive loading;
  batch feed (`move_lifeform_forward_n`, contracts + SDK — later cherry-picked to main as
  b652d45/07b357a/5a2fa02, causing the divergence resolved in today's merge); `/create` became the
  slot-machine score + full FR/EN; the "waiting to be discovered" bestiary section removed.
- **Decision (recorded belatedly):** the register change away from the signed-off contemplative
  design was **user-research-driven** — the project's most engaged user (8, hunts high scores).

## 2026-06-22 (backfilled) — v2 LIVE on Sepolia; token_uri fixed in place
- **Doc:** [v2-deployment.md](../v2-deployment.md)
- Fresh v2 collection deployed via strkd (NUT, lifeforms, both minters, wiring, seeded blinker).
  `token_uri` Out-of-gas fixed same day: 3.3× render-gas cut + raw-JSON URI, in-place upgrade.

## 2026-06-19 (backfilled) — v2 grid implemented (41×41 bitboard); branch reorg
- **Commits:** 132e832, 9f6a1b3 (frontend experiment starts) · **Doc:** [v2-grid-redesign.md](../v2-grid-redesign.md)
- 41×41 / 7-felt `GridState`, SWAR bitboard stepper (~2.6M gas/gen — ~250× naive), Poseidon ids,
  Art-Blocks-style `animation_url` renderer; deep cairo-auditor pass (P0 refuted with a PoC).
  Repo reorg: `main` fast-forwarded to the perf line (hdp removed); redesign parked experimental.

## 2026-06-17/18 (backfilled) — Rust SDK: plan, decisions, crates, live-verified reads
- **Docs:** [sdk-plan.md](../sdk-plan.md), [sdk-decisions.md](../sdk-decisions.md)
- One Rust crate (`gol-sdk`) + WASM bindings; three trait seams; lean hand-rolled JSON-RPC instead
  of starknet-rs+cainome (divergences logged); reads verified against the live deployment.

## 2026-06-17 (resolved) — The "declare blocker" was a stale starknet.js hasher, not a toolchain gate
- **Goal:** find the Cairo/scarb version matching the network's CASM (per the entry below).
- **Resolution — there is no version to find; scarb 2.18 is correct.** The whole "compiled_class_hash
  mismatch" was an artifact of computing the hash with the **frontend's pinned starknet.js v7.6.4**,
  which uses the *old* `compiled_class_hash` algorithm. On the *same* scarb-2.18 CASM:
  - starknet.js v7.6.4 → `0x7eec8e15…` (wrong)
  - starknet.js v10.0.2 → `0x581b62…` (correct) — **matches the network exactly** (Cartridge +
    Alchemy both expect `0x581b62…`).
  - class_hash is unaffected (`0x41268542…` in both versions).
- **Confirmed declarable:** `estimateFee` (SKIP_VALIDATE) of the DECLARE with the correct hash
  `0x581b62…` via Cartridge Sepolia returns a clean fee (~5.7 STRK, l2_gas ~712M) — no mismatch.
  So the optimized `GolBench` declares as-is. **No toolchain bump, no rebuild, no mainnet gate.**
- **Lesson:** compute `compiled_class_hash` with starknet.js ≥ v9 (used a temp `npm i starknet@latest`
  in /tmp). The frontend's v7.6.4 silently returns a stale-algorithm hash. The 06-17 entries below
  (single-node lag → broader compiler/toolchain mismatch) were both wrong root causes chasing this
  hashing artifact — superseded by this entry.
- **Remaining real wrinkle (minor):** strkd's configured Sepolia node (`0.10.3-rc.0`) still can't
  *compile* Sierra 1.8.0 (compiler 1.7.0), so the **declare** must route through a 1.8.0-capable node
  (Cartridge): strkd sign-only + broadcast there. Deploys/invokes/estimates work on any node.
- **Next:** declare (correct hash, strkd sign-only → Cartridge) → deploy `GolBench` (constructor =
  glider) → `estimateFee` sweep `move_forward_in_place(n)` for the real on-chain ceiling (free; the
  snforge-calibrated estimate is ~350) → optional confirmation broadcast. Est. spend: declare+deploy
  ≈ 6 STRK (bench acct holds 36).
- **Blockers:** none — pending the maintainer's OK to spend ~6 STRK on the declare+deploy.

---

## 2026-06-17 (later) — Multi-node probe: compiler mismatch is broader; likely a toolchain gate
- **Goal:** probe the mainnet node(s) for Sierra 1.8.0 declare support (the morning's mainnet probe
  was rate-limited), using the canonical nodes + an Alchemy mainnet fallback.
- **Findings (supersede the "transient single-node lag" read in the entry below):**
  - **Alchemy mainnet** (`0.10.3-rc.0`): compiles Sierra 1.8.0, but expects `compiled_class_hash`
    **`0x581b62…`** while our scarb 2.18 build is **`0x7eec8e15…`** → mismatch.
  - **Cartridge Sepolia** (`0.9.0`, probed earlier) expects the **same `0x581b62…`**. Two
    independent nodes converging on the same non-scarb-2.18 hash ⇒ our local CASM is out of step
    with the **current network compiler**, not just one lagging node.
  - **strkd's Sepolia node** (`0.10.3-rc.0`) is the *opposite* problem — its compiler is too old to
    compile 1.8.0 at all (1.7.0). So the node fleet is in a mixed/transitional compiler state.
  - The live classes (declared 06-09 with scarb 2.18) matched the network compiler **then**, so a
    network compiler bump since has likely left pinned Cairo 2.18 behind.
  - Official mainnet node (`mainnet.nodes.starknet.org/rpc/v0_10`) still rate-limited (-32005) —
    couldn't confirm whether it matches Alchemy; assume it does pending a clean probe.
- **Revised conclusion:** the declare blocker is a **Sierra/CASM compiler-version mismatch between
  local scarb 2.18 and the current network**, surfaced two ways across nodes. **Not** a strkd bug
  (faithful relay) and **not** fixable by node choice alone — a node update would still mismatch our
  CASM. **This is a mainnet gate:** declaring any contract needs the local Cairo/scarb realigned to
  the network's current compiler.
- **Verified:** Alchemy mainnet Actual `0x7eec8e15…` / Expected `0x581b62…`; Cartridge Expected
  identical `0x581b62…`. Read-only `estimateFee` + `SKIP_VALIDATE`; no spend.
- **Next (maintainer):** identify the Cairo/`starknet-sierra-compile` version the current
  Sepolia/mainnet sequencer expects; bump `.tool-versions` to match; `scarb build` + `snforge test`
  (all class hashes will change); then retry the declare + on-chain ceiling measurement via strkd.
  Until then the **~350-gen estimate stands**.
- **Blockers:** toolchain↔network compiler alignment (maintainer/infra decision).

---

## 2026-06-17 — Correct the declare-blocker diagnosis (node Sierra compiler, not CASM skew)
- **Goal:** with the canonical node URLs in hand (`sepolia.nodes.starknet.org/rpc/v0_10`,
  `mainnet.nodes.starknet.org/rpc/v0_10` — the nodes strkd uses), pin down whether the
  06-16 declare failure was strkd, the RPC, or our toolchain.
- **Finding — it is the node's Sierra→CASM compiler, lagging at 1.7.0.** Hitting the *same* node
  strkd uses, directly (starknet.js `estimateFee` + `SKIP_VALIDATE` on the DECLARE), reproduces the
  exact strkd error: `Cannot compile Sierra version 1.8.0 with the current compiler (sierra version:
  1.7.0)`. So: **not strkd** (faithful relay), and **not our toolchain** — the deployed GolBench
  (06-09) and GolLifeforms (06-08) classes are already **Sierra 1.8.0** on-chain (confirmed via
  `getClassAt`), and scarb 2.18 (pinned == installed) emits 1.8.0. The node is on spec
  `0.10.3-rc.0`; its bundled `starknet-sierra-compile` is simply behind (1.7.0), so it rejects *new*
  1.8.0 declares at the RPC layer even though the sequencer accepted 1.8.0 eight days ago.
- **Correction:** the 2026-06-16 entry below blamed "CASM-compiler skew" + a Cartridge
  `compiled_class_hash` mismatch. That was a **red herring** — I had tested against the Cartridge
  node (`api.cartridge.gg`, spec 0.9.0), which is NOT the node strkd uses. Discard that root cause;
  the real cause is the node's outdated Sierra compiler. The ~350-gen estimate is unaffected.
- **Verified:** sepolia v0_10 node spec = 0.10.3-rc.0; declare estimate there → 1.7.0-compiler
  error; `getClassAt` on both live contracts → Sierra 1.8.0. Mainnet v0_10 probe was rate-limited
  (-32005), not completed.
- **Next:** (1) retry the declare + on-chain ceiling measurement once the node's compiler is ≥1.8.0
  (likely after the RC promotes to stable) — no code change needed. (2) **Before mainnet**, confirm
  `mainnet.nodes.starknet.org/rpc/v0_10` can compile Sierra 1.8.0 (the rate-limited probe left this
  open) — if it's also at 1.7.0, the mainnet declare/deploy is gated on the same node update.
- **Blockers:** node-side Sierra compiler version (operator/infra; expected transient).

---

## 2026-06-16 — Re-measure the post-perf on-chain ceiling (estimate done; on-chain confirm blocked)
- **Goal:** get a current on-chain generation ceiling for `move_forward_in_place`, since the
  documented 170 predates the −39% `step_grid` pass. Drive it through strkd per the new tx policy.
- **Branch:** `perf/step-grid-modulo-removal`. No product code changed (measurement + docs only).
- **Result — estimated new hard ceiling ≈ 350 gens** (~2× the old 170); **≥270 directly confirmed**
  by the passing in-suite benchmark (`bench_in_place_270_gens` = 933,065,263 snforge L2 gas ≈ 920M
  on-chain, under the 1.2e9/tx cap). *Method:* the new in-place benchmarks are exactly linear in n
  (marginal **3,361,365** L2 gas/gen, fixed overhead ~25.5M, snforge). The modulo pass only touches
  per-gen `step_grid`, so old marginal = new + (151,994,713 − 92,723,913)/20 = **6,324,905**/gen
  (1.88× the new). snforge→on-chain calibrates at **×0.986** against the old code's real 170-gen
  broadcast (1,085,322,855 actual L2 gas). Cap 1.2e9 ⇒ n ≈ **354**.
- **Blocked — on-chain confirmation.** Could not (re)declare the optimized `GolBench` (class
  `0x41268542…b0da`, compiled `0x7eec8e15…142d`, **Sierra 1.8.0**) on Sepolia:
  - strkd's configured RPC node: `node error … Cannot compile Sierra version 1.8.0 with the current
    compiler (sierra version: 1.7.0)` — its compiler is too old to declare our class at all.
  - Cartridge node (`api.cartridge.gg/x/starknet/sepolia`, spec 0.9.0): compiles 1.8.0 but to a
    *different* CASM → `Mismatch compiled class hash … Expected 0x581b62…` vs our `0x7eec8e15…`.
  - Root cause = CASM-compiler skew between local scarb 2.18 and the currently-available Sepolia
    nodes. Verified it's not a stale artifact (clean rebuild → same hashes) and not local toolchain
    drift (installed scarb == pinned 2.18.0, emits Sierra 1.8.0). The 06-08/09 production declares
    succeeded because sncast then used a node compatible with scarb 2.18's CASM. **Did not** force
    it via an arbitrary public RPC or a fudged compiled hash.
- **Verified:** strkd paired + auth OK; balance read (bench acct `0x026d87…e70f` = 36.30 STRK, so
  funding not needed); declare correctly rejected at fee-estimation (no spend). `snforge test` = 35
  passed. starknet.js v7.6.4 (from the frontend) used for hashing/estimation.
- **Next / decision needed (maintainer):** to get the *confirmed* on-chain ceiling, either (a) point
  strkd's RPC at the node used for the 06-09 declares (scarb-2.18-CASM-compatible), or tell me that
  URL and I'll strkd-sign-only + broadcast there; or (b) accept the ~350 estimate above. **Broader
  flag for the mainnet plan:** scarb 2.18 / Sierra 1.8.0 classes do **not** currently declare on the
  two nodes tried — worth confirming a known-good Sepolia/mainnet RPC before the mainnet deploy.
- **Blockers:** node/RPC compatibility for declaring Sierra 1.8.0 (a human/infra choice).

---

## 2026-06-16 — Review post-06-09 work; adopt strkd-only tx tooling (retire sncast)
- **Goal:** understand the work done since the 2026-06-09 STATUS snapshot (the step-engine perf
  pass + the benchmark), and switch all transaction tooling from `sncast` to the strkd wallet
  companion.
- **Branch:** `perf/step-grid-modulo-removal` (review/docs only — no product code changed this
  session). Reviewed commits `da2c284`, `653403c`, `4b69301`.
- **Changed (docs only):** documented the strkd-over-sncast policy in
  [development.md](../development.md) (new "Transaction & signing tooling" section; reframed the
  raw-key `deploy_full.ts` deploy path as deprecated). Refreshed STATUS (date/branch/35 tests,
  a Performance "Done" bullet, the strkd tooling line, and a caveat that the 170 ceiling predates
  the perf work). This entry.
- **Understood — the step-engine change (`src/gol_utilities.cairo`):**
  - `da2c284` factored the Conway rules into one shared `step_grid` free function and added
    `iterate_life_several_in_place(state, generations)` — unpack the u256 grid once, step in
    place, pack once (vs re-packing every generation in a loop of `iterate_life_once`). ~3×
    cheaper per generation. New interface method; `iterate_life_once` now delegates to `step_grid`
    (behaviour unchanged). `src/gol_bench.cairo` (`GolBench`) is throwaway benchmark scaffolding.
  - `653403c` replaced the four `% grid_size` wraps per cell with branch-based toroidal wraps
    (`if x == 0 {14} else {x-1}` etc.) and hoisted `row_above`/`row_below` + the three `grid.at()`
    row snapshots out of the column loop (they depend only on `row`). **−39.0% L2 gas** on
    `bench_in_place_20_gens` (151,994,713 → 92,723,913).
  - `4b69301` added four reference-output tests comparing `iterate_life_several_in_place` against
    an independent Python GoL sim across every wrap direction (interior, right/bottom edge, left
    seam), plus the earlier toroidal corner-block + seam-blinker tests.
- **Verified:** `snforge test` green — **35 passed, 0 failed**. Suite includes in-place benchmarks
  at 20/100/200/250/270 generations, all passing.
- **Decisions:**
  - **strkd is now the only transaction tool.** Rationale: keys never leave the wallet, every
    sensitive action is human-approved on-screen, and the prior blocker (strkd couldn't submit a
    proof-carrying verify tx) is fixed — `wallet_addInvokeTransaction` now takes `proof_facts`/`proof`.
    So `sncast` and the raw-`DEPLOYER_PRIVATE_KEY` `deploy_full.ts` path are both retired.
  - Paired strkd (client `claude-code-gol`, `reattach:true` recovered the existing client +
    its `gol-bench` agent account `0x026d87…e70f`). Status: unlocked, SN_SEPOLIA, no grant (so
    every own-account op prompts the human — kept as-is).
- **Next:** (1) the 170-gen on-chain ceiling predates the −39% step_grid pass — **re-measure** via
  strkd `move_forward_in_place` on the live `GolBench` for a current number (in-suite bench reaches
  270). (2) Resume the mainnet track: frontend smoke test → independent security review (now
  including the `step_grid` rewrite + the partial-path semantic change). (3) Decide whether to
  merge `perf/step-grid-modulo-removal` → `chore/modernize-and-prune` → `main`.
- **Blockers:** none.

---

## 2026-06-09 — SNIP-36 benchmark: on-chain vs off-chain generation ceiling
- **Goal:** measure the max GoL generations advanceable in one transaction — on-chain vs
  off-chain via SNIP-36 — using the in-place iteration.
- **Branch:** `main` (bench code authored in a prior session; this session is measurement
  only — **no product code changed**).
- **Changed:** no product code. Benchmark-only `src/gol_bench.cairo` (`GolBench`, SNIP-36) is
  deployed on Sepolia at `0x0057ac40958e78244ba405fcbf4ba37e20af65c45ad8c305bf61d3d211a6eb99`
  (class `0x4460e11a…14cc`). Added `docs/strkd-snip36-feature-request.md` (portable; for the
  strkd maintainer).
- **Verified — the result:**
  - **On-chain ceiling: 170 generations** in one tx (`iterate_life_several_in_place`), bounded
    by the **1.2e9 L2-gas-per-tx protocol cap**. Measured via `starknet_estimateFee`
    (`/tmp/golbench/estimate.py`, SKIP_VALIDATE, no spend): ~7M L2 gas/gen; n=170 = 1,193M gas
    (ok), n=171 = 1,201M (> cap). **Correction:** an earlier note said "97" — that was a wrong
    gas-per-gen estimate (~12M assumed vs ~7M actual) and was never broadcast (n=64 was the
    highest confirmed). The same `estimateFee` simulates full execution, so n≤170 demonstrably
    runs to completion on-chain. **Confirmed by real broadcast** of `move_forward_in_place(170)`
    via strkd from the agent account — tx `0x50fd2c79…bdedc`, SUCCEEDED/ACCEPTED_ON_L2,
    `get_age` 58→228, actual L2 gas 1,085,322,855 (l1_gas 0), fee 8.68 STRK. (Actual came in
    under the estimate, so 170 had ~115M gas of headroom under the cap.)
  - **Off-chain SNIP-36 ceiling: 43 generations** — on the **local** native stwo "Dinner"
    build. n=43 proves (~32–40 s, ~408 KB proof); n≥44 fails fast (~16–24 s) with the stwo
    error **`Not enough twiddles!`** — the circle-FFT domain max, i.e. that build's
    **trace-size cap**. Binary search: ✅ 15/35/40/43 · ❌ 44/45/56/97/150.
  - Funded the bench agent account 30 STRK (balance limit ≈ 220 gens) → **balance was not the
    binding constraint; the local prover capped first.**
  - Full round-trip validated at n=15 and at the ceiling n=43: strkd sign-only → Dinner prove
    → on-chain `verify_move_forward` (checks `proof_facts[8] == message_hash`). Bench `get_age`
    0→15→58. Verify txs `0x0671…0857` (n=15), `0x0445…14d3` (n=43).
- **Findings:** For this workload **off-chain (43) < on-chain (170)** — but they are
  *different kinds of limits*: on-chain is the protocol gas cap (calibrated to the *production*
  prover); off-chain (43) is the *local* Dinner stwo build's fixed trace/twiddle capacity. Same
  prover family, far smaller local build. Raise its max log size / twiddle precompute and the
  off-chain ceiling climbs past 170 (off-chain isn't subject to the 1.2e9 cap — next limits are
  balance ~220, then RAM). Not a SNIP-36 limitation. strkd handled pair/create/fund/deploy/sign with **no failures**
  (grant auto-approves own-account ops; only funding prompts). The only gap: submitting the
  proof-carrying verify tx — `wallet_addInvokeTransaction` has no `proof`/`proof_facts` params —
  so verify went through `sncast --proof-file/--proof-facts-file` from `playground-master` (works
  because `verify_move_forward` has no sender check). Captured as a feature request (enrich the
  existing method; no new endpoint).
- **Next:** to push the off-chain ceiling higher, raise the stwo prover's max log size /
  twiddle precompute in the Dinner build and re-run the sweep (should climb toward the ~220
  balance limit at 30 STRK). Otherwise resume the mainnet track (frontend smoke test → review).
- **Blockers:** none in-repo. (Beating on-chain off-chain needs a Dinner prover-config change,
  outside this repo.)

---

## 2026-06-08 — Deploy to Sepolia + wire the frontend
- **Goal:** stand up the full contract graph on Sepolia and point the web app at it.
- **Branch:** `chore/modernize-and-prune` (config changes; `.env.local` is gitignored)
- **Changed:** deployed all four contracts via `sncast` from the `deployer` account
  (`0x319…532`), declared the classes, deployed, and wired roles + nutrient address + allowance in
  a single atomic multicall. Set `ui/game-of-life/.env.local` to the live addresses; fixed the dead
  `blastapi` default RPC in `.env.local.example` and `contracts.ts` to the Cartridge Sepolia node.
  Addresses recorded in STATUS.
- **Verified:** on-chain reads confirm the three `MINTER_ROLE` grants, the allowance (1001 NUT),
  a real `mint_loop` of a 2×2 block (token `98307`: owner = deployer, `LifeFormData` correct,
  NUT 1001→1000), and `token_uri` returning the base64 `data:application/json` (decodes to
  `{"name":"Lifeform #98307…`). Frontend wallet/mint/event paths remain build-verified — manual
  click-through is the next step.
- **Decisions:** deployed with `sncast` (keys stay in its account file; the agent never handles
  them) rather than the private-key TS script. The `deployer` account was topped up to ~123 STRK
  because GolLifeforms' declare alone wanted a ~35-STRK max-fee bound. Skipped the TS script's
  hardcoded test-mint; did one clean verification mint instead.
- **Next:** manual frontend smoke test against the deployment; then the independent security review
  (incl. the partial-path semantic change) ahead of mainnet.
- **Blockers:** none.

## 2026-06-08 — Fix the partial-path closing-segment bug + happy-path mint tests
- **Goal:** make the `*_from_partial_paths` mints reachable (the prior session pinned them as dead)
  and prove it end-to-end.
- **Branch:** `chore/modernize-and-prune`
- **Changed:** `compute_partial_path` now iterates `generations - 1` (one fewer step), so the
  trigger guard covers only the states the segment stores instead of peeking one step past the
  exitpoint. Replaced the bug-pinning `test_partial_path_cannot_span_a_full_period` with two
  end-to-end mints (`test_mint_loop_from_partial_paths` via a blinker, `test_mint_path_from_partial_paths`
  via L-tromino -> block) and a `test_partial_path_rejects_overshooting_the_period` guard test.
  Updated ROADMAP/STATUS.
- **Verified:** `scarb build` + `snforge test` green (23, +2 net). The two `*_from_partial_paths`
  entrypoints now mint successfully; over-length segments still revert `'Triggered state reached'`.
- **Decisions:** maintainer greenlit the fix. exitpoint/length semantics are unchanged (same index,
  same value) — the change only drops the spurious peek; `is_single_loop_from_initial_state` calls
  the underlying util directly and is unaffected. Flagged as an on-chain semantic change for the
  pre-mainnet audit scope.
- **Next:** Phase 4 (indexer/gallery, Sepolia deploy by maintainer → mainnet) and the independent
  audit, which should cover this change.
- **Blockers:** none.

## 2026-06-08 — Partial-path test coverage (+ latent bug found)
- **Goal:** cover the partial-path discovery/combination/mint flows (ROADMAP backlog).
- **Branch:** `chore/modernize-and-prune`
- **Changed:** added 5 tests to `tests/test_minters.cairo`: a positive create+combine test (events
  asserted via `spy_events`), combine's two guard reverts (`'Not combinable'`,
  `'Different trigger state'`), the `mint_loop_from_partial_paths` registration guard, and
  `test_partial_path_cannot_span_a_full_period` which pins the bug below. Updated ROADMAP/STATUS.
- **Verified:** `scarb build` + `snforge test` green (21, +5).
- **Finding:** the two `*_from_partial_paths` mints are **unreachable for real loops.**
  `compute_partial_path` trigger-checks one step past the segment's stored exitpoint (it iterates
  `generations` times but stores index `generations-1`), and that peeked step is exactly the
  closure state `== loop_id == trigger_state` the mints require — so the closing segment always
  reverts `'Triggered state reached'`. Proposed fix: iterate `generations-1` in
  `compute_partial_path` (exitpoint/length unchanged); localized — nothing else calls it.
- **Decisions:** did **not** apply the fix — it's an on-chain semantic change, so it's the
  maintainer's call (cf. the economy-design episode). Tests document current behaviour honestly.
- **Next:** maintainer decides fix-now vs defer; if fix, add happy-path mint tests for the full
  partial-path loop/path flows.
- **Blockers:** none for the tests; the bug fix is gated on sign-off.

## 2026-06-08 — Movement-integrity guard + economy reframing
- **Goal:** stop NUT being earned on phantom (unminted) ids; correct docs that mis-framed the
  NUT economy as a flaw.
- **Branch:** `chore/modernize-and-prune`
- **Changed:** `move_lifeform_forward` now asserts `self.erc721.exists(token_id)` and reverts
  `'Lifeform not minted'`; added a negative + positive test. Reframed ROADMAP Phase 3 + STATUS:
  the free NUT faucet is **intentional** (proof-of-participation that drives on-chain movement),
  so Phase 3 is a security review, not an economy redesign.
- **Verified:** `scarb build` + `snforge test` green (16, +2).
- **Decisions:** per Henri — earning NUT requires advancing a *real* lifeform, but ownership
  still doesn't matter (you may advance anyone's). No NUT fees/sinks added; inflation is by design.
- **Next:** independent security review of the contracts.
- **Blockers:** none.

## 2026-06-08 — Phase 2: on-chain SVG `token_uri`
- **Goal:** make the NFTs render — override `token_uri` with on-chain metadata + an SVG.
- **Branch:** `chore/modernize-and-prune`
- **Changed:** added `src/base64.cairo` (base64 encoder) and `src/gol_metadata.cairo` (SVG + JSON
  builders, decimal helpers); overrode `token_uri`/`tokenURI` in `gol_lifeforms` (embed the ERC721
  pieces individually instead of the Mixin + supply a custom `IERC721Metadata`); set the base URI
  to empty; re-extracted the lifeforms ABI for the frontend.
- **Verified:** `scarb build` + `snforge test` green (14, +6): base64 RFC vectors, exact SVG and
  JSON output, and an end-to-end `token_uri` read after minting.
- **Next:** Phase 3 (economy redesign + security review) — or maintainer deploys to Sepolia.
- **Blockers:** none for Phase 2.

## 2026-06-08 — Documentation system
- **Goal:** document the code written so far and establish a prescriptive project-management process.
- **Branch:** `chore/modernize-and-prune`
- **Changed:** added `docs/README.md` (index + doc-contribution rules), `docs/frontend.md`,
  `docs/development.md`, and `docs/project-management/` (this process, STATUS, ROADMAP, LOG);
  rewrote the root `readme.md` as the entry point and fixed its broken doc links.
- **Verified:** docs only; no code change. Baseline still green from the prior session.
- **Next:** Phase 2 (on-chain `tokenURI`/SVG), or maintainer deploys to Sepolia to runtime-verify Phase 1.
- **Blockers:** none for docs.

## 2026-06-08 — Phase 1 polish: fate-finder, path minting, lifeforms view
- **Goal:** finish the Phase 1 frontend features that don't need a deployment.
- **Branch:** `chore/modernize-and-prune` · **Commits:** f7438bf
- **Changed:** extracted the GoL core to `lib/gameOfLife.ts` with a pure `computeFate()`
  (replacing the buggy stale-closure loop detection); added `mintPath` and `move_lifeform_forward`
  ("breathe life"); added `LifeformsPanel` (owned lifeforms via `NewLifeForm` events) + `GridPreview`.
- **Verified:** `computeFate` checked against block/blinker/L-tromino/empty (17 assertions, all pass);
  `npm run build` green. ⚠️ wallet/mint/event paths build-verified only.
- **Decisions:** detection is now synchronous + pure; animation is purely visual.
- **Next:** documentation, then Phase 2.
- **Blockers:** live verification needs a deployment (see STATUS).

## 2026-06-08 — Phase 1 foundation: wire the frontend to Starknet
- **Goal:** give the Next.js app real chain integration.
- **Branch:** `chore/modernize-and-prune` · **Commits:** f829fd2
- **Changed:** added `starknet` + `@starknet-io/get-starknet`; `lib/contracts.ts` (env config),
  `lib/wallet.tsx`, `lib/useGol.ts`; connect button + NUT balance + "Mint this loop" in the UI;
  extracted ABIs to `lib/abi`; `.env.local.example`; fixed latent `Array.fill()` type errors and
  bumped tsconfig target to ES2020.
- **Verified:** `npm run build` green.
- **Next:** Phase 1 polish (path mint, lifeforms view, fate-finder fix).
- **Blockers:** addresses are deploy-time config; not yet deployed.

## 2026-06-08 — Upgrade OpenZeppelin 3.0 / Starknet 2.18
- **Goal:** finish modernizing the contract dependencies.
- **Branch:** `chore/modernize-and-prune` · **Commits:** 99835bf
- **Changed:** `starknet` 2.9→2.18, `openzeppelin` 0.20→3.0; migrated moved interfaces to
  `openzeppelin::interfaces::*`, added ERC20 `DefaultConfig`, made `ref self` dispatcher vars `mut`.
- **Verified:** `scarb build` + `snforge test` green (8).
- **Decisions:** used OZ 3.0 stable (the v4 RC isn't published to the Scarb registry).
- **Next:** Phase 1 frontend.

## 2026-06-08 — Remove stale frontend + dead code
- **Goal:** delete unused frontends and dead files.
- **Branch:** `chore/modernize-and-prune` · **Commits:** ff45d5b
- **Changed:** removed the Vite app (`ui/gol-website`) and a dead duplicate `comparison.tsx`.
  Kept the standalone `js/` reference implementation (it's documented in `overview.md`).
- **Verified:** n/a (deletions); contracts still build.
- **Next:** OZ/Starknet upgrade.

## 2026-06-08 — Phase 0: unblock build, modernize toolchain, repair tests
- **Goal:** get a green baseline on the current toolchain.
- **Branch:** `chore/modernize-and-prune` · **Commits:** d9a1ad7
- **Changed:** removed the unused `hdp_cairo` dep whose pinned git rev no longer existed (it
  alone blocked the build); bumped `snforge_std`/`assert_macros` to match `snforge` 0.60;
  deleted dead `test_contract.cairo` boilerplate; rewrote `test_grid_utils` + `test_minters`
  as correct integration tests; added `.tool-versions` + CI.
- **Verified:** `scarb build` + `snforge test` green (8). The previous tests had never passed.
- **Next:** remove stale files; OZ/Starknet upgrade.
