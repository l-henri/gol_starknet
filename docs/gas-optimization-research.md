# Gas optimization research — where the gas goes and how to cut it

> **Research session 2026-08-03.** Profiled with `cairo-profiler` v0.17.0 over `snforge`
> traces (sierra-gas sample). Measured facts are marked **[measured]**, projections
> **[estimate]**.
>
> **IMPLEMENTED same day** on branch `perf/stepper-gas` (see the results section at the
> bottom): Tier 1, Tier 3.1/3.3/3.4, and the practical core of Tier 2. **Measured:
> 2.64M → 1.15M sierra gas/generation (−56.5%)**, plus the mint walk halved worst-case.
> Tier 3.2 (apply_d4) was assessed and deliberately dropped. NOT deployed — the mainnet/
> Sepolia classes still run the old code; migration is a separate decision.

## TL;DR

The stepper's cost is **65% bitwise-builtin invocations**, and the current `step_row` does
~2× more of them than it needs to. A contained rewrite of `step`/`step_row` (no ABI change,
bit-identical output) is estimated to cut per-generation cost by **~40%** (2.64M → ~1.6M
sierra gas). A further lane-packing rewrite (3 rows per `u128` bitwise op) could roughly
halve it again. Independent of the stepper, the v3 mint flow has three cheap fixes
(a `pow2` hoist, an `apply_d4` rewrite, early-exit compares) and one ABI-level fix
(witness anchored at the drawn state) that together remove most of the *fixed* mint
overhead and up to half of the *walk* cost.

## Baseline anatomy [measured]

### The stepper (`gol_grid_v2::step`) — 2.64M sierra gas per generation

`bench_step_101` − `bench_step_1` / 100 = **2,641,036 sierra gas/gen** at 41×41
(re-confirmed this session; matches the 2026-06-22 measurement). Per-gen cost is
**pattern-independent** — the bitboard does fixed work regardless of how many cells live.
(The "2.7M–14M pattern-dependent" range in `partial-paths-mint-ux.md` §1 was later
root-caused as the **sender account class metering multiplier**, not the pattern — see
`sierra-gas-metering-discrepancy.md`.)

Libfunc breakdown of the stepper benchmark (263.4M total, 101 gens + setup):

| libfunc | share | what it is |
|---|---|---|
| `u64_bitwise` | **65.3%** | 53 bitwise ops/row × 41 rows = 2,173 ops/gen at 783 gas each |
| `store_temp` | 16.6% | value shuffling; scales with op count |
| `u64_safe_divmod` | 6.6% | 6 divisions/row (the `rotl`/`rotr` shifts) = 246/gen |
| `downcast` | 2.8% | `try_into` in unpack paths |
| `array_get` | 2.4% | row reads (3 per output row + wrap branches) |
| `withdraw_gas`/`redeposit_gas` | 2.7% | per-iteration loop gas accounting |

The 53 bitwise ops/row: 15 in the six rotations, 26 in the neighbour-count adder network,
12 in the birth/survival decision logic.

### The v1 legacy stepper — 3.36M/gen

The `bench_in_place_*` tests exercise v1's 15×15 `iterate_life_several_in_place`:
exactly **3,361,365 gas/gen** marginal (perfectly linear across 200/250/270-gen runs).
The v2 41×41 bitboard is already cheaper than v1's 15×15 — nothing to do here, v1 is
legacy.

### A mint (`mint_loop`, period-2 blinker) — 11.2M [measured]

From the `loop_mint_preserves_drawn…` integration test profile:

| leg | cost | notes |
|---|---|---|
| `run` (cycle walk) | ~2.9M/gen walked | step (2.64M) + `eq` + `lt` full scans ≈ 245k/gen |
| `verify_canonical` | 2.2M | dominated by `apply_symmetry` |
| — `translate` | ~1.3M | **~1.6M of `pow2_128` waste when `dc > 0`** (see Tier 3) |
| — `apply_d4` (d4 ≠ 0) | ~2.8M/call | O(N²) per-cell loop, one u64 division per cell |
| NFT `mint` leg | 1.75M | ERC-721 + ~30 storage writes + Poseidon + ERC-20 escrow pull |

So a short-period mint is mostly *fixed* overhead; a long-period mint is mostly the walk
(`period − 1 + k` steps, k < period — i.e. **up to ~2× the period** in steps today).

## Optimization tiers

### Tier 1 — rewrite `step_row`'s bitwise plumbing (est. −40%/gen, no ABI change)

Three compounding changes inside `gol_grid_v2` only; output is bit-identical (same ids,
same consensus), guarded by the existing bitboard-vs-naive-oracle tests and benches.

1. **Rotations via one divmod** — `rotl` is `((x*2) | (x/TOPBIT)) & MASK` (2 bitwise);
   with `(q, r) = divrem(x, TOPBIT)` it becomes `(r*2) | q` (1 bitwise, mask provably
   unnecessary, results disjoint). Same for `rotr` via `divrem(x, 2)`: 3 bitwise → 1.
