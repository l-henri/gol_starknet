//! Live read against the Sepolia deployment — proves the RpcReader decode path end-to-end.
//!
//!   cargo run -p gol-sdk --example read_sepolia
//!
//! Uses a public gateway by default; override with `GOL_RPC_URL`.

use gol_sdk::{felt_to_hex, GolClient, GolConfig, Network, U256};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut cfg = GolConfig::for_network(Network::Sepolia)?;
    cfg.rpc_url = std::env::var("GOL_RPC_URL")
        .unwrap_or_else(|_| "https://api.cartridge.gg/x/starknet/sepolia".to_string());
    let gol = GolClient::new(cfg);

    println!("grid_size = {}", gol.reads().grid_size().await?);

    // Token 98307 — the 2x2-block loop NFT minted on the live deployment (see STATUS.md).
    let tid = U256::from_u128(98307);
    match gol.reads().lifeform(tid).await? {
        Some(lf) => println!(
            "lifeform 98307: owner={} age={} is_loop={} is_still={} state={}",
            felt_to_hex(&lf.owner),
            lf.data.age,
            lf.data.is_loop,
            lf.data.is_still,
            lf.data.current_state.to_hex(),
        ),
        None => println!("lifeform 98307 not minted"),
    }

    // Exercise an on-chain engine view: one Conway step of a 2x2 block (a still life).
    if let Some(lf) = gol.reads().lifeform(tid).await? {
        let next = gol.reads().iterate_once(lf.data.current_state).await?;
        println!("iterate_once(state) = {}", next.to_hex());
    }

    Ok(())
}
