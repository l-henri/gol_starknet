# GoL v2 — Bigger Grid Redesign (Technical Spec)

**Status:** Draft for review · **Branch:** `docs/v2-grid-redesign` · **Date:** 2026-06-19
**Author:** henri (with Claude) · **Sensitivity:** Internal (AMBER) — roadmap / unpublished design

> **Implementation update (2026-06-19).** Final parameters: **41×41** (not 38×38), stored as
> **7 row-aligned `felt252` words** (6 whole rows per felt, 41-bit rows; 41 is the max square in 7
> such felts). `src/gol_grid_v2.cairo` is now the authoritative source for the grid core — the
> bitboard stepper, `lt` canonicalization, `token_id` (Poseidon), and the `GridState` storage form,
> all tested. **References to "38×38" and "6 words" elsewhere in this doc predate this — read them
> as 41×41 / 7 words.**
>
> **Progress:** Phases 1–4 done (grid core, utilities, contracts, on-chain SVG; full suite 57). A
> deep `cairo-auditor` pass (4 vector + 1 adversarial) found **no exploitable safety bug**; its P0
> (forged-witness path mint) was a false positive, refuted with a committed PoC test (the registry
> keying invariant binds the witness to the landing state). Fixes applied: canonical-state storage,
> nutrient-in-constructor, registry-read-under-caller. NUT-sink and upgrade-timelock are documented
> PoC decisions; mint front-running deferred to v3. **P5 done:** ~2.64M L2 gas/generation at 41×41
> (O(n), barely above 38×38), ~450 generations/tx. **Token render reworked** from SVG to an
> Art Blocks-style interactive renderer: `token_uri` → JSON whose `animation_url` is a
> `data:text/html;base64` page that reconstructs and animates the grid in-browser from injected row
> masks + traits. Payload is density-independent (~162M gas flat), which **resolves the P5
> dense-render concern**. **Remaining before mainnet:** external/formal audit + governance hardening.
>
> **Deferred check (TODO):** open a minted lifeform's `animation_url` (decoded `data:text/html`) in
> a real browser to confirm the canvas render + animation look right. The grid/Conway logic is
> node-verified (bit convention, blinker period-2, toroidal wrap); the visual hasn't been eyeballed.

---

## 1. Summary

v1 runs Conway's Game of Life on a **15×15 toroidal grid**, with the entire grid state
packed into a single `u256` (`LifeFormData.current_state`). That `u256` simultaneously serves
as the grid content, the ERC-721 `token_id`, and the canonical ordering key (loops are
canonicalized by the *smallest state* in the cycle via `u256 <`).

v2 moves to a **38×38 toroidal grid** (1,444 cells). This is the largest square grid that fits
in **6 `felt252` storage words** (6 × 251 ≈ 1,506 bits), and it clears the **36-cell "gun
threshold"** — the smallest size at which gun-class / engineered Life structures can physically
exist (Gosper glider gun bounding box = 36×9). The jump from 225 → 1,444 cells (≈6.4×) is the
point at which the *class* of representable creatures expands, not just the count.

Because the state no longer fits in a `u256`, the v1 invariant "state **is** the id **is** the
ordering key" breaks and must be re-architected. This spec defines the v2 state model, identity
scheme, stepping algorithm, and cost envelope.

### Decisions locked (interview, 2026-06-19)

| Area | Decision |
|---|---|
| Grid | **41×41**, toroidal, **fixed at compile time** (const) |
| State layout | **Row-per-word bitboard** for compute; dense-packed **6× `felt252`** for storage |
| Equivalence | **Time-cycle only** (v1 semantics) — translated/rotated copies are distinct tokens |
| Canonical representative | **Lexicographically smallest** state in the loop (big-endian over packed words) |
| Token id | `token_id = Poseidon(canonical packed state)` — also the uniqueness/dedup key |
| v1 ↔ v2 | **Fresh new collection** — separate deployment; v1 on Sepolia untouched |

### Explicitly deferred

- **Spatial canonicalization** (translation / rotation / reflection invariance) — structurally
  infeasible on-chain (see §6.3); revisit as an off-chain-compute + STARK-verify extension.
