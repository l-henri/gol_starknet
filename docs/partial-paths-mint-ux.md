# Spec — Feeder gas cap, preconfirmed waits, partial-path minting & the Incubator

Status: draft for implementation · Date: 2026-06-29 · App: `ui/game-of-life`
Author: interview-derived (Henri + Claude). Hybrid UX + technical spec.

## 0. Why this exists

Wallets (observed with **Ready/Argent**) hard-cap a transaction at **1.2B L2 gas** regardless of
network capacity. Two features in the app exceed or brush against that cap:

1. **Feeding** a creature N generations. Cost is **state-dependent**, not constant.
2. **Minting** a discovered loop. The on-chain mint re-simulates the *entire* loop to verify it, so
   long-period loops (e.g. a 164-gen glider) need ~2.3B gas — impossible in one tx.

This spec fixes the feeder cap, speeds up every tx wait, and adds the multi-transaction
**partial-path** minting flow plus an **Incubator** page to manage in-progress mints and bookmarks.

## 1. Gas reality (measured 2026-06-29)

All numbers are **actual on-chain `execution_resources.l2_gas`**, not `estimateFee` (see the warning).

| operation | creature | n | actual L2 gas | per-gen |
|---|---|---|---|---|
| feed | blinker (3-cell oscillator) | 270 | 717M | **2.7M/gen** |
| feed | `0x1ab97b…` (active) | 80 | **1.11B** | **13.9M/gen** |
| mint (single-shot) | glider, period 164 | — | 2.29B | ~14M/gen |

**Per-step gas is pattern/state-dependent, ~2.7M–14M per generation.** A sparse oscillator barely
touches the grid; an active pattern spread across the board costs ~5× more per step.

> ⚠️ **`estimateFee` is unreliable here.** For the `0x1ab97b…` feed it predicted 236M; reality was
> 1.11B (**4.7× under**). It estimates from the creature's *current* (often collapsed/sparse) state
> and misses the denser states the run traverses. **Do not drive caps off `estimateFee`.** Use a
> conservative worst-case constant (this spec) or local simulation (future).

Worst case ≈ **14M/gen**. Against the 1.2B cap that is ~85 gens; with margin we use **82**.

## 2. Feature A — Feeder slider cap

**Decision: static cap of 82 generations.** `82 × ~14M ≈ 1.15B < 1.2B`, safe for the worst-case
(active) creature; sparse creatures simply feed again. No reliance on `estimateFee`.

- `ui/game-of-life/src/app/life/[id]/page.tsx`: set `FEED_CAP = 82` (replaces the current `270`).
  Rewrite the comment to cite the 1.2B wallet cap, the ~14M/gen worst case, and the measured basis.
  Drop the block-limit reasoning (the binding constraint is the wallet cap, not the block).
- Keep the slider `min=1`, `max={FEED_CAP}`.
- **Future (not now):** "local-sim dynamic" cap — the SDK already steps the loop locally, so a per-step
  cost model (e.g. gas ∝ active cells / births+deaths) could raise the cap per-creature for sparse
  ones while staying safe for dense ones. Requires calibrating the model against real receipts.
  Tracked as a follow-up; ship the static 82 first to stop the silent reverts.

## 3. Feature B — Preconfirmed tx waits (app-wide)

Today `waitForTx` waits for **`ACCEPTED_ON_L2`**, which is slow. **Preconfirmation is enough** for our
UX — treat a tx as done as soon as it is preconfirmed with `execution_status = SUCCEEDED`.

- `ui/game-of-life/src/lib/wallet.tsx` → `waitForTx`: pass `successStates` to
  `provider.waitForTransaction` that accept the preconfirmed state (the earliest state at which
  execution success is known), keep `retryInterval` short.
- Apply **everywhere** a tx is awaited: feed (`useBreathe`), mint (`useMint`), edit render-params,
  and the new partial-path sequence.
- The "view tx" link and success flash fire on preconfirmed.
- **Open item (verify in impl):** the exact finality-status enum for preconfirmation exposed by the
  RPC node (`…/rpc/v0_10`) and accepted by starknet.js v7.6.4 `successStates`. Fall back to
  `ACCEPTED_ON_L2` if preconfirmation isn't reported, so the wait never hangs.

## 4. Feature C — Partial-path minting (the main feature)

### 4.1 Contract mechanism (already deployed, v2)

`GolLoopMinterV2` (`src/gol_loop_minter_v2.cairo`) verifies a long loop across several txs using a
per-caller registry (`registry[caller][hash(path_start)] → PartialPathData`):