2. **Share horizontal sums across rows** — today every output row rotates and sums its
   three input rows from scratch, so each input row is rotated/summed three times. Instead
   precompute per input row, once: `l = rotl(m)`, `r = rotr(m)`, the 3-cell sum
   `t, tc = fa(l, m, r)` and the 2-cell sum `p, pc = ha(l, r)`. Output row *i* then
   combines `t[i−1], p[i], t[i+1]` (+ carries). Per-row bitwise drops **53 → 29**,
   divisions **6 → 2**.
3. **Cheaper decision logic** — `alive = (ones | m) & twos & ~fours & ~eights`
   (6 ops) replaces the eq3/eq2 construction (12 ops). Equivalent: count==3 has
   `ones ∧ twos`; count==2 has `twos` alone and needs `m`.

**[estimate]** bitwise 1.70M → 0.93M, divmod 172k → 57k, proportional `store_temp` cut →
**~1.55–1.65M/gen (−~40%)**. Effort: a day incl. re-profiling. Risk: low (pure function,
oracle-tested, no storage/ABI impact).

Deployment note: `step` is compiled *into* each contract. Shipping this means a class
upgrade of LifeformsV3 (feeds) and **redeploying the minters** (they have no upgrade hook)
+ MINTER_ROLE re-grant — the same motions as the 2026-07-06 Sepolia upgrades.

### Tier 2 — 3-rows-per-word SIMD lanes (est. a further ~2×; spike first)

The VM's bitwise builtin costs the same for `u64` as for `u128`, so we currently use 41
bits of a 128-bit operation. Pack **3 rows into one `u128` at a 42-bit stride** (41-bit
row + 1 guard bit) and the whole adder network processes 3 rows per invocation; 41 rows =
14 words. Rotations work lane-parallel with a repeated-mask constant and a
top-bits-extract divide; vertical neighbours need lane-shift stitching between adjacent
words (mul/div by 2^42/2^84 + OR).