- **v1 → v2 migration** — none; the two are independent collections.

---

## 2. Goals & non-goals

**Goals**
- Expand the representable creature space past the v1 ceiling into gun-class / engineered patterns.
- Keep per-transaction cost within the Starknet protocol gas cap, with longer loops handled by the
  existing partial-path chaining mechanism.
- Preserve the v1 game loop: mint loops / paths, "breathe life" stepping, NUT economy.

**Non-goals**
- Spatial (position/rotation/reflection) creature identity — deferred.
- Backwards compatibility or migration with v1 tokens.
- Variable / runtime-configurable grid size.

---

## 3. Background: why the v1 model can't just be scaled

The `u256` state is load-bearing in three independent ways. Each must be replaced:

| v1 role of `current_state: u256` | Why it breaks at 38×38 | v2 replacement |
|---|---|---|
| **Grid content** (1 cell / bit) | 1,444 bits > 256 | Multi-word state (§4) |
| **ERC-721 `token_id`** | `token_id` is `u256`; can't hold 1,444 bits | `Poseidon(canonical state)` (§5.2) |
| **Canonical ordering key** (`u256 <`) | no native order on multi-word | Lexicographic over words (§5.3) |

The **16×16 grid (256 bits) is the absolute ceiling of the single-`u256` model** — so any grid
worth the name requires leaving it. (15×15 = 225 bits; 16×16 = 256 bits exactly; 17×17 = 289
overflows.) v2 is the first design that abandons the single-word assumption.

---

## 4. State representation

### 4.1 Two views of one state

- **Storage view — dense felt packing.** The 1,444 cells are packed big-endian into **6
  `felt252`** slots (≈251 usable bits each; 1,506-bit capacity, 1,444 used, 62 spare). This is
  what is written to contract storage and hashed for the `token_id`. 6 slots/write — identical
  storage footprint to a 36×36 grid, but more grid.
- **Compute view — row-per-word bitboard.** For stepping, the state is unpacked into **38 row
  masks**, one per grid row, each a 38-bit integer (held in a `u64` during compute — 38 bits +
  shift headroom fits comfortably). A generation is computed with bitwise ops across adjacent
  rows (§4.3), not cell-by-cell.

`unpack_storage → [u64; 38]` at the start of a move; compute; `pack → [felt252; 6]` at the end.
The pack/unpack is O(n) and cheap relative to stepping.

> **Word-count note.** "6 words" is a *storage* metric (felt slots). 38×38 is the max square
> that fits in 6 felts; 39×39 spills to a 7th felt; 40×40 needs 7. If we ever prefer counting in
> `u256` words, 39×39 fits in 6×`u256` — but that is 12 storage slots vs 6 felts, so 38×38 is the
> cost-optimal "6 words" choice.

### 4.2 Bit ordering convention

Define a single canonical bit order and use it everywhere (storage packing, hashing, SDK,
frontend). Proposed: **row-major, row 0 = top, bit 0 = leftmost cell of row 0**, packed
big-endian into felts `w0..w5` (w0 holds the most-significant cells). The lexicographic order
(§5.3) is then exactly "compare `w0`, then `w1`, …", the faithful generalization of `u256 <`.
*This convention is the single source of truth — the SDK and on-chain SVG renderer must match it
byte-for-byte.*

### 4.3 Stepping algorithm (bitwise Game of Life)

The classic word-parallel GoL trick, adapted to a torus. For each row `r` we have the row mask
`R`, the row above `U = rows[(r-1) mod 38]`, the row below `D = rows[(r+1) mod 38]`. Horizontal
neighbours come from bit-rotations of each row (torus wrap = rotate within 38 bits, **not** a
plain shift):

```
rotl(x) = ((x << 1) | (x >> 37)) & MASK38
rotr(x) = ((x >> 1) | ((x & 1) << 37)) & MASK38
```

For each of the three rows, the three contributions (left, center, right) are summed with a
bitwise half/full-adder to get a per-cell neighbour count (0–8) encoded across a few bit-planes,
then the B3/S23 rule is applied with bitwise logic. Result: a new 38-bit row mask.

