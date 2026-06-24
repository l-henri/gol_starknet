//! Live read against the Sepolia **v2** deployment — proves the RpcReader decode path and the
//! off-chain engine end-to-end. Defaults to the configured Sepolia RPC; override with `GOL_RPC_URL`.
//!
//!   cargo run -p gol-sdk --example read_sepolia

use gol_sdk::{engine, felt_to_hex, grid, token_id, Felt, GolClient, GolConfig, GridState, Network};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut cfg = GolConfig::for_network(Network::Sepolia)?;
    if let Ok(url) = std::env::var("GOL_RPC_URL") {
        cfg.rpc_url = url;
    }
    let gol = GolClient::new(cfg);

    println!("grid_size = {}", gol.reads().grid_size().await?);

    // The seeded canonical blinker: row 5 = 0b1110. Compute its token id OFF-CHAIN (engine) — it
    // must match the on-chain token, pinning the Rust Poseidon + packing to the deployed contract.
    let blinker = grid::grid_with(&[(5, 0b1110)]);
    let tid = token_id(&blinker);
    println!("computed token_id (blinker) = {}", tid.to_hex());

    match gol.reads().lifeform(tid).await? {
        Some(lf) => {
            println!(
                "lifeform: owner={} age={} is_loop={} is_still={} population={}",
                felt_to_hex(&lf.owner),
                lf.data.age,
                lf.data.is_loop,
                lf.data.is_still,
                lf.data.current_state.population(),
            );
            // engine <-> chain: the on-chain state must hash to the id we read it by.
            let rows = lf.data.current_state.unpack();
            assert_eq!(token_id(&rows), tid, "engine token_id matches chain");
            println!("  ✓ engine token_id == on-chain id");

            match engine::find_loop(&rows, 16) {
                Some((period, smallest)) => println!(
                    "  engine: single loop, period={period}, on-chain state is canonical={}",
                    grid::eq(&smallest, &rows)
                ),
                None => println!("  engine: no loop within 16 steps"),
            }
        }
        None => println!("lifeform not minted at computed id (is config pointing at v2?)"),
    }

    if let Some(rp) = gol.reads().render_params(tid).await? {
        println!("render_params: bg=0x{:06x} cell=0x{:06x} speed={}", rp.bg, rp.cell, rp.speed);
    }

    if let Some(uri) = gol.reads().token_uri(tid).await? {
        println!("token_uri: name={:?}, {} attributes", uri.name, uri.attributes.len());
        for a in &uri.attributes {
            println!("    - {}: {}", a.trait_type, a.value);
        }
        if let Some(html) = uri.html() {
            println!("  html: {} bytes, starts {:?}", html.len(), &html[..html.len().min(40)]);
        }
    }

    // Call-building (NOT sent — this is exactly what a wallet would sign + execute).
    let recipient =
        Felt::from_hex("0x26d87a881bc82eb038c4cc214fbccd16ea72b424b523a7b2b2551a2e495e70f").unwrap();
    let calls = gol.writes().mint_loop(&GridState::pack(&blinker), 2, recipient);
    println!("mint_loop call-building -> {} calls:", calls.len());
    for c in &calls {
        println!(
            "    to={} selector={} ({} calldata felts)",
            felt_to_hex(&c.to),
            felt_to_hex(&c.selector),
            c.calldata.len()
        );
    }

    Ok(())
}
