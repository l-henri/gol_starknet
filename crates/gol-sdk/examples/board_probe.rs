//! Live probe of the leaderboard reads (Sepolia): top breathers, loop/path mints with blocks.
//! Run: `cargo run -p gol-sdk --example board_probe`

use gol_sdk::{deployments, EventScanDataSource, Network};

#[tokio::main(flavor = "current_thread")]
async fn main() {
    let addrs = deployments(Network::Sepolia).unwrap();
    let rpc = "https://api.cartridge.gg/x/starknet/sepolia";
    let ds = EventScanDataSource::new(rpc, addrs);

    let rewards = ds.feed_rewards().await.expect("feed_rewards");
    println!("top breathers ({}):", rewards.len());
    for (a, g) in rewards.iter().take(5) {
        println!("  {a:#x} -> {g} generations");
    }

    let mints = ds.recent_mints_with_blocks().await.expect("recent_mints");
    println!("loop mints ({}):", mints.len());
    for (t, b) in mints.iter().take(5) {
        println!("  block {b} -> {}", t.to_hex());
    }

    let pmints = ds.recent_path_mints_with_blocks().await.expect("path mints");
    println!("path mints ({}):", pmints.len());
    for (t, b) in pmints.iter().take(5) {
        println!("  block {b} -> {}", t.to_hex());
    }
}
