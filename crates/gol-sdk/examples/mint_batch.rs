//! Generate strkd-ready calldata to mint a batch of distinct, engine-validated loop creatures.
//! Offline: picks well-known patterns at distinct positions, uses the engine to find each one's
//! period + canonical (smallest) state, asserts it's a clean canonical loop, and builds the
//! [approve, mint_loop] calls. A companion node script submits them (skipping any already minted).
//!
//!   cargo run -p gol-sdk --example mint_batch

use gol_sdk::{engine, felt_to_hex, grid, token_id, Call, Felt, GolConfig, GolWrites, GridState, Network};
use serde_json::json;
use std::collections::HashSet;

// base patterns (row, col); offset into the 41x41 grid gives a distinct canonical state each.
const BLOCK: &[(usize, usize)] = &[(0, 0), (0, 1), (1, 0), (1, 1)];
const BLINKER: &[(usize, usize)] = &[(0, 0), (0, 1), (0, 2)];
const TUB: &[(usize, usize)] = &[(0, 1), (1, 0), (1, 2), (2, 1)];
const BEACON: &[(usize, usize)] = &[(0, 0), (0, 1), (1, 0), (1, 1), (2, 2), (2, 3), (3, 2), (3, 3)];
const TOAD: &[(usize, usize)] = &[(0, 1), (0, 2), (0, 3), (1, 0), (1, 1), (1, 2)];
const BEEHIVE: &[(usize, usize)] = &[(0, 1), (0, 2), (1, 0), (1, 3), (2, 1), (2, 2)];

fn rows_from(base: &[(usize, usize)], dr: usize, dc: usize) -> grid::Rows {
    let mut rows = grid::empty();
    for &(r, c) in base {
        rows[r + dr] |= 1u64 << (c + dc);
    }
    rows
}

fn main() {
    let cfg = GolConfig::for_network(Network::Sepolia).unwrap();
    let w = GolWrites::new(&cfg.addresses, cfg.nut_decimals);
    let agent =
        Felt::from_hex("0x026d87a881bc82eb038c4cc214fbccd16ea72b424b523a7b2b2551a2e495e70f")
            .unwrap();

    let batch: &[(&str, &[(usize, usize)], usize, usize)] = &[
        ("block", BLOCK, 3, 3),
        ("blinker", BLINKER, 3, 12),
        ("tub", TUB, 3, 22),
        ("beacon", BEACON, 3, 32),
        ("toad", TOAD, 12, 3),
        ("beehive", BEEHIVE, 12, 15),
        ("block", BLOCK, 12, 28),
        ("blinker", BLINKER, 22, 5),
        ("tub", TUB, 22, 18),
        ("beacon", BEACON, 22, 30),
    ];
    // already minted — never re-emit these.
    let existing: HashSet<String> = [
        "0x743d91e948cc844ef3e08dc46ede35fe5ea085981a0176d3203810da80d9416",
        "0x6d8d0f0a7a8b1e4309a9601a9ab20ee629ba707e140d647309b8255281b2925",
    ]
    .iter()
    .map(|s| s.to_string())
    .collect();

    let mut seen: HashSet<String> = HashSet::new();
    let mut mints = Vec::new();
    for (name, base, dr, dc) in batch {
        let rows = rows_from(base, *dr, *dc);
        // engine: find the loop reachable from this pattern (period + canonical smallest).
        let (period, smallest) =
            engine::find_loop(&rows, 16).unwrap_or_else(|| panic!("{name} did not loop within 16"));
        // the smallest is the contract's required canonical entrypoint — assert mint will pass.
        assert!(
            engine::is_single_loop_and_entrypoint_is_smallest(&smallest, period),
            "{name}: smallest is not a canonical loop of period {period}"
        );
        let tid = token_id(&smallest).to_hex();
        assert!(!existing.contains(&tid), "{name} ({tid}) already minted");
        assert!(seen.insert(tid.clone()), "{name} ({tid}) duplicate in batch");

        let calls = w.mint_loop(&GridState::pack(&smallest), period, agent);
        mints.push(json!({
            "name": name,
            "token_id": tid,
            "period": period,
            "calls": calls.iter().map(call_json).collect::<Vec<_>>(),
        }));
    }
    println!("{}", serde_json::to_string_pretty(&json!({ "count": mints.len(), "mints": mints })).unwrap());
}

fn call_json(c: &Call) -> serde_json::Value {
    json!({
        "to": felt_to_hex(&c.to),
        "selector": felt_to_hex(&c.selector),
        "calldata": c.calldata.iter().map(felt_to_hex).collect::<Vec<_>>(),
    })
}