- **Cost:** O(n) word operations per generation (38 rows × a constant number of bitwise ops),
  versus v1's O(n²) cell iterations with array indexing and per-cell branching. This is the main
  lever against the larger grid's cost (§6) — see §10 for the validation requirement against a
  reference oracle.
- **Topology:** toroidal, identical wrap semantics to v1 (`% grid_size`), now via bit-rotation
  horizontally and modular row index vertically.

---

## 5. Identity & canonicalization

### 5.1 What "same creature" means in v2

**Time-cycle equivalence only.** Two grids are the same creature iff they belong to the same
loop (one is reachable from the other by stepping). The loop's identity is its
**lexicographically smallest state**. This is exactly v1's semantics, lifted to multi-word states.

Consequence — accepted deliberately: on a 38×38 torus the *same shape* placed at a different
position (one of 1,444 translations, ×8 with rotation/reflection) is a **distinct token**. We are
not quotienting by spatial symmetry in v2 (see §6.3 for why, and the deferred extension).

### 5.2 Token id

```
canonical_state : [felt252; 6]   // the lexicographically smallest state in the loop
token_id        : u256 = Poseidon(canonical_state)   // span hash of the 6 words
```

- Poseidon is the STARK-native hash — cheap on-chain, computed **once** on the final canonical
  state (never per step).
- `token_id` doubles as the **uniqueness key**: minting checks `!_exists(token_id)`, so the same
  loop can never be minted twice. No separate dedup map needed.
- The full 6-word `canonical_state` is stored in `LifeFormData` (the `token_id` hash is not
  reversible).

### 5.3 Canonical ordering (replaces `u256 <`)

Lexicographic over the packed words, most-significant first:

```
fn lt(a: [felt252;6], b: [felt252;6]) -> bool {
    // compare w0, then w1, … ; short-circuit on first differing word
}
```

- Faithful to v1 (`u256 <` is exactly this for a single word).
- **Short-circuits** on the top word → ~1–2 felt comparisons in the common case.
- Found *during* the loop-verification pass (the same pass that proves the cycle), so its marginal
  cost is one comparison per step already being taken — negligible (§6.2).

---

## 6. Cost analysis

### 6.1 The principle: stepping dominates, comparison rides along

Minting a loop already requires iterating it to **prove it is a valid cycle** — `loop_length`
calls to the stepping function, O(loop_length × work-per-step). Finding the canonical (smallest)
element happens *inside that same pass*, costing one comparison per step already taken. So the
**ordering rule is essentially free**, regardless of which rule we pick. The real cost is stepping.

### 6.2 Per-generation & per-transaction budget

Reference: v1 optimized stepping ≈ **3.39M L2 gas/generation** at 15×15 (225 cells), giving a
**321-generation** ceiling under the 1.2e9 gas-per-tx cap (measured on-chain).

> **Spike results (2026-06-19, `spike/v2_stepper/`).** Standalone Cairo 2.18 implementation of
> the §4.3 bitboard stepper, validated for correctness against a cell-by-cell oracle (12
> generations on a busy grid + blinker/block/empty), gas measured under snforge via linear
> regression (cost of N generations differenced across N = 1 / 101 / 201; per-gen cost constant to
> within ~230 gas/100 gens):
>
> | Stepper @ 38×38 | L2 gas / generation | Gens per tx (1.2e9, pure compute) |
> |---|---|---|
> | Naive cell-by-cell | ~628M | ~2 |
> | **Bitboard (§4.3)** | **~2.52M** | **~476** |
>
> **The bitboard is ~250× cheaper than naive, and ~26% cheaper per generation than v1's 15×15
> cell-by-cell stepper — despite 6.4× the cells.** The O(n) word-parallel algorithm more than
> compensates for the larger grid; per-tx throughput goes *up* vs v1, not down. The earlier
> estimates in this section (naive ≈22M, bitboard "~100 gens/tx") were both wrong — the real
> algorithm gap is far larger. **The algorithm choice, not the grid size, is the cost driver.**
>
> Caveats: snforge `l2_gas` is a *compute* estimate. Real on-chain cost adds per-tx overhead
> (6-felt calldata, one storage write, account validation, events) and the v1 benchmark found
> actual gas ≈1.7× the SKIP_VALIDATE `estimateFee`. So treat ~476 as optimistic; even halved
> (~240) it is in the same ballpark as v1's 321 and comfortably usable. The spike
> measured the *step* only; storage felt↔bitboard pack/unpack and Poseidon canonicalization are
> O(n) one-time per tx, negligible against hundreds of steps. **Confirm with an on-chain
> `estimateFee` / receipt before finalizing** (same methodology as the v1 benchmark).

