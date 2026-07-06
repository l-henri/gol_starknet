//! Emit the witness-assisted mint calldata for the v3 genesis smoke-test blinker as JSON.
//! Run: `cargo run -p gol-sdk --release --example v3_seed`

use gol_sdk::grid::{grid_with, loop_family_canonical, GridState};
use gol_sdk::{felt_to_hex, token_id};

fn state_hex(s: &GridState) -> Vec<String> {
    s.to_calldata().iter().map(felt_to_hex).collect()
}

fn main() {
    let drawn = grid_with(&[(5, 0b1110)]); // the classic blinker, the same seed shape as v2
    let (canonical, d4, dr, dc, k) = loop_family_canonical(&drawn, 2);
    println!(
        "{}",
        serde_json::json!({
            "drawn": state_hex(&GridState::pack(&drawn)),
            "loop_length": 2,
            "canonical": state_hex(&GridState::pack(&canonical)),
            "d4": d4, "dr": dr, "dc": dc, "k": k,
            "token_id": token_id(&canonical).to_hex(),
        })
    );
}
