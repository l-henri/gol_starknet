//! Emit strkd-ready calldata for a live register→combine→mint partial-path LOOP flow.
//!
//! Pure off-chain: uses the SDK engine (to pick + verify a fresh canonical loop and step it) and
//! the partial-path call-builders. A companion node script submits the printed txs via strkd. This
//! proves the partial-path call-builders + the on-chain minter flow end-to-end.
//!
//!   cargo run -p gol-sdk --example partial_path_calls

use gol_sdk::{
    engine, felt_to_hex, grid, token_hash, token_id, Call, Felt, GolConfig, GolWrites, GridState,
    Minter, Network,
};
use serde_json::json;

fn main() {
    let cfg = GolConfig::for_network(Network::Sepolia).unwrap();
    let w = GolWrites::new(&cfg.addresses, cfg.nut_decimals);
    let agent =
        Felt::from_hex("0x026d87a881bc82eb038c4cc214fbccd16ea72b424b523a7b2b2551a2e495e70f")
            .unwrap();

    // A fresh canonical blinker (period 2) at row 10 — a different token id than the seeded one.
    let a = grid::grid_with(&[(10, 0b111u64 << 20)]);
    assert!(
        engine::is_single_loop_and_entrypoint_is_smallest(&a, 2),
        "A must be a canonical period-2 loop"
    );
    let b = grid::step(&a);
    let a_state = GridState::pack(&a);
    let b_state = GridState::pack(&b);
    let id_a = token_hash(&a);
    let id_b = token_hash(&b);

    // Decompose the loop A→B→A into two segments, then combine into the closed loop segment:
    //   seg1 = [A,B] (len 2, trigger A)   seg2 = [B] (len 1, trigger A)
    //   combine(seg1,seg2) -> entry A, exit B, len 2 (step(B)=A closes the loop)
    let seg1 = w.mint_partial_path(Minter::Loop, &a_state, 2, &a_state);
    let seg2 = w.mint_partial_path(Minter::Loop, &b_state, 1, &a_state);
    let combine = w.combine_partial_path(Minter::Loop, id_a, id_b);
    let mint = w.mint_loop_from_partial_paths(&a, 2, agent); // [approve, mint]

    let out = json!({
        "token_id": token_id(&a).to_hex(),
        "id_a": felt_to_hex(&id_a),
        "id_b": felt_to_hex(&id_b),
        "txs": [
            { "label": "register seg1 [A,B]", "calls": [call_json(&seg1)] },
            { "label": "register seg2 [B]",   "calls": [call_json(&seg2)] },
            { "label": "combine -> closed loop", "calls": [call_json(&combine)] },
            { "label": "mint_loop_from_partial_paths", "calls": mint.iter().map(call_json).collect::<Vec<_>>() },
        ],
    });
    println!("{}", serde_json::to_string_pretty(&out).unwrap());
}

fn call_json(c: &Call) -> serde_json::Value {
    json!({
        "to": felt_to_hex(&c.to),
        "selector": felt_to_hex(&c.selector),
        "calldata": c.calldata.iter().map(felt_to_hex).collect::<Vec<_>>(),
    })
}