- **`mint_partial_path(path_start, path_length, trigger_state)`** — steps `path_length-1` times from
  `path_start`, records the segment `{entrypoint_id, exitpoint, length, trigger_id, smallest}`.
  Asserts the trigger (the loop's canonical state) is **not** reached inside the segment. **This is the
  gas-heavy call** (∝ segment length × per-step cost).
- **`combine_partial_path(id1, id2)`** — stitches adjacent segments: requires `p1.exitpoint` steps to
  `p2.entrypoint` and same `trigger_id`; writes the combined segment back under `id1`
  (`length = p1+p2`, `exitpoint = p2.exitpoint`, `smallest = min`). **Cheap.**
- **`mint_loop_from_partial_paths(loop_state, recipient)`** — once one registered segment spans the
  whole loop: asserts `trigger_id == loop_id`, `length > 1`, `smallest == loop_id` (canonical), and
  closure (`step(exitpoint) == loop_id`); then calls `lifeforms.mint`. **Cheap.**

**NUT:** `lifeforms.mint` charges the minter `sequence_length` NUT (= loop length, 1/gen) via
`transfer_from`. So the **NUT approve + charge happen only on the final tx**; segment/combine txs are
NUT-free. The minter needs `loop_length` NUT + an allowance to the lifeforms contract.

> Single-shot `mint_loop` stays the path for short loops (≤ one tx of gas). Partial paths are only
> engaged when a loop is too long for one tx.

### 4.2 Chunking algorithm (SDK planner)

Given the loop's canonical state `C` (token id) and period `L`:

1. If single-shot `mint_loop` fits in one tx (`L ≤ SINGLE_SHOT_MAX`), use it. Done.
2. Otherwise tile the loop into `S = ceil(L / CHUNK)` segments. The path starts one step after `C`
   and walks the loop; the canonical appears only at closure (so no segment trips the `!triggered`
   assert). The frontend computes each segment's `path_start` by **local simulation** (the SDK
   stepper), so no extra reads are needed.
3. Emit the tx sequence (see 4.3).

**CHUNK and SINGLE_SHOT_MAX must be measured, not guessed** (see Open Items). Conservative defaults
pending measurement: `SINGLE_SHOT_MAX ≈ 60`, `CHUNK ≈ 60` gens/segment. Rationale: worst-case
~14M/gen → ~82 gens fills 1.2B alone, but a segment tx is **batched with its combine** (4.3), so the
segment must leave headroom for the combine → smaller chunk. `mint_partial_path` may also cost more
per gen than a plain feed step (it tracks `smallest` + trigger), or less (it skips the full
uniqueness check of single-shot) — measurement decides.

### 4.3 Transaction sequencing & batching

Per the "batch cheap ops with their step" decision:

- **tx 1:** `mint_partial_path(segment 1)`
- **tx k (k = 2..S):** `mint_partial_path(segment k)` **+** `combine_partial_path(id1, idk)` in one
  multicall (segment registers `idk`; combine folds it into the running `id1` — same-tx state is
  visible). The heavy segment leaves headroom for the cheap combine; CHUNK is sized so the pair fits
  under 1.2B.
- **tx final:** `approve(NUT, loop_length)` **+** `mint_loop_from_partial_paths(C, recipient)` in one
  multicall.
- **Total = S + 1 transactions.**

### 4.4 Loop-length ceiling

