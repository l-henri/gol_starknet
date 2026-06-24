//! v2 loop/path utilities — a Rust port of `src/gol_utilities_v2.cairo`.
//!
//! This is the off-chain counterpart to the minters' on-chain checks: it discovers and validates
//! loops/paths so a caller can build a `mint_loop`/`mint_path` call with a state the contract will
//! accept. Equivalence is TIME-CYCLE ONLY — a loop's canonical representative is its
//! lexicographically smallest state ([`crate::grid::lt`]); spatial invariance is out of scope.
//!
//! The Cairo originals `assert` on bad input; here the fallible ones return [`GolError::Input`].

use crate::error::GolError;
use crate::grid::{eq, lt, step, token_hash, GridState, Rows};
use crate::types::Felt;

/// A partial path segment of `length` states (port of the Cairo `PartialPathData`):
/// `exitpoint`/`smallest` are full grids; `entrypoint_id`/`trigger_id` are Poseidon identities.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PartialPathData {
    pub entrypoint_id: Felt,
    pub exitpoint: GridState,
    pub length: u32,
    pub trigger_id: Felt,
    pub smallest: GridState,
}

/// Step `gens` times from `initial`, tracking the lexicographically smallest state seen (including
/// `initial`) and whether any stepped state equals `trigger`. Returns `(triggered, smallest, final)`.
fn run(initial: &Rows, trigger: &Rows, gens: u32) -> (bool, Rows, Rows) {
    let mut current = *initial;
    let mut smallest = *initial;
    let mut triggered = false;
    for _ in 0..gens {
        current = step(&current);
        if eq(&current, trigger) {
            triggered = true;
        }
        if lt(&current, &smallest) {
            smallest = current;
        }
    }
    (triggered, smallest, current)
}

/// Compute a `generations`-state partial path from `initial`, asserting `trigger` is not reached.
pub fn compute_partial_path(
    initial: &Rows,
    trigger: &Rows,
    generations: u32,
) -> Result<PartialPathData, GolError> {
    if generations == 0 {
        return Err(GolError::Input("No path smaller than 1".into()));
    }
    // A segment of `generations` states spans 0..generations-1 -> step generations-1 times.
    let (triggered, smallest, exitpoint) = run(initial, trigger, generations - 1);
    if triggered {
        return Err(GolError::Input("Triggered state reached".into()));
    }
    Ok(PartialPathData {
        entrypoint_id: token_hash(initial),
        exitpoint: GridState::pack(&exitpoint),
        length: generations,
        trigger_id: token_hash(trigger),
        smallest: GridState::pack(&smallest),
    })
}

/// Combine two adjacent segments (p1's exit must be p2's entry, same trigger).
pub fn combine_partial_path(
    p1: PartialPathData,
    p2: PartialPathData,
) -> Result<PartialPathData, GolError> {
    if p1.length == 0 || p2.length == 0 {
        return Err(GolError::Input("No path smaller than 1".into()));
    }
    if p1.exitpoint.token_hash() != p2.entrypoint_id {
        return Err(GolError::Input("Not combinable".into()));
    }
    if p1.trigger_id != p2.trigger_id {
        return Err(GolError::Input("Different trigger state".into()));
    }
    let smallest = if lt(&p2.smallest.unpack(), &p1.smallest.unpack()) {
        p2.smallest
    } else {
        p1.smallest
    };
    Ok(PartialPathData {
        entrypoint_id: p1.entrypoint_id,
        exitpoint: p2.exitpoint,
        length: p1.length + p2.length - 1,
        trigger_id: p1.trigger_id,
        smallest,
    })
}

/// The canonical (smallest) state in a verified loop plus the loop's `second_to_last` state (the
/// predecessor of `initial` — the path minter checks a path enters the loop from outside).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct LoopInfo {
    pub smallest: Rows,
    pub second_to_last: Rows,
}

/// Verify `initial` begins a single loop of exactly `generations` states. `Err` if it returns to
/// `initial` early or fails to close.
pub fn is_single_loop(initial: &Rows, generations: u32) -> Result<LoopInfo, GolError> {
    if generations == 0 {
        return Err(GolError::Input("No loop is smaller than 1".into()));
    }
    // trigger = initial: hitting it before the last step means a shorter loop -> reject.
    let (triggered, smallest, second_to_last) = run(initial, initial, generations - 1);
    if triggered {
        return Err(GolError::Input("triggered in ISLFIS".into()));
    }
    let last = step(&second_to_last);
    if !eq(&last, initial) {
        return Err(GolError::Input("no loop in ISLFIS".into()));
    }
    Ok(LoopInfo { smallest, second_to_last })
}

