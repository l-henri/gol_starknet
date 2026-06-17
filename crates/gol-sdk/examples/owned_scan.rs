//! Enumerate a wallet's lifeforms via the event-scan DataSource (RPC route, no API key).
//!
//!   GOL_RPC_URL=http://127.0.0.1:8651/rpc/v0_10 cargo run -p gol-sdk --example owned_scan
//!
//! Defaults to the owner of token 98307 on the live Sepolia deployment.

use gol_sdk::{DataSource, EventScanDataSource, Felt, GolConfig, Network};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cfg = GolConfig::for_network(Network::Sepolia)?;
    let rpc = std::env::var("GOL_RPC_URL").unwrap_or_else(|_| cfg.rpc_url.clone());
    let owner = std::env::var("GOL_OWNER").unwrap_or_else(|_| {
        "0x319219ccc771fec38c7829c4195957626b81d6e6452e27e0fc653910f1ad532".to_string()
    });

    let ds = EventScanDataSource::new(rpc, cfg.addresses.clone());
    let owned = ds.owned_lifeforms(Felt::from_hex(&owner)?).await?;

    println!("owner {owner}\nowns {} lifeform(s):", owned.len());
    for lf in &owned {
        println!(
            "  token {} | age={} is_loop={} is_still={} state={}",
            lf.token_id.to_hex(),
            lf.data.age,
            lf.data.is_loop,
            lf.data.is_still,
            lf.data.current_state.to_hex(),
        );
    }

    if let Some(lf) = owned.first() {
        let act = ds.activity(Some(lf.token_id), 5).await?;
        println!("recent activity for {} ({} moves):", lf.token_id.to_hex(), act.len());
        for m in &act {
            println!("  age={} @ block {}", m.age, m.block_number);
        }
    }
    Ok(())
}