**Cap by transaction count: ≤ 8 txs.** So `S ≤ 7` → **max mintable loop ≈ 7 × CHUNK** (~420 gens at
CHUNK 60; refined after measurement). Loops longer than the ceiling are **refused with a clear
message** ("This loop is too long to mint right now — N generations needs M transactions, over the
8-tx limit"), not silently failed. A 164-gen glider ≈ `ceil(164/60)+1 = 4` txs. ✅

### 4.5 /create UX flow (one-click, auto-sequenced)

When a drawn pattern settles into a loop too long for single-shot:

1. The Spawn button reads **"Spawn (N transactions)"** with a one-line notice: *"Long loops are
   verified in pieces — your wallet will ask you to approve ~N transactions in a row."* (FR/EN).
2. One click starts the **auto-sequence**. Fire tx 1; on each tx's **preconfirmation**, fire the next,
   re-using the same approval momentum. A progress indicator shows **"Verifying… step k of N"** with a
   slim bar. Each step shows its tx link.
3. **Failure mid-sequence → auto-retry once, then pause.** Transient failures (nonce / RPC / preconfirm
   timeout / user mis-click) self-heal on one silent retry. A second failure pauses the sequence,
   keeps completed segments, and shows **"Resume"** for the failed step (no re-paying for done work).
4. On the final tx's preconfirmation → success flash + route to the newborn `/life/[id]` (as today).
5. **Resume entry inline:** if the user returns to a pattern with partial on-chain progress, /create
   shows **"Resume mint — k of N done"** instead of starting over (state read per 4.7).

### 4.6 SDK additions (`crates/gol-sdk-wasm`, today only `mintLoopCalls`)

Add WASM bindings + underlying `gol-sdk` writers/reads:

- `mintPartialPathCall(pathStart, pathLength, triggerState)` → one call.
- `combinePartialPathCall(id1, id2)` → one call.
- `mintLoopFromPartialPathsCalls(loopState, recipient)` → `[approve, mint_from_partials]`.
- `planLoopMint(rows, loopLength, recipient)` → the **full plan**: an ordered array of txs (each tx =
  one or more calls per 4.3), the per-segment `path_start` states (locally simulated), the tx count,
  and a `tooLong` flag if it exceeds the 8-tx ceiling. This is what `useMint` drives.
- Reads for resume: `partialPathProgress(owner, loopId)` → which segments are registered and the
  combined length so far, by decoding `PartialPathCreated` / `PartialPathsCombined` events and/or
  registry reads.

### 4.7 Resume & state model

Partial-path segments live **on-chain** in the minter registry, namespaced per wallet — so progress is
durable and resumable across devices/sessions. Resume detection:

- Read the user's `PartialPathCreated` / `PartialPathsCombined` events (scoped to their address) +
  registry to reconstruct: which segments exist, combined length, next `path_start` needed.
- Reconcile against the planner's expected sequence → "k of N done", resume at k+1.

## 5. Feature D — The Incubator (`/incubator`)

A page to manage **things not yet born**:

1. **In-progress mints** — long-loop mints with partial on-chain progress (from 4.7). Each card:
   pattern preview, "k of N steps done", **Resume** (continues the auto-sequence) and **Discard**
   (abandons; on-chain segments are simply left — note they cost gas already spent).
2. **Bookmarks** — creatures the user discovered in /create but hasn't minted. "Bookmark" saves the
   pattern **without** any transaction.

### 5.1 Bookmark storage

A discovered-but-unminted creature is just a pattern (canonical rows + period), not on-chain.
**Store bookmarks in `localStorage`** (per-device), schema:
`{ id: token_id_hex, rows: number[41], period: number, savedAt: ms, note?: string }`.
- Pros: zero cost, instant, no backend. Cons: per-device, lost on cache clear.
- **Future option:** account-bound bookmarks (signed off-chain store or a tiny on-chain registry) for
  cross-device sync — out of scope now.

### 5.2 Entry points & surfaces

- Header nav link **"Incubator"** (with a count badge when there are in-progress mints).
- /create: a **"Bookmark"** action next to Spawn when a loop is found; and the inline Resume (4.5).
- /life and gallery: unaffected (those are *born* creatures).

## 6. Implementation order (phased)

1. **Quick wins (ship first):** `FEED_CAP = 82` + comment; preconfirmed `successStates` in `waitForTx`
   (with safe fallback). These fix live pain immediately.
2. **Measure** (gates the rest): actual L2 gas of `mint_partial_path` at a couple of segment lengths
   and `combine_partial_path`, on an active loop (the glider). Set `CHUNK`, `SINGLE_SHOT_MAX`, and the
   8-tx loop ceiling from data.
3. **SDK:** partial-path call builders + `planLoopMint` + resume reads. Unit-test the plan against the
   contract asserts (path_start/trigger choice, closure) on a known loop.
4. **/create flow:** branch single-shot vs partial; one-click auto-sequence; progress; auto-retry-once;
   inline resume; the "N transactions" notice.
5. **Incubator page:** in-progress mints (resume/discard) + localStorage bookmarks.
6. **Follow-up (later):** local-sim dynamic feed cap; account-bound bookmarks.

## 7. Open items / to verify during implementation

- [ ] Exact preconfirmation finality-status string from the RPC node + starknet.js `successStates`
      acceptance; safe fallback to `ACCEPTED_ON_L2`.
- [ ] Measure `mint_partial_path` (per-gen) and `combine_partial_path` gas → set `CHUNK`,
      `SINGLE_SHOT_MAX`, loop ceiling. (Don't trust `estimateFee`; use a real tx or actual-gas sim.)
- [ ] Confirm the exact `path_start` / `trigger_state` the contract expects so no segment trips
      `!triggered` and the final closure check passes — cover with a test on the glider.
- [ ] Confirm minter NUT balance/allowance UX: the final tx needs `loop_length` NUT; surface a clear
      "you need N NUT" precheck (the app can read balance) before starting a multi-tx sequence the user
      can't finish.
- [ ] Decide Incubator "Discard" semantics for on-chain segments (leave as-is vs. a note that gas is
      already spent and they can resume later anyway).

## 8. Decisions log (from interview)

- Feed cap: **static 82** (not dynamic yet; estimateFee unreliable).
- Tx waits: **preconfirmed everywhere** (faster).
- Mint flow: **one-click auto-sequenced**, with an explicit "several wallet prompts" notice.
- Batching: **cheap ops batched with their heavy step** (segment+combine; approve+final).
- Loop ceiling: **≤ 8 transactions**; refuse longer with a clear message.
- Mid-sequence failure: **auto-retry once, then pause** (keep progress, offer resume).
- Resume + management: a dedicated **Incubator** page (`/incubator`) for in-progress mints **and**
  bookmarked unminted creatures; bookmarks in **localStorage**.
