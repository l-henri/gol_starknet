//! Timing probe for the symmetry helpers. Run:
//! `cargo run -p gol-sdk --release --example sym_bench`

use gol_sdk::grid::{apply_symmetry, find_witness, grid_with, step, symmetry_canonical};
use std::time::Instant;

fn main() {
    // a busy, asymmetric grid (worst-ish case: deep lt comparisons, no early identity)
    let mut g = grid_with(&[(1, 0b1110), (7, 0x155), (15, 0x3ff), (25, 0x12345), (37, 0b111)]);
    for _ in 0..30 {
        g = step(&g); // let it spread across the board
    }

    let t = Instant::now();
    let iters = 1000;
    let mut sink = 0u64;
    for _ in 0..iters {
        let (c, ..) = symmetry_canonical(&g);
        sink ^= c[0];
    }
    println!(
        "symmetry_canonical: {:.3} ms/call ({} iters, sink {sink})",
        t.elapsed().as_secs_f64() * 1000.0 / iters as f64,
        iters
    );

    // find_witness worst case: no witness exists -> full scan of every (g, k)
    let unrelated = grid_with(&[(20, 0b101)]);
    for max_k in [0u32, 10, 100] {
        let t = Instant::now();
        let r = find_witness(&g, &unrelated, max_k);
        println!(
            "find_witness miss, max_k={max_k}: {:.3} ms (result {:?})",
            t.elapsed().as_secs_f64() * 1000.0,
            r
        );
    }
    // and a hit at k=50 (realistic challenge planning)
    let mut b = g;
    for _ in 0..50 {
        b = step(&b);
    }
    let b = apply_symmetry(3, 17, 5, &b);
    let t = Instant::now();
    let r = find_witness(&g, &b, 60);
    println!("find_witness hit at k=50: {:.3} ms ({:?})", t.elapsed().as_secs_f64() * 1000.0, r);
}
