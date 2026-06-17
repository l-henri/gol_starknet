//! Enumerate a wallet's lifeforms via the Starkscan indexer DataSource.
//!
//!   STARKSCAN_API_KEY=… GOL_RPC_URL=http://127.0.0.1:8651/rpc/v0_10 \
//!     cargo run -p gol-sdk --example owned_indexer
//!
//! NOTE: Starkscan indexes mainnet (SN_MAIN); its Sepolia index is empty as of 2026-06-17, so
//! against SN_SEPOLIA this returns 0 (proving the auth/request/parse path) until GoL is on mainnet.
//! Override the chain with GOL_CHAIN.

use gol_sdk::{DataSource, Felt, GolConfig, IndexerDataSource, Network};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cfg = GolConfig::for_network(Network::Sepolia)?;
    let chain = std::env::var("GOL_CHAIN").unwrap_or_else(|_| "SN_SEPOLIA".to_string());
    let rpc = std::env::var("GOL_RPC_URL").unwrap_or_else(|_| cfg.rpc_url.clone());
    let owner = std::env::var("GOL_OWNER").unwrap_or_else(|_| {
        "0x319219ccc771fec38c7829c4195957626b81d6e6452e27e0fc653910f1ad532".to_string()
    });

    let ds = IndexerDataSource::from_env(chain.clone(), rpc, cfg.addresses.clone())?;
    let owned = ds.owned_lifeforms(Felt::from_hex(&owner)?).await?;

    println!("[indexer/{chain}] owner {owner}\nowns {} lifeform(s):", owned.len());
    for lf in &owned {
        println!("  token {} state={}", lf.token_id.to_hex(), lf.data.current_state.to_hex());
    }
    Ok(())
}