/// True iff `initial` is a single loop of `generations` AND is that loop's canonical (smallest)
/// state — exactly the condition `mint_loop` enforces on-chain.
pub fn is_single_loop_and_entrypoint_is_smallest(initial: &Rows, generations: u32) -> bool {
    match is_single_loop(initial, generations) {
        Ok(info) => eq(&info.smallest, initial),
        Err(_) => false,
    }
}

/// Step `n` times from `initial` (`n >= 1`); return `(state after n-1 steps, state after n steps)`.
pub fn step_to(initial: &Rows, n: u32) -> Result<(Rows, Rows), GolError> {
    if n == 0 {
        return Err(GolError::Input("step_to needs n>=1".into()));
    }
    let mut prev = *initial;
    for _ in 0..(n - 1) {
        prev = step(&prev);
    }
    let last = step(&prev);
    Ok((prev, last))
}

/// Discovery helper (no Cairo counterpart): step from `initial` until the state recurs to `initial`,
/// up to `max_period`. Returns `(period, canonical_smallest)` if it closes — i.e. `initial` is a
/// periodic state and `mint_loop(canonical_smallest, period)` is mintable. Returns `None` if no
/// recurrence within `max_period` (e.g. `initial` is on a path into a loop, not on the loop itself).
pub fn find_loop(initial: &Rows, max_period: u32) -> Option<(u32, Rows)> {
    let mut current = *initial;
    let mut smallest = *initial;
    for p in 1..=max_period {
        current = step(&current);
        if lt(&current, &smallest) {
            smallest = current;
        }
        if eq(&current, initial) {
            return Some((p, smallest));
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::grid::grid_with;

    fn blinker_a() -> Rows {
        grid_with(&[(5, 0b1110)])
    }
    fn blinker_b() -> Rows {
        grid_with(&[(4, 0b0100), (5, 0b0100), (6, 0b0100)])
    }
    fn other() -> Rows {
        grid_with(&[(20, 0b1010101)])
    }

    #[test]
    fn single_loop_blinker() {
        let info = is_single_loop(&blinker_a(), 2).unwrap();
        assert!(eq(&info.smallest, &blinker_a()), "A is the smallest");
    }

    #[test]
    fn entrypoint_is_smallest_only_for_a() {
        assert!(is_single_loop_and_entrypoint_is_smallest(&blinker_a(), 2));
        assert!(!is_single_loop_and_entrypoint_is_smallest(&blinker_b(), 2));
    }

    #[test]
    fn still_life_is_a_loop_of_one() {
        let block = grid_with(&[(10, 0b110), (11, 0b110)]);
        let info = is_single_loop(&block, 1).unwrap();
        assert!(eq(&info.smallest, &block));
    }

    #[test]
    fn compute_then_check_fields() {
        let p = compute_partial_path(&blinker_a(), &other(), 3).unwrap();
        assert_eq!(p.length, 3);
        assert_eq!(p.entrypoint_id, token_hash(&blinker_a()));
        assert_eq!(p.trigger_id, token_hash(&other()));
        assert!(eq(&p.exitpoint.unpack(), &blinker_a()), "exit = A");
        assert!(eq(&p.smallest.unpack(), &blinker_a()), "smallest = A");
    }

    #[test]
    fn combine_two_segments() {
        let p1 = compute_partial_path(&blinker_a(), &other(), 2).unwrap();
        let p2 = compute_partial_path(&blinker_b(), &other(), 2).unwrap();
        assert_eq!(p1.exitpoint.token_hash(), p2.entrypoint_id, "adjacent");
        let c = combine_partial_path(p1, p2).unwrap();
        assert_eq!(c.length, 3, "2 + 2 - 1");
        assert_eq!(c.entrypoint_id, token_hash(&blinker_a()));
        assert!(eq(&c.exitpoint.unpack(), &blinker_a()));
        assert!(eq(&c.smallest.unpack(), &blinker_a()));
    }

    #[test]
    fn wrong_loop_length_rejected() {
        // A is period 2: asking for length 3 re-hits A at step 2 (the trigger) -> Err.
        assert!(is_single_loop(&blinker_a(), 3).is_err());
    }

    #[test]
    fn find_loop_recovers_period() {
        assert_eq!(find_loop(&blinker_a(), 8), Some((2, blinker_a())));
        let block = grid_with(&[(10, 0b110), (11, 0b110)]);
        assert_eq!(find_loop(&block, 8), Some((1, block)));
    }
}
