//! Live probe of the pet-bond reads (Sepolia): the caretaker graph + bond status.
use gol_sdk::{deployments, EventScanDataSource, Network};
use gol_sdk::rpc::RpcReader;

#[tokio::main(flavor = "current_thread")]
async fn main() {
    let addrs = deployments(Network::Sepolia).unwrap();
    let rpc = "https://api.cartridge.gg/x/starknet/sepolia";
    let ds = EventScanDataSource::new(rpc, addrs.clone());
    let pairs = ds.pet_pairs().await.expect("pet_pairs");
    println!("caretaker pairs ({}):", pairs.len());
    let reader = RpcReader::new(rpc, addrs);
    for (c, h) in pairs.iter().take(5) {
        let (held, last, reapable) = reader.bond_status(*c, *h).await.expect("bond_status");
        println!("  {h:#x} -> {} held={held} last_pet={last} reapable={reapable}", c.to_hex());
    }
}
