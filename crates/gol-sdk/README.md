# gol-sdk

Rust SDK for the [gol_starknet](../../) contracts — Conway's Game of Life as on-chain NFTs on
Starknet. One crate of chain logic (reads, call-building, decoding, ownership, SNIP-36) meant to
serve every consumer: the web frontend (compiled to WASM), a future native TUI, scripts, and bots.

- **Design & rationale:** [`docs/sdk-plan.md`](../../docs/sdk-plan.md) (API reference + plan) and
  [`docs/sdk-decisions.md`](../../docs/sdk-decisions.md) (decisions, with rejected alternatives).
- **Status:** reads, call-builders, both ownership data sources, and `token_uri` decoding are
  built and live-verified on Sepolia. Native writes (strkd), the SNIP-36 prover, and the WASM
  wrapper are not yet built — see [Not yet built](#not-yet-built).

## Design

A small, dependency-thin core (no heavy account machinery, no codegen): `starknet-types-core`
(Felt + Poseidon), `tiny-keccak` (selectors), hand-rolled JSON-RPC over `reqwest`. Composed over
three dependency-injected seams so backends swap without a client rewrite:

| Seam | Trait | Implementations |
|------|-------|-----------------|
| Read | `Reader` | `RpcReader` (JSON-RPC) |
| Ownership | `DataSource` | `EventScanDataSource` (RPC, no key) · `IndexerDataSource` (Starkscan) |
| Submit | `Submitter` | `StrkdSubmitter` *(placeholder)* |

Writes are **call-builders**: they return composable `Call`s; signing/broadcast is a separate
concern (a native `Submitter`, or — on the web — the injected wallet in JS). Keys never live in
the SDK.

## Build & test

```bash
cargo build -p gol-sdk        # or: cargo build (workspace)
cargo test  -p gol-sdk        # 11 unit tests (encoding cross-checked vs starknet.js)
```

> Cargo output goes to `target-rust/` (set in `.cargo/config.toml`) so it never collides with
> scarb's `target/`.

## Quick start

```rust
use gol_sdk::{GolClient, Network, U256};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Known network (shipped address book + default RPC), or GolClient::new(GolConfig { .. }).
    let gol = GolClient::for_network(Network::Sepolia)?;

    let tid = U256::from_u128(98307);

    // Reads (Option = None when the token isn't minted).
    if let Some(lf) = gol.reads().lifeform(tid).await? {
        println!("owner {:?} age {} loop {}", lf.owner, lf.data.age, lf.data.is_loop);
    }
    println!("grid {}", gol.reads().grid_size().await?);

    // token_uri → decoded ERC721 metadata + grid SVG.
    if let Some(uri) = gol.reads().token_uri(tid).await? {
        println!("name {:?}, {} attributes", uri.name, uri.attributes.len());
        if let Some(svg) = uri.svg() { println!("svg {} bytes", svg.len()); }
    }

    // On-chain GoL engine views (off-chain pattern discovery stays in the app).
    let next = gol.reads().iterate_once(U256::from_u128(0x18003)).await?;
    println!("one step -> {}", next.to_hex());

    Ok(())
}
```

### Building transactions

```rust
use gol_sdk::{Felt, GolClient, Network, U256};

let gol = GolClient::for_network(Network::Sepolia)?;
let recipient = Felt::from_hex("0x319219…")?;

let mint: Vec<gol_sdk::Call> = gol.writes().mint_loop(U256::from_u128(0x18003), 4, recipient); // [approve, mint_loop]
let breathe: gol_sdk::Call    = gol.writes().breathe_life(U256::from_u128(98307));             // move_lifeform_forward
```

Hand the `Call`s to a signer: a native `Submitter` (strkd — *not yet wired*), or the browser
wallet via the WASM wrapper (*not yet built*). NUT cost helpers: `nut_cost_for_loop`,
`nut_cost_for_path`.

### Enumerating a wallet's lifeforms

Two interchangeable `DataSource` impls (the operator picks per network):

```rust
use gol_sdk::{DataSource, EventScanDataSource, GolConfig, Network};

let cfg = GolConfig::for_network(Network::Sepolia)?;

// RPC route — no API key, works against any node. The Sepolia route today.
let ds = EventScanDataSource::new(cfg.rpc_url.clone(), cfg.addresses.clone());
let owned = ds.owned_lifeforms(owner).await?;     // Transfer→owner, deduped, owner_of-confirmed
let recent = ds.activity(None, 10).await?;          // NewMove feed
```

```rust
use gol_sdk::{DataSource, IndexerDataSource, GolConfig, Network};

// Indexer route — Starkscan REST, pre-indexed. Key from STARKSCAN_API_KEY (never hardcode it).
let cfg = GolConfig::for_network(Network::Sepolia)?;
let ds = IndexerDataSource::from_env("SN_SEPOLIA", cfg.rpc_url.clone(), cfg.addresses.clone())?;
let owned = ds.owned_lifeforms(owner).await?;
```

> **Network coverage:** Starkscan indexes **mainnet** (`SN_MAIN`); its **Sepolia** index is empty,
> so `IndexerDataSource` returns no data on Sepolia today — use `EventScanDataSource` there. The
> indexer route lights up when GoL is on a Starkscan-indexed chain.

## Networks & config

- `GolClient::for_network(Network::Sepolia | Mainnet)` uses the shipped address book + the
  canonical node. Mainnet has no deployment yet.
- Custom/local: `GolConfig::new(addresses, rpc_url)` or set `GolConfig.rpc_url`.
- **Use `https://` RPC URLs.** An `http://` SNF node 301-redirects to `https://`, and that
  redirect drops the POST body (a confusing `-32700` parse error). The defaults are `https://`.
- The SNF nodes rate-limit heavy event scans; front them with a keyed proxy or a dedicated RPC
  for production scanning.

## Examples

```bash
# live reads (defaults to a public gateway; override with GOL_RPC_URL)
cargo run -p gol-sdk --example read_sepolia

# enumerate a wallet's lifeforms via the RPC event scan
GOL_RPC_URL=https://sepolia.nodes.starknet.org/rpc/v0_10 \
  cargo run -p gol-sdk --example owned_scan

# enumerate via Starkscan (needs a key; mainnet has data, Sepolia does not)
STARKSCAN_API_KEY=… GOL_CHAIN=SN_SEPOLIA \
  cargo run -p gol-sdk --example owned_indexer
```

## Errors

A single `GolError` with a handful of categories (`Config | Input | Encoding | Read | Submission |
Proving`). Reads that simply "miss" (e.g. an unminted token) return `Ok(None)`, not an error.

## Security

- **No keys in the SDK.** It builds calls and reads; signing is external (strkd / a wallet).
- The Starkscan API key is read from `STARKSCAN_API_KEY` (base from `STARKSCAN_BASE_URL`) — never
  hardcoded or committed.

## Not yet built

Tracked in [`docs/sdk-plan.md`](../../docs/sdk-plan.md):

- **`StrkdSubmitter`** — the seam + placeholder exist; the strkd JSON-RPC protocol (pairing,
  `wallet_addInvokeTransaction`, headers, `proof_facts`) isn't wired. Native-only.
- **`Prover` / SNIP-36** — the move-forward-N proving flow (targets the benchmark `GolBench` until
  the product NFT gains a verify entrypoint). Native-only; depends on `StrkdSubmitter`.
- **`gol-sdk-wasm`** — the `wasm-bindgen` wrapper that lets the Next.js frontend import the SDK
  (reads + call-building; signing stays in JS). Needs `wasm32-unknown-unknown` + `wasm-pack`.
- **cainome typed bindings** — the current encoding is hand-rolled and fixture-verified; codegen is
  a hardening step.
