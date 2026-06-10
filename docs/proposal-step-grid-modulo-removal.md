# Proposal: remove modulo ops from `step_grid` (trace-size / step-count reduction)

**Status:** ready to implement
**Effort:** ~1–2 h, single function + tests
**Files touched:** `src/gol_utilities.cairo` (one function), `tests/test_grid_utils.cairo` (add tests)

## Why

Proving `prove_move_forward_n` through the local prover (dinner) hits the prover's fixed
trace capacity at **N = 44 generations** (see `docs/dinner-trace-capacity-request.md`).
That capacity cannot be raised — it is pinned by the on-chain verifier. The only way to
prove more generations per transaction is to spend fewer Cairo steps per generation.

The hot loop is `step_grid` in `src/gol_utilities.cairo`. Today it computes **four `%`
operations per cell** (lines 273–276), i.e. 4 × 225 = 900 modulos per generation. In Cairo,
`x % 15` compiles to a full divmod with range checks (~8–12 steps), while a branch like
`if x == 0 { 14 } else { x - 1 }` is ~1–2 steps. Two of the four wraps (`row_above`,
`row_below`) also only depend on `row`, yet are recomputed for every cell — they can be
hoisted out of the column loop entirely. Same for the three outer-array row lookups
(`grid.at(row_above)` etc.), currently done 8× per cell.

Estimated effect: roughly **30–40% fewer steps per generation**, which should move the
provable ceiling from N = 43 to roughly N = 60+. (Estimate from reading the code, not a
measurement — the measurement protocol below confirms the real number.)

## The change

Replace the entire `step_grid` function (currently `src/gol_utilities.cairo:259-301`,
the free function at the bottom of the `GolUtilitiesComponent` module) with the version
below. **Nothing else changes**: same signature, same toroidal Game-of-Life semantics,
same output for every input.

```cairo
    // Pure Game-of-Life step on an unpacked (toroidal) grid. Extracted so the neighbour-count and
    // survival rules live in exactly one place, shared by `iterate_life_once` and
    // `iterate_life_several_in_place`. Reads through a snapshot so callers keep ownership.
    fn step_grid(grid: @Array<Array<bool>>) -> Array<Array<bool>> {
        let mut next_grid: Array<Array<bool>> = ArrayTrait::new();
        let mut row: usize = 0;
        loop {
            if row >= grid_size {
                break;
            }
            // Toroidal wrap as branches instead of `%`: a divmod is ~10 steps, a compare is ~2.
            // The row wraps and the three row snapshots only depend on `row`, so they live here,
            // outside the column loop (15x fewer computations than per-cell).
            let row_above = if row == 0 { grid_size - 1 } else { row - 1 };
            let row_below = if row == grid_size - 1 { 0 } else { row + 1 };
            let above = grid.at(row_above);
            let current = grid.at(row);
            let below = grid.at(row_below);
            let mut single_row: Array<bool> = ArrayTrait::new();
            let mut column: usize = 0;
            loop {
                if column >= grid_size {
                    break;
                }
                let col_left = if column == 0 { grid_size - 1 } else { column - 1 };
                let col_right = if column == grid_size - 1 { 0 } else { column + 1 };
                let mut neighbours_count = 0;
                // 3 cells above
                if *above.at(col_left) { neighbours_count += 1; }
                if *above.at(column) { neighbours_count += 1; }
                if *above.at(col_right) { neighbours_count += 1; }
                // left and right
                if *current.at(col_right) { neighbours_count += 1; }
                if *current.at(col_left) { neighbours_count += 1; }
                // 3 cells below
                if *below.at(col_left) { neighbours_count += 1; }
                if *below.at(column) { neighbours_count += 1; }
                if *below.at(col_right) { neighbours_count += 1; }

                let will_live = if *current.at(column) {
                    neighbours_count == 2 || neighbours_count == 3
                } else {
                    neighbours_count == 3
                };
                single_row.append(will_live);
                column += 1;
            };
            next_grid.append(single_row);
            row += 1;
        };
        next_grid
    }
```

Notes for the implementer:

- `grid.at(i)` on a `@Array<Array<bool>>` returns `@Array<bool>`; binding it to a local
  (`above`, `current`, `below`) and calling `.at()` on that binding is valid Cairo.
- `row - 1` / `column - 1` are only evaluated on the non-zero branch, so `usize`
  underflow cannot occur.
- Do **not** also "optimize" `unpack_grid_from_uint`, `pack_grid_in_uint`, or anything
  else in this file. They are out of scope for this change (separate proposal). Keep the
  diff to `step_grid` plus new tests.
- Do not change `grid_size`, the data layout (`Array<Array<bool>>`), or any public
  interface.

## Tests

Existing tests in `tests/test_grid_utils.cairo` already cover still-lifes, blinker
oscillation, and `iterate_life_several_in_place` vs. looped `iterate_life_once`
equivalence — they must all still pass unchanged.

The bug class this change could introduce is **wrong wrap at the edges** (an off-by-one
in a branch). Add these two tests to `tests/test_grid_utils.cairo`, following the style
of the existing tests there (they use a `grid_with(...)` helper and the component's
dispatcher — reuse the same pattern):

1. **Block across the corner is a still life.** Cells `(14,14)`, `(14,0)`, `(0,14)`,
   `(0,0)` form a 2×2 block on the torus (it spans the corner seam). One
   `iterate_life_once` must return the identical state. This exercises both row wraps
   and both column wraps simultaneously.

2. **Blinker across the top/bottom seam oscillates.** A vertical blinker at cells
   `(14,5)`, `(0,5)`, `(1,5)` must become the horizontal blinker `(0,4)`, `(0,5)`,
   `(0,6)` after one step, and return to the original after two steps.

## Measurement (do this, and report the numbers)

`snforge` prints estimated gas per test, which is a usable proxy for steps. Protocol:

1. **Before** touching `step_grid`, add a temporary benchmark test:
   ```cairo
   #[test]
   fn bench_in_place_20_gens() {
       // any non-trivial start state works; the glider from the existing
       // equivalence test is fine
       let utils = ...; // same setup as the other tests
       let glider = utils.pack_grid_in_uint(grid_with(array![(0, 1), (1, 2), (2, 0), (2, 1), (2, 2)].span()));
       let result = utils.iterate_life_several_in_place(glider, 20);
       assert(result != 0, 'sanity');
   }
   ```
   Run `scarb test -- bench_in_place_20_gens` (or `snforge test bench_in_place_20_gens`)
   and record the reported gas.
2. Apply the `step_grid` replacement.
3. Run the same benchmark again and record the new gas.
4. Report both numbers and the percentage reduction in the PR/commit message. Expected:
   **≥ 25% lower**. If the reduction is under 15%, something is off (most likely the
   wraps or row snapshots were not actually hoisted out of the column loop) — stop and
   say so rather than merging.
5. Keep the benchmark test in the final diff (rename is fine); it's cheap and guards
   against future regressions.

## Acceptance criteria

- [ ] `scarb test` (snforge) fully green, including the two new wrap tests.
- [ ] `step_grid` contains **zero `%` operators**.
- [ ] Row wraps and row snapshots are computed in the row loop, not the column loop.
- [ ] Measured gas reduction on the 20-generation benchmark reported, ≥ 25%.
- [ ] Diff touches only `step_grid` and `tests/test_grid_utils.cairo`.

## Out of scope (future proposals, do not do here)

- Bit-packing the grid into felts instead of `Array<Array<bool>>` (bigger rewrite,
  additional ~5–10%).
- Chunking N generations across multiple proofs to exceed the prover ceiling entirely
  (app/orchestration-level change).