Either way, **per-tx generation count is healthy** — and long loops are handled by chaining:

### 6.3 Why spatial canonicalization is deferred (not chosen)

Translation invariance requires finding the minimum over **all n² shifts** of a state; each shift
is ~one grid-pass. So spatially canonicalizing **one** state ≈ n² step-equivalents. At 38×38,
n² = 1,444, so a single state's translation-min ≈ ~1,400 generations of work — **well past the
1.2e9 per-tx cap by roughly an order of magnitude, for one state**, before considering loop length
or the ×8 rotation/reflection group. It is **structurally off-chain**, not a tuning problem.

The only viable path to spatial identity is **off-chain compute + on-chain STARK verification**
(the SNIP-36 tooling already in the repo). That is a substantial addition and is therefore a
**post-v2 extension**, not part of this spec.

### 6.4 Long loops: partial-path chaining (unchanged from v1)

The existing `mint_partial_path` / `combine_partial_path` mechanism splits a long loop's
verification across multiple transactions. The per-tx generation budget is a **chunk size**, not a
hard cap on loop length. v2 carries this mechanism over unchanged; only the per-chunk size shrinks
with the bigger grid.

---

## 7. Contract & API changes

### 7.1 `interfaces.cairo`

- `LifeFormData.current_state: u256` → **`[felt252; 6]`** (or a named `GridState` struct wrapping
  it). `Store`, `Serde`, `Copy`, `Drop` derived.
- `PartialPathData.{entrypoint, exitpoint, trigger_state, smallest_element}: u256` → `[felt252; 6]`.
- `IGolUtilities` signatures: every `u256` state param/return → `GridState`. `unpack_grid_from_uint`
  / `pack_grid_in_uint` replaced by storage-felt ↔ bitboard (`[u64; 38]`) pack/unpack.
- New: `fn token_id_of(state: GridState) -> u256` (Poseidon), `fn lt(a, b: GridState) -> bool`.

### 7.2 `gol_utilities.cairo`

- `grid_size: 15 → 38` const; add `WORDS = 6`, `ROW_BITS = 38`, `MASK38` consts.
- Reimplement `iterate_life_once` as the bitwise stepper (§4.3).
- Reimplement min-tracking in `iterate_life_several_times_enhanced` with `lt` over `GridState`.
- Add storage-felt ↔ row-mask pack/unpack.

### 7.3 `gol_lifeforms.cairo`

- `token_id` is now `Poseidon(canonical_state)`, not the raw state. Mint asserts `!_exists`.
- `lifeform_data` map keyed by `token_id`; stores full `GridState`.
- `move_lifeform_forward` unchanged in spirit (1 generation, mints 1 NUT) — uses the new stepper.

### 7.4 Minters (`gol_loop_minter.cairo`, `gol_path_minter.cairo`)

- All `u256` loop/path ids → `GridState`; `token_id` derived via Poseidon at mint.
- "Smallest element" checks use `lt`. Logic otherwise unchanged.

### 7.5 SDK (`crates/gol-sdk`, `crates/gol-sdk-wasm`)

