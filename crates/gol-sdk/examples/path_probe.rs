//! Emit GridState calldata for live path-mint testing on Sepolia.
//! (1) An L-tromino that reaches a 2x2 block (still life) in ONE step -> a frozen path of length 1.
//! (2) A blinker phase A and its next step B (real adjacent states) for a challenge_burn live test.

use gol_sdk::grid::{step, token_hash, GridState, N};
use gol_sdk::felt_to_hex;

fn emit(label: &str, rows: &[u64; N]) {
    let gs = GridState::pack(rows);
    let cd: Vec<String> = gs.to_calldata().iter().map(felt_to_hex).collect();
    // token_id (u256) equals token_hash (felt) as a number; print the hex for use as a u256 on-chain.
    let tid = token_hash(rows);
    println!("{label}\ttoken_id={}\tgridstate={}", felt_to_hex(&tid), cd.join(","));
}

fn main() {
    // (1) L-tromino: row1 = 0b110 (cols 1,2), row2 = 0b010 (col 1). Matches the unit test.
    let mut l = [0u64; N];
    l[1] = 0b110;
    l[2] = 0b010;
    let block = step(&l);
    let block2 = step(&block);
    emit("L_TROMINO(len1->block)", &l);
    emit("BLOCK(still)", &block);
    println!("# block is still-life: {}", block == block2);

    // (2) Blinker phase A (row5 = 0b1110) and its next step B — two real adjacent states.
    let mut a = [0u64; N];
    a[5] = 0b1110;
    let b = step(&a);
    emit("BLINKER_A", &a);
    emit("BLINKER_B(step of A)", &b);
}
