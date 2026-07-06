//! Emit still-life grids of increasing density (fields of isolated 2×2 blocks). A still-life's state
//! never changes when stepped, so its live-cell density is held CONSTANT across every generation —
//! letting us measure how per-generation gas depends on density alone (period and dynamics fixed).

use gol_sdk::grid::{step, GridState, N};
use gol_sdk::felt_to_hex;

fn blocks(n_per_side: usize) -> [u64; N] {
    // 2×2 blocks at (4i,4j); 4-spacing keeps each block isolated (still-life) and clear of the wrap.
    let mut rows = [0u64; N];
    let mut placed = 0;
    'outer: for i in 0..9 {
        for j in 0..9 {
            if placed >= n_per_side * n_per_side {
                break 'outer;
            }
            let (r, c) = (4 * i, 4 * j);
            rows[r] |= (0b11u64) << c;
            rows[r + 1] |= (0b11u64) << c;
            placed += 1;
        }
    }
    rows
}

fn popcount(rows: &[u64; N]) -> u32 {
    rows.iter().map(|r| r.count_ones()).sum()
}

fn main() {
    for n in [1usize, 3, 5, 7, 9] {
        let rows = blocks(n);
        let still = step(&rows) == rows;
        let gs = GridState::pack(&rows);
        let cd: Vec<String> = gs.to_calldata().iter().map(felt_to_hex).collect();
        // POP <cells> <still?> <7 packed felts>
        println!("POP\t{}\t{}\t{}", popcount(&rows), still, cd.join(","));
    }
}