- Already reads `get_grid_size()` dynamically — good. But the `U256` state type (`types.rs`) →
  a 6-word `GridState` type; calldata encoding, event decoding, and grid bit-unpacking updated to
  the §4.2 convention. `token_id` decoding stays `u256` (it's the hash).

### 7.6 Frontend / token_uri / SVG

- Grid unpack loop already size-driven; extend to 38×38 and the new state encoding.
- On-chain `token_uri` SVG renderer (if/when added) must use the exact §4.2 bit order.

---

## 8. Storage layout

- `LifeFormData`: 6 felts for state + the small flags/counters (`is_loop`, `age`, etc.). ≈ 6–8
  storage slots per token.
- Partial-path registry entries grow from 5×`u256` to 5×6 felts each — note the higher write cost
  for `mint_partial_path` / `combine_partial_path`.
- Fresh deployment → no storage-migration hazard.

---

## 9. Security & correctness considerations

- **Bit-order convention is consensus-critical.** Storage packing, Poseidon input, SDK, and SVG
  must agree exactly, or `token_id`s diverge between client and chain. Single source of truth, with
  a round-trip test.
- **Canonicalization soundness.** A token must be mintable from exactly one canonical form;
  `lt` must be a strict total order and the min-search must cover the full cycle (port v1's
  `is_single_loop_*` assertions carefully).
- **Bitwise stepper must be proven equivalent** to a reference cell-by-cell implementation (§10) —
  the optimization is the highest-risk new code.
- **Torus wrap via rotation** is the easiest place for an off-by-one (37 vs 38). Cover all four
  edges + corners in tests.
- Independent **security audit before mainnet** (carried over from the v1 plan); treat any
  gas/economic claims here as estimates to be re-measured, not guarantees.

---

## 10. Testing & validation

- **Round-trip:** `pack(unpack(s)) == s` for storage↔bitboard and storage↔felts; fuzzed.
- **Stepper oracle:** the bitwise `iterate_life_once` must match a straightforward cell-by-cell
  reference on (a) known patterns (block, blinker, glider, pulsar, LWSS), (b) random grids, fuzzed
  to many generations.
- **Torus correctness:** patterns crossing each edge and corner evolve identically to the oracle.
- **Canonicalization:** every phase of a loop maps to the same `token_id`; distinct loops →
  distinct ids; minting the same loop twice reverts.
- **Benchmark:** re-measure gas/generation at 38×38 for both naive and bitwise steppers; confirm
  per-tx generation ceiling and partial-path chunking. Update the benchmark memory.

---

## 11. Open questions

1. **Row word type** — `u64` (tight, 38+ bits) vs `u128` (more shift headroom, simpler overflow
   reasoning). Decide during implementation/benchmarking.
2. **NUT pricing** — v1 charges `sequence_length × 1 NUT` to mint and faucets 1 NUT per move. With
   bigger grids and different loop-length distributions, does pricing need recalibration? (Economy
   decision — the free-faucet design is intentional and stays.)
3. **On-chain SVG** — ship a real `token_uri` renderer in v2, or keep it SDK-side? Affects whether
   the bit-order convention must live on-chain.
4. **Exact size sign-off** — 38×38 (6 felts, cost-optimal) vs 39×39 (6×`u256`, +1 row, 2× storage
   slots). Spec assumes 38×38.
5. **Spatial-identity extension** — if/when desired, scope the off-chain-prove + on-chain-verify
   design (§6.3) as a follow-up.

---

## 12. Appendix — key numbers

| Quantity | v1 | v2 |
|---|---|---|
| Grid | 15×15 (225 cells) | 41×41 (1,681 cells) |
| Topology | toroidal | toroidal |
| State | 1 × `u256` (256 bits) | 7 × `felt252` (storage, row-aligned) / 41 × row-mask (compute) |
| Single-`u256` ceiling | — | 16×16 (256 bits) is the max for the v1 model |
| Gun threshold (Gosper 36×9) | not reachable | cleared (41 ≥ 36, +5 col margin) |
| Token id | = state (`u256`) | `Poseidon(canonical state)` |
| Ordering key | `u256 <` | lexicographic over 6 words |
| Gas/gen (bitboard) | ≈3.39M @ 15×15 (on-chain) | **≈2.64M @ 41×41** (P5 snforge; O(n) rows, not O(n²) — barely above 38×38's 2.52M) |
| Max gens/tx | 321 | **≈450 pure compute** (1.2e9 ÷ 2.64M); chunked via partial paths for longer |
