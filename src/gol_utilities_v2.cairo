//! v2 loop/path utilities — the canonicalization-bearing logic from v1's `GolUtilities`, ported
//! onto the bitboard representation. Operates on `Array<u64>` rows for iteration and the
//! `Store`-able `GridState` at the storage boundary, using the grid core (`step`, `lt`,
//! `token_hash`) from `gol_grid_v2`. See `docs/v2-grid-redesign.md` §5, §7.
//!
//! Equivalence is TIME-CYCLE ONLY: the canonical representative of a loop is its lexicographically
//! smallest state (`lt`); spatial (translation/rotation) invariance is out of scope.

use gol_starknet::gol_grid_v2::{GridState, step, lt, eq, token_hash, grid_hash, pack, unpack};

/// A partial path segment of `length` states. Storage shape (see Phase-2 decision in
/// docs/v2-grid-redesign.md):
///   * `exitpoint`, `smallest` are FULL `GridState`s — `exitpoint` gets stepped to close a loop,
///     and `smallest` must be `lt`-compared when combining segments.
///   * `entrypoint_id`, `trigger_id` are Poseidon hashes — used only for identity/equality.
/// ~17 storage felts, vs ~29 if all four state fields were full `GridState`s.
#[derive(Drop, Copy, Serde, PartialEq, starknet::Store)]
pub struct PartialPathData {
    pub entrypoint_id: felt252,
    pub exitpoint: GridState,
    pub length: usize,
    pub trigger_id: felt252,
    pub smallest: GridState,
}

/// Owned copy of a rows snapshot.
pub fn clone_rows(a: @Array<u64>) -> Array<u64> {
    let mut out: Array<u64> = ArrayTrait::new();
    let mut i: usize = 0;
    while i < a.len() {
        out.append(*a[i]);
        i += 1;
    };
    out
}

/// Step `gens` times from `initial`, tracking the lexicographically smallest state seen (including
/// `initial`) and whether a stepped state equals `trigger`. Also captures the state at index
/// `capture_at` of the walk (0 = `initial`) — the loop minter's orbit-witness phase, taken for
/// free from the walk instead of re-stepping afterwards. Returns
/// `(triggered, smallest, final, captured)`. No intermediate sequence is materialised.
fn run(
    initial: @Array<u64>, trigger: @Array<u64>, gens: usize, capture_at: usize,
) -> (bool, Array<u64>, Array<u64>, Array<u64>) {
    let mut current = clone_rows(initial);
    let mut smallest = clone_rows(initial);
    let mut captured = clone_rows(initial);
    let mut triggered = false;
    let mut g: usize = 0;
    while g != gens {
        current = step(@current);
        if eq(@current, trigger) {
            triggered = true;
        }
        if lt(@current, @smallest) {
            smallest = clone_rows(@current);
        }
        if g + 1 == capture_at {
            captured = clone_rows(@current);
        }
        g += 1;
    };
    (triggered, smallest, current, captured)
}

/// Compute a `generations`-state partial path from `initial`, asserting `trigger` is not reached.
pub fn compute_partial_path(
    initial: @Array<u64>, trigger: @Array<u64>, generations: usize,
) -> PartialPathData {
    assert(generations > 0, 'No path smaller than 1');
    // A segment of `generations` states spans indices 0..generations-1 -> step generations-1 times.
    let (triggered, smallest, exitpoint, _) = run(initial, trigger, generations - 1, 0);
    assert(!triggered, 'Triggered state reached');
    PartialPathData {
        entrypoint_id: token_hash(initial),
        exitpoint: pack(@exitpoint),
        length: generations,
        trigger_id: token_hash(trigger),
        smallest: pack(@smallest),
    }
}

/// Combine two adjacent segments (p1's exit must be p2's entry, same trigger).
pub fn combine_partial_path(p1: PartialPathData, p2: PartialPathData) -> PartialPathData {
    assert(p1.length > 0, 'No path smaller than 1');
    assert(p2.length > 0, 'No path smaller than 1');
    assert(grid_hash(@p1.exitpoint) == p2.entrypoint_id, 'Not combinable');
    assert(p1.trigger_id == p2.trigger_id, 'Different trigger state');
    // smaller of the two segment minima (lt on the full states)
    let smallest = if lt(@unpack(@p2.smallest), @unpack(@p1.smallest)) {
        p2.smallest
    } else {
        p1.smallest
    };
    PartialPathData {
        entrypoint_id: p1.entrypoint_id,
        exitpoint: p2.exitpoint,
        length: p1.length + p2.length - 1,
        trigger_id: p1.trigger_id,
        smallest,
    }
}

/// Verify `initial` begins a single loop of exactly `generations` states. Panics if it isn't
/// (returns to `initial` early, or fails to close). Returns
/// `(true, smallest_state_in_loop, second_to_last_state, captured)` — the third is the loop's
/// predecessor of `initial` (needed by the path minter to check a path enters the loop from
/// outside); the fourth is `step^capture_at(initial)` (0 = `initial`), taken from the walk for
/// free — the loop minter's orbit-witness phase.
pub fn is_single_loop(
    initial: @Array<u64>, generations: usize, capture_at: usize,
) -> (bool, Array<u64>, Array<u64>, Array<u64>) {
    assert(generations > 0, 'No loop is smaller than 1');
    assert(capture_at < generations, 'capture out of range');
    // trigger = initial: hitting it before the last step means a shorter loop -> reject.
    let (triggered, smallest, second_to_last, captured) = run(
        initial, initial, generations - 1, capture_at,
    );
    assert(!triggered, 'triggered in ISLFIS');
    let last = step(@second_to_last);
    assert(eq(@last, initial), 'no loop in ISLFIS');
    (true, smallest, second_to_last, captured)
}

