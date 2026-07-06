//! Dump the partial-path mint plan for a glider as broadcast-ready calls (to | selector | calldata),
//! so we can drive the exact planner output through strkd to validate it on the live contract.

use gol_sdk::config::{deployments, Network};
use gol_sdk::engine::find_loop;
use gol_sdk::grid::{grid_with, token_id};
use gol_sdk::writes::GolWrites;
use gol_sdk::{felt_to_hex, Felt};

fn main() {
    let addrs = deployments(Network::Sepolia).unwrap();
    let w = GolWrites::new(&addrs, 18);
    let glider = grid_with(&[(0, 0b010), (1, 0b100), (2, 0b111)]);
    let (period, canonical) = find_loop(&glider, 4096).expect("glider loops");
    // recipient = the strkd agent account
    let recipient =
        Felt::from_hex("0x026d87a881bc82eb038c4cc214fbccd16ea72b424b523a7b2b2551a2e495e70f").unwrap();
    let plan = w.plan_loop_mint(&canonical, period, recipient, 60, 60, 8);
    eprintln!(
        "period={period} token_id={} txCount={} tooLong={} singleShot={}",
        token_id(&canonical).to_hex(),
        plan.tx_count,
        plan.too_long,
        plan.single_shot
    );
    // One line per call: STEP<i>\t<to>\t<selector>\t<cd0,cd1,...>
    for (i, step) in plan.steps.iter().enumerate() {
        for c in &step.calls {
            let cd: Vec<String> = c.calldata.iter().map(felt_to_hex).collect();
            println!("STEP{}\t{}\t{}\t{}", i, felt_to_hex(&c.to), felt_to_hex(&c.selector), cd.join(","));
        }
    }
}