**[estimate]** on top of Tier 1: bitwise ~1,190 → ~450–700 ops/gen, 41-iteration loops →
14 → **~0.9–1.1M/gen total** (~2.5× under today's baseline). Effort: significant; the
lane stitching and the 41 = 3×13+2 remainder are fiddly. Do it like the original v2
work: **prove it in `spike/` against the oracle before touching `src/`**.

### Tier 3 — mint-flow fixes (cheap, immediate)

1. **Hoist `pow2_128(dc)` out of the row loop in `translate`** (`gol_grid_v2.cairo:305` —
   `rot_row_by` recomputes 2^dc by a multiply loop *for every row*). ~1.6M saved per
   translated witness mint / `prove_malformed`. Three lines.
2. **Row-wise `apply_d4`** — replace the O(N²) per-cell copy (1,681 iterations, each with
   an array-indexed u64 division) with word-level bit tricks: vertical flip = row
   reversal (free), horizontal flip = per-row 41-bit reversal (~15 masked-swap ops/row),
   rotations/transposes = 64×64 block bit-transpose (Hacker's Delight) on the padded
   board. ~2.8M → ~0.3M per non-identity witness. **Every v3 mint whose orbit-canonical
   needs a d4 ≠ 0 pays this today.** Medium effort; pure function, easy to oracle-test
   against the current implementation.
3. **Early-exit `eq` / `lt`** — both scan all 41 rows even after the answer is decided,
   and `run()` calls both **every generation** of every walk (~245k/gen ≈ 9% of walk
   cost). Break on the first decisive row. Trivial, behavior-identical.
4. **Anchor the loop-mint witness at the drawn state (ABI + SDK change).** Today
   `mint_loop` walks `period − 1` steps, then `verify_canonical` walks **k more** from the
   time-lex-min (k < period): worst case ~2× the period. Any verified cycle member is an
   equally sound anchor, so let k be relative to the *drawn* state and capture
   `step^k(drawn)` **during the walk already being done** — zero extra steps, halving
   worst-case mint gas. The SDK computes `k' = (pos(time_min) + k) mod period`. This is
   a consensus-relevant witness-format change: needs a dated note in
   `v3-identity-spec.md` and SDK write-builder updates. (The wanderer minter already
   anchors at the start — only the loop minter has this.)

### Tier 4 — storage micro-wins (minor)

`advance()` rewrites the whole `LifeFormData` (13 slots) though only `current_state`
(7) + `age` change; reads all 13 too. Writing just the changed members through storage
sub-paths saves ~5 writes + 5 reads per feed (~100–200k, noticeable only for 1-gen pet
feeds). Same storage layout, upgrade-safe. **Do not** re-pack `LifeFormData`'s bools into
one felt — that changes the layout under live mainnet tokens.

## What this buys (worked example) [estimate]

Glider, period 164, measured 2.29B (≈14M/gen, legacy-metered account):

| | legacy-class account (×5.2) | modern account |
|---|---|---|
| today | 2.29B (fails the 1.2B wallet cap) | ~440M |
| Tier 1 + Tier 3 (anchor) | ~700M — **single-tx mintable** | ~135M |
| + Tier 2 | ~450M | ~90M |

Feed caps scale the same way: the 82-gen `FEED_CAP` is sized for 14M/gen legacy; after
Tier 1 the same 1.2B budget covers ~215 legacy gens / ~750 modern gens per tx.

## Deliberately out of scope

- **`token_uri` (~101M)** — a view; costs nothing on-chain in normal use.
- **SNIP-36 / proof-based minting** — the architectural endgame (constant-cost mint for
  any period, see `gol-snip36-benchmark` history), deliberately sequenced after
  accessibility; none of the above conflicts with it — the stepper gets cheaper to prove
  too.
- **Economy note:** feeds mint n NUT for n generations, so cheaper gens raise NUT per gas
  burned ~2.6×. NUT is proof-of-participation (the faucet is intentional), so this is
  fine by design — but flag it when tuning anything that prices in NUT.

## How to reproduce the profiles

```bash
# one-time: cairo-profiler is installed at ~/.local/bin (v0.17.0)
# temporarily add to Scarb.toml:  [profile.dev.cairo] unstable-add-statements-functions-debug-info = true
snforge test bench_step_101 --ignored --save-trace-data
cairo-profiler build-profile snfoundry_trace/<trace>.json --show-libfuncs -o profile.pb.gz
cairo-profiler view profile.pb.gz --sample "sierra gas" --limit 30
# revert the Scarb.toml flag; delete snfoundry_trace/ (regenerable, 50MB+)
```

Discipline for the implementation sessions (per the cairo-optimization skill): tests green
before and after every change, one optimization class per commit, re-profile after each,
and a cairo-auditor pass before merge.

## Implementation results (2026-08-03, branch `perf/stepper-gas`) [measured]

One commit per optimization class; full suite (95 tests) green after each; benched via
`(bench_step_101 − bench_step_1)/100`.

| change | per-gen sierra gas | Δ |
|---|---|---|
| baseline (mainnet code) | 2,641,036 | — |
| Tier 1: shared horizontal sums + divmod rots + 6-op decision | 1,644,715 | −37.7% |
| Tier 2 core: pass 2 lane-packed, 3 rows per u128 word | **1,148,843** | **−56.5% total** |

Plus, per mint: the `pow2_128` hoist (−~1.6M per translated witness), early-exit `eq`/`lt`
(−~245k per walked gen), and the witness anchored at the drawn state — the walk is now the
only stepping (`period−1` steps, was `period−1+k`, worst ~2× the period). Worked example,
glider (period 164, worst-case k): walk ~861M → ~187M on a modern account (−78%); on a
legacy-metered account (×5.2) ~975M — **now under the 1.2B wallet cap single-shot**.

Deviations from the plan above:

- **Tier 3.2 (row-wise `apply_d4`) dropped.** Without native shifts a butterfly transpose
  is ~4 bitwise + mul + div per pair-swap; measured against the ~2.8M once-per-mint cost
  the realistic gain is ~2.5×, not the ~10× estimated above — not worth the consensus
  surface. The `d4_source` branch-hoist micro remains available if small-period mint
  fixed costs ever matter.
- **Tier 2 lane words must be composed in felt252.** Composing with u128 muls costs
  ~451k/gen in `u128_mul_guarantee_verify` and made the laned pass a net REGRESSION
  (2.00M/gen) before switching `pack3` to felt mul/add + one range-checked downcast.
  u128 `bitwise` itself costs exactly what u64 does (783/op) — the lane win is real.
- **Anchor change turned out to be spec-alignment, not a spec change** — v3-identity-spec
  §4.2 always said `step^k(drawn)` captured from the walk; the 2026-07-06 implementation
  had deviated. Note added in the spec. **The SDK on this branch produces drawn-relative
  k, so it requires a redeployed loop minter** (old classes revert on k>0 witnesses).

Remaining headroom, in ROI order: lane-pack pass 1 too (~−0.1M/gen more, needs bit-level
lane stitching for the up/down planes); `advance()` sub-field storage writes (Tier 4,
~100–200k per feed tx); `unpack_felt` via u128 instead of u256 math. Then it's SNIP-36
territory. Before any deploy: cairo-auditor pass on the branch + FEED_CAP re-sizing
(legacy worst case drops ~13.9M → ~6.05M/gen → cap 82 → ~190) + SDK/wasm rebuild and the
minter redeploy sequencing (LOG 2026-08-03 (4)).