/// True iff `initial` is a single loop of `generations` AND is that loop's canonical (smallest)
/// state. Panics (via `is_single_loop`) if `initial` is not a clean loop of that length.
pub fn is_single_loop_and_entrypoint_is_smallest(
    initial: @Array<u64>, generations: usize,
) -> bool {
    let (is_loop, smallest, _, _) = is_single_loop(initial, generations, 0);
    is_loop && eq(@smallest, initial)
}

/// Step `n` times from `initial` (`n >= 1`); return `(state after n-1 steps, state after n steps)`.
/// The path minter uses this to get the loop entrypoint and the path's predecessor of it.
pub fn step_to(initial: @Array<u64>, n: usize) -> (Array<u64>, Array<u64>) {
    assert(n > 0, 'step_to needs n>=1');
    let mut prev = clone_rows(initial);
    let mut i: usize = 0;
    while i < n - 1 {
        prev = step(@prev);
        i += 1;
    };
    let last = step(@prev);
    (prev, last)
}

#[cfg(test)]
mod tests {
    use gol_starknet::gol_grid_v2::{grid_with, unpack, eq, grid_hash, token_hash};
    use super::{compute_partial_path, combine_partial_path, is_single_loop,
        is_single_loop_and_entrypoint_is_smallest};

    // Blinker phase A (horizontal, row 5 cols 1..3) and phase B (vertical, col 2 rows 4..6).
    fn blinker_a() -> Array<u64> {
        grid_with(@array![(5_usize, 0b1110_u64)])
    }
    fn blinker_b() -> Array<u64> {
        grid_with(@array![(4_usize, 0b0100_u64), (5_usize, 0b0100_u64), (6_usize, 0b0100_u64)])
    }
    // An unrelated state to use as a never-hit trigger.
    fn other() -> Array<u64> {
        grid_with(@array![(20_usize, 0b1010101_u64)])
    }

    #[test]
    fn single_loop_blinker() {
        // A is period-2; A is lexicographically smaller than B (differ first at row 4: 0 < 4).
        let (is_loop, smallest, _, captured) = is_single_loop(@blinker_a(), 2, 1);
        assert(is_loop, 'A is a loop');
        assert(eq(@smallest, @blinker_a()), 'A is the smallest');
        // capture_at = 1: the walk hands back step^1(A) = B for free
        assert(eq(@captured, @blinker_b()), 'captured = B');
    }

    #[test]
    fn entrypoint_is_smallest_only_for_a() {
        assert(is_single_loop_and_entrypoint_is_smallest(@blinker_a(), 2), 'A is canonical');
        // B is the same loop but not its smallest state.
        assert(!is_single_loop_and_entrypoint_is_smallest(@blinker_b(), 2), 'B not canonical');
    }

    #[test]
    fn still_life_is_a_loop_of_one() {
        let block = grid_with(@array![(10_usize, 0b110_u64), (11_usize, 0b110_u64)]);
        let (is_loop, smallest, _, captured) = is_single_loop(@block, 1, 0);
        assert(is_loop, 'block is still');
        assert(eq(@smallest, @block), 'block smallest is self');
        assert(eq(@captured, @block), 'capture 0 = self');
    }

    #[test]
    fn compute_then_check_fields() {
        // 3 states from A: A -> B -> A. exitpoint after 2 steps = A; smallest = A.
        let p = compute_partial_path(@blinker_a(), @other(), 3);
        assert(p.length == 3, 'length 3');
        assert(p.entrypoint_id == token_hash(@blinker_a()), 'entry id');
        assert(p.trigger_id == token_hash(@other()), 'trigger id');
        assert(eq(@unpack(@p.exitpoint), @blinker_a()), 'exit = A');
        assert(eq(@unpack(@p.smallest), @blinker_a()), 'smallest = A');
    }

    #[test]
    fn combine_two_segments() {
        // p1: A -> B (len 2, exit B, smallest A);  p2: B -> A (len 2, exit A, smallest A)
        let p1 = compute_partial_path(@blinker_a(), @other(), 2);
        let p2 = compute_partial_path(@blinker_b(), @other(), 2);
        // sanity: p1's exit (B) must match p2's entry id
        assert(grid_hash(@p1.exitpoint) == p2.entrypoint_id, 'adjacent');
        let c = combine_partial_path(p1, p2);
        assert(c.length == 3, 'combined len 2+2-1');
        assert(c.entrypoint_id == token_hash(@blinker_a()), 'entry = A');
        assert(eq(@unpack(@c.exitpoint), @blinker_a()), 'exit = A');
        assert(eq(@unpack(@c.smallest), @blinker_a()), 'smallest = A');
    }

    #[test]
    #[should_panic(expected: 'triggered in ISLFIS')]
    fn wrong_loop_length_panics() {
        // A is period 2: asking for length 3 re-hits A at step 2 (the initial trigger) -> reject.
        is_single_loop(@blinker_a(), 3, 0);
    }

    #[test]
    #[should_panic(expected: 'capture out of range')]
    fn capture_beyond_walk_panics() {
        is_single_loop(@blinker_a(), 2, 2);
    }
}
