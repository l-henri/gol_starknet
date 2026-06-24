# GoL SDK — API Reference & Implementation Plan (Rust)

> **Status:** proposal (2026-06-17). A planning artifact — review before building.
> **Audience:** whoever builds the SDK, the WASM web binding, and (later) the TUI.
> **Scope tier:** internal (AMBER) — references unreleased plans and deployment addresses.
>
> A single **Rust** SDK over the gol_starknet contracts. It serves the new web frontend **today**
> (compiled to WASM) and a native **TUI later** from one codebase. Primarily an **API reference**
> for the public surface, plus a phased **implementation plan**.
>
> **Language pivot (2026-06-17):** earlier drafts assumed a TypeScript SDK; reversed to Rust to get
> one SDK for both a WASM-consumed web app and a future native TUI. Rationale in
> [sdk-decisions.md](sdk-decisions.md).
>
> Companions: [development.md](development.md) (build/deploy/tx tooling), [frontend.md](frontend.md)
> (the web app), [technical-overview.md](technical-overview.md) (contract behavior), and the
> SNIP-36 benchmark in [project-management/STATUS.md](project-management/STATUS.md).
>
> **Architectural template:** the three dependency-injected seams (`Reader` / `Submitter` /
> `Prover`) are taken almost directly from the sibling SNIP-36 project — **same language, same
> decomposition**: specs in `../strip-account`, Rust implementation in `../hexposed-sdk`. Where this
> doc says "as the sibling does," that code already ships.
>
> **As-built convention:** while implementing, maintain an "As-built / divergences" note here
> (borrowed from the sibling's technical-spec) recording where reality departs from this spec.

## 1. Goals & non-goals

**Goals**

- **One Rust crate** of chain logic (reads, call-building, decoding, proofs) shared by every
  consumer — web (via WASM) now, a native TUI later, plus scripts/bots/indexer.
- Three dependency-injected **trait seams** — `Reader` (incl. a `DataSource` for ownership),
  `Submitter` (sign + broadcast), `Prover` (SNIP-36) — so backends swap without a client rewrite.
- ABI-generated bindings via **cainome** (the Rust analog of abi-wan-kanabi), so the SDK can't
  silently drift from the contracts.
- Multi-network from day one (Sepolia live, Mainnet when it ships).
- A thin **`gol-sdk-wasm`** wrapper that publishes an npm package the Next.js app imports.

**Non-goals (v1)**

- **No GUI/TUI in the SDK.** The TUI (future) and the web app are *consumers*; the SDK is logic only.
- **No bundled Game-of-Life simulation / discovery.** Off-chain discovery (today's `gameOfLife.ts`)
  stays in the app. The SDK exposes the contract's **on-chain** engine view functions (§6.3).
- **The SDK never runs a prover** (needs ~18 GB RAM, native binaries). It orchestrates an external
  prover through the `Prover` trait (§6.6).
- **No key handling.** Signing is external: the browser wallet (JS) on web, `strkd` or a local key
  on native. Private keys never live in the SDK.

## 2. Decisions (locked via interview + sibling comparison, 2026-06-17)

| Decision | Choice |
|---|---|
| **Language** | **Rust** — one SDK for the WASM web app now and a native TUI later |
| Starknet lib | **starknet-rs** (`starknet`, `starknet-types-core` for `Felt`), pinned to a protocol-aligned version |
| Packaging | **Cargo workspace** crate `crates/gol-sdk`; web consumes via a `crates/gol-sdk-wasm` (`wasm-pack`) npm package |
| Web binding | **WASM via `wasm-bindgen`** — reads + call-building + proofs in Rust; **signing stays in JS** (browser wallet) |
| Seams | **Three trait seams** — `Reader`/`DataSource`, `Submitter`, `Prover` (matches the sibling) |
| SNIP-36 scope | **`Prover` client interface** — SDK orchestrates an external prover, never runs it |
| Write API shape | **Build composable `Call`s**, submit via the `Submitter` seam |
| Typed bindings | **cainome-generated** from compiled ABIs + thin fixture-tested domain decoders |
| Read/ownership | **Pluggable `DataSource`** — event-scan impl now, indexer impl later |
| GoL discovery logic | **Stays in the app** (SDK exposes only on-chain engine views) |
| Network config | **Multi-network address book** + caller override |
| Proof transport | **Transport-agnostic `Prover`** + an HTTP impl matching the SNIP-36 server contract |
| Error model | **One `GolError` enum** with a handful of categories (`thiserror`) |

> **Why Rust now:** the product may grow a TUI, and a Rust SDK serves *both* a TUI (native) and the
> web app (WASM) from one codebase — a TS SDK cannot reasonably feed a Rust TUI (you'd embed a JS
> runtime). The sibling `hexposed-sdk` is a working precedent for the exact seams below.
> **The trade we accept:** the web frontend keeps a thin JS layer for wallet signing, and the
> frontend build gains a `wasm-pack` step (§7). The chain logic — the part worth sharing with the
> TUI — is fully in Rust.

## As-built status (2026-06-17)

First cut landed in `crates/gol-sdk` (**usage docs: [crates/gol-sdk/README.md](../crates/gol-sdk/README.md)**)
— **`cargo build` ✓, `cargo test` ✓ (11 unit tests), live `read_sepolia` example ✓** (grid_size=15,
token 98307 decoded incl. `token_uri`, `iterate_once` still-life confirmed).

Landed: the Cargo workspace; `config` (Network + address book with live Sepolia addresses);
`error` (`GolError`); `types` (`Felt`/`U256`/domain structs); `encoding` (sn_keccak selectors +
Poseidon `move_message_hash`, **fixture-tested against the frontend's starknet.js**); `RpcReader`
(reads + NUT + engine views, live-verified); `GolWrites` call-builders (+tests); the `Submitter`
trait; and **both `DataSource` impls** — `EventScanDataSource` (`starknet_getEvents`, no key,
live-verified: owner → token 98307, deduped + `owner_of`-confirmed) and `IndexerDataSource`
(Starkscan REST, key via `STARKSCAN_API_KEY`, plumbing verified against the live API).

Verified on-chain event layouts (Sepolia lifeforms): `Transfer` keys =
`[sel, from, to, token_id.low, token_id.high]` (data empty); `NewLifeForm` data =
`[owner, token_id.lo, token_id.hi, is_loop, is_still, is_alive, is_dead, seq_len, state.lo, state.hi, age]`;
`NewMove` data = `[token_id.lo, token_id.hi, age]`.

The **`gol-sdk-wasm`** wrapper (wasm-bindgen) builds to an npm package via `wasm-pack build
--target web` — reads + call-building exposed to JS (`GolSdk`: `lifeform`/`tokenUri`/`nutBalance`/
`ownedLifeforms`/`gridSize` + `mintLoopCalls`/`breatheLifeCall`), signing left to the browser
wallet. `gol-sdk` was made wasm-compatible (target-split reqwest, `getrandom` js, `?Send` async
traits). Smoke-tested in node: call-builders emit the exact `account.execute` shape.

Divergences from the spec above (deliberate, for "cook now"):
1. **Lean stack instead of starknet-rs + cainome.** Following the sibling `../hexposed-sdk`:
   `starknet-types-core` (Felt + Poseidon) + `tiny-keccak` (selectors) + hand-rolled JSON-RPC /
   calldata over `reqwest`. **cainome typed-binding codegen is deferred** (toolchain not installed;
   the hand-rolled encoding is verified against the starknet.js oracle, so this is low-risk). The
   §5 cainome plan stands as the next hardening step.
2. **Cargo target redirected to `target-rust/`** (`.cargo/config.toml`) to avoid colliding with
   scarb's `target/`.
3. **Stubs / follow-ups:** `StrkdSubmitter::submit` returns a "not yet wired" error (the seam +
   placeholder exist); the `Prover` (SNIP-36) module is not yet built. (`token_uri` decode and the
   `gol-sdk-wasm` wrapper are now built.)
4. **Indexer data coverage:** Starkscan indexes mainnet (`SN_MAIN`) but **not Sepolia**
   (`SN_SEPOLIA` status is all-null) as of 2026-06-17, so `IndexerDataSource` is plumbing-verified
   against the live API but returns data only once GoL is on a Starkscan-indexed chain (mainnet).
   `EventScanDataSource` (RPC) is the route that sees Sepolia data today — the operator picks per
   network. Also: the Starkscan ERC721 `token_id` low/high split is best-effort (no ERC721 fixture
   on an indexed chain yet); the `owner_of` confirmation guards correctness regardless.

## 3. Repository & crate layout (Cargo workspace)

The repo already builds Cairo with `Scarb.toml`; a `Cargo.toml` workspace coexists (different files).

```
gol_starknet/
├─ Cargo.toml              # [workspace] members = ["crates/*"]
├─ Scarb.toml              # Cairo (unchanged)
├─ src/ … (Cairo)          # unchanged
├─ target/dev/*.contract_class.json   # ABI source (scarb build output)
├─ crates/
│  ├─ gol-sdk/             # the core library crate
│  │  ├─ Cargo.toml        # starknet-rs, cainome, thiserror, async-trait, serde, reqwest
│  │  ├─ build.rs          # cainome codegen from target/dev/*.contract_class.json (§8)
│  │  └─ src/
│  │     ├─ lib.rs         # public re-exports
│  │     ├─ client.rs      # GolClient + builder (composes the seams)
│  │     ├─ config.rs      # Network, GolAddresses, address book (§4)
│  │     ├─ types.rs       # domain types (§6.2)
│  │     ├─ reader.rs      # Reader trait (§6.3)
│  │     ├─ rpc.rs         # RpcReader (JsonRpcClient-backed)
│  │     ├─ writes.rs      # call builders (§6.4)
│  │     ├─ submit/        # Submitter trait + impls (§6.4)
│  │     │  ├─ mod.rs
│  │     │  ├─ local_key.rs    # LocalKeySubmitter (starknet-signers) — native
│  │     │  └─ strkd.rs        # StrkdSubmitter (HTTP loopback) — native
│  │     ├─ datasource/    # DataSource trait + EventScanDataSource (§6.5)
│  │     ├─ prover/        # Prover trait + HttpProofProvider + move-forward helpers (§6.6)
│  │     ├─ encoding.rs    # selectors, poseidon message hash (pure)
│  │     ├─ events.rs      # selectors + event decoders (§6.8)
│  │     ├─ abi/           # GENERATED by cainome
│  │     └─ error.rs       # GolError (§6.7)
│  └─ gol-sdk-wasm/        # wasm-bindgen wrapper → npm package via wasm-pack (§7)
│     ├─ Cargo.toml        # crate-type=["cdylib"]; wasm-bindgen, wasm-bindgen-futures, serde-wasm-bindgen
│     └─ src/lib.rs
└─ ui/game-of-life/        # depends on the wasm-pack output (e.g. "@gol/sdk": "file:../../crates/gol-sdk-wasm/pkg")
```

**Feature flags** on `gol-sdk` (mirroring the sibling's `native` / `remote-prover` split):
- `native` (default off in wasm): `tokio` + native `reqwest`, enables `LocalKeySubmitter` + `StrkdSubmitter`.
- `wasm`: fetch-based transport, `wasm-bindgen-futures`; no native submitters (signing is in JS).
- `prover-http`: the HTTP `Prover` impl.

## 4. Configuration & networks

```rust
pub enum Network { Sepolia, Mainnet }

pub struct GolAddresses {
    pub lifeforms:   Felt,
    pub nutrient:    Felt,
    pub loop_minter: Felt,
    pub path_minter: Felt,
    /// Benchmark contract — only where a GolBench is deployed (proofs, §6.6).
    pub bench: Option<Felt>,
}

/// Known deployments shipped with the SDK. Mainnet filled in when live.
pub fn deployments(net: Network) -> Option<GolAddresses>;
// Sepolia (live, from STATUS.md):
//   nutrient    0x060e3d6a6f181235e0d4993ddde5a7db7d8ff5275830bcc916969dfdbf3e1858
//   lifeforms   0x0535f6cb8e98f78de9b4dc71b78839cd8119af301b8b300d715b32872d07494e
//   loop_minter 0x021f2ee4afeb2593fb957911f500c06424bb045ec64e172bd8ee0af5aefd4ffc
//   path_minter 0x07e46847ece8c083da4e8a3eb17bd8d3f7138b08cda3ad6a2ffa884b918d2503

pub struct GolConfig {
    pub addresses:    GolAddresses, // from `deployments(net)` or caller-supplied
    pub rpc_url:      String,       // defaults to a public endpoint per network
    pub nut_decimals: u32,          // 18
}
```

Canonical RPC nodes are `https://sepolia.nodes.starknet.org/rpc/v0_10` and the mainnet equivalent
(see development.md); the web app may use a public gateway.

> **Divergence from the sibling SDK (deliberate):** `../hexposed-sdk` ships *no* address book —
> callers pass addresses, because its contracts are per-round and redeployed (a factory tracks the
> current round). GoL's deployments are stable singletons per network, so baking the book is a net
> convenience; the caller override keeps the local/custom-deploy path open.

## 5. Typed bindings (ABI → Rust via cainome)

- A `build.rs` (or a checked-in `cainome` codegen step) reads the four (+ optional bench)
  `*.contract_class.json` from `target/dev` and generates Rust call/return bindings into
  `src/abi/`. [`cainome`](https://github.com/cartridge-gg/cainome) is the Rust ABI binder
  (abigen) — the analog of abi-wan-kanabi — with `cainome-cairo-serde` providing `U256` etc.
- An un-synced contract change becomes a **compile error**, not a runtime surprise.
- This supersedes the hand-rolled `node -e '…'` ABI extraction in development.md §"ABIs".

> **Divergence from the sibling SDK (deliberate):** `../hexposed-sdk` hand-writes selectors and
> decoders — justified there by a small, stable, privacy-sensitive interface. GoL's surface is far
> larger (full ERC721 + ERC20 + AccessControl + the engine views), so cainome codegen earns its
> keep. Borrow their lesson regardless: layer thin, **fixture-tested** domain decoders for the
> structs that matter (`LifeformData`, `MoveMessage`) on top of the generated types, with versioned
> handling so a layout change is a failing test, not a silent misread.

## 6. Public API reference

`Felt` is `starknet_types_core::felt::Felt`; `U256` is `cainome_cairo_serde::U256` (the packed grid
state is a Cairo `u256`). Async traits use `#[async_trait]`. Seams are `Box<dyn _>` for runtime
swapping and a clean WASM boundary (generics like the sibling's `Client<P,S,R>` are an option if
monomorphization is preferred).

### 6.1 Client construction

```rust
let gol = GolClient::builder(GolConfig::for_network(Network::Sepolia))
    .reader(RpcReader::new(&rpc_url))         // or an indexer-backed DataSource
    .submitter(StrkdSubmitter::new(&strkd))   // native; web signs in JS (§7)
    .prover(Some(HttpProofProvider::new(&dinner_url))) // optional; experimental (§6.6)
    .build()?;
```

```rust
pub struct GolClient {
    pub config:   GolConfig,
    pub provider: JsonRpcClient<HttpTransport>,
    reader:    Box<dyn Reader>,
    submitter: Box<dyn Submitter>,
    prover:    Option<Box<dyn Prover>>,
}

impl GolClient {
    pub fn builder(config: GolConfig) -> GolClientBuilder;
    pub fn reads(&self) -> &dyn Reader;
    pub fn writes(&self) -> GolWrites<'_>;             // pure call builders (no signer)
    pub async fn submit(&self, calls: &[Call], opts: SubmitOpts) -> Result<SubmitResult, GolError>;
}
```

Reads work without a submitter. The `submitter` only binds at `submit()` time — or never, if the
caller takes the built `Call`s and signs them itself (the web path, §7).

### 6.2 Domain types

```rust
pub struct LifeformData {              // from get_lifeform_data → LifeFormData
    pub is_loop: bool, pub is_still: bool, pub is_alive: bool, pub is_dead: bool,
    pub sequence_length: u32,
    pub current_state: U256,           // packed grid
    pub age: u32,
}
pub struct OwnedLifeform { pub token_id: Felt, pub owner: Felt, pub data: LifeformData }
pub struct PartialPathData { pub entrypoint: U256, pub exitpoint: U256, pub length: u32, pub trigger_state: U256, pub smallest_element: U256 }
pub struct TokenUri { pub raw: String, pub name: Option<String>, pub description: Option<String>, pub image: Option<String>, pub attributes: Vec<TraitValue> }
pub struct LoopCheck { pub ok: bool, pub smallest: U256, pub sequence: Vec<U256> }
```

### 6.3 Reads — `Reader`

```rust
#[async_trait]
pub trait Reader: Send + Sync {
    // NFT / lifeform
    async fn grid_size(&self) -> Result<u32, GolError>;
    async fn lifeform(&self, token_id: Felt) -> Result<Option<OwnedLifeform>, GolError>; // owner_of + data; None if unminted
    async fn lifeform_data(&self, token_id: Felt) -> Result<Option<LifeformData>, GolError>;
    async fn owner_of(&self, token_id: Felt) -> Result<Option<Felt>, GolError>;
    async fn token_uri(&self, token_id: Felt) -> Result<Option<TokenUri>, GolError>;     // + base64 decode

    // NUT (ERC20)
    async fn nut_balance(&self, addr: Felt) -> Result<U256, GolError>;
    async fn nut_allowance(&self, owner: Felt, spender: Felt) -> Result<U256, GolError>;

    // on-chain GoL engine views (off-chain discovery stays in the app)
    async fn iterate_once(&self, state: U256) -> Result<U256, GolError>;
    async fn iterate_several(&self, state: U256, generations: u32) -> Result<Vec<U256>, GolError>;
    async fn is_single_loop(&self, state: U256, generations: u32) -> Result<LoopCheck, GolError>;
    async fn compute_partial_path(&self, initial: U256, trigger: U256, generations: u32) -> Result<PartialPathData, GolError>;
    async fn pack_grid(&self, grid: &[Vec<bool>]) -> Result<U256, GolError>;
    async fn unpack_grid(&self, state: U256) -> Result<Vec<Vec<bool>>, GolError>;

    /// Escape hatch for view functions not surfaced above (mirrors hexposed-sdk's `raw_call`).
    async fn call(&self, target: ContractKey, entrypoint: &str, calldata: &[Felt]) -> Result<Vec<Felt>, GolError>;
}
```

> The engine views let an app validate a candidate loop/path id **on-chain** before paying to mint;
> the off-chain *search* (which states to check) is an app concern.

### 6.4 Writes — call builders + the `Submitter` seam

`GolWrites` builds composable `Call`s; mint flows return `[approve, mint]`. Nothing is signed until
a `Submitter` takes the calls.

```rust
impl GolWrites<'_> {
    pub fn approve_nut(&self, spender: Felt, amount: U256) -> Call;
    pub fn mint_loop(&self, loop_id: U256, loop_length: u32, recipient: Felt) -> Vec<Call>;  // [approve, mint_loop]
    pub fn mint_path(&self, path_id: U256, length_to_loop: u32, loop_entry: U256, loop_length: u32, recipient: Felt) -> Vec<Call>;
    pub fn mint_partial_path(&self, minter: Minter, path_start: U256, path_length: u32, trigger_state: U256) -> Call;
    pub fn combine_partial_path(&self, minter: Minter, id1: U256, id2: U256) -> Call;
    pub fn mint_loop_from_partial_paths(&self, loop_id: U256, recipient: Felt) -> Call;
    pub fn mint_path_from_partial_paths(&self, path_id: U256, recipient: Felt) -> Call;
    pub fn breathe_life(&self, token_id: Felt) -> Call;       // move_lifeform_forward
    pub fn transfer(&self, from: Felt, to: Felt, token_id: Felt) -> Call;
}

// pricing — single source of truth (centralizes the formula duplicated in today's useGol)
pub fn nut_cost_for_loop(loop_length: u32, decimals: u32) -> U256;   // loop_length * 10^decimals
pub fn nut_cost_for_path(length_to_loop: u32, decimals: u32) -> U256;
```

The **`Submitter` seam** decouples "what call" from "who signs and how it's broadcast" — mirroring
the sibling's `submit(call, Option<proof>)`, the optional proof folds the SNIP-36 verify (§6.6)
into the normal path.

```rust
#[async_trait]
pub trait Submitter: Send + Sync {
    async fn submit(&self, calls: &[Call], opts: SubmitOpts) -> Result<SubmitResult, GolError>;
}
pub struct SubmitOpts { pub proof: Option<String>, pub proof_facts: Option<Vec<Felt>>, pub resource_bounds: Option<ResourceBounds>, pub nonce: Option<Felt> }
pub struct SubmitResult { pub transaction_hash: Felt }

// native impls (TUI, scripts, dev):
pub struct LocalKeySubmitter { /* starknet-signers SingleOwnerAccount */ }
pub struct StrkdSubmitter    { /* HTTP to the strkd loopback companion; sign-only or submit */ }
// web: signing is delegated to the JS wallet — see §7 (no Rust submitter on the wasm path).
// future: PaymasterSubmitter / SNIP-9 outside-execution — additive, no API change.
```

> **NUT pricing caveat:** the `loop_length`/`length_to_loop` × 10^18 formula is lifted from the
> current `useGol`. Confirm against the minters and keep it only here (flag for the audit).

### 6.5 `DataSource` — ownership & enumeration

The NFT isn't `Enumerable`, so "my lifeforms" is reconstructed. A trait so the event-scan impl
swaps for an indexer (Phase 4) with no API change — exactly as the sibling ships both an RPC reader
and a Starkscan/indexer-backed reader behind one trait.

```rust
#[async_trait]
pub trait DataSource: Send + Sync {
    async fn owned_lifeforms(&self, owner: Felt) -> Result<Vec<OwnedLifeform>, GolError>;
    async fn lifeform(&self, token_id: Felt) -> Result<Option<OwnedLifeform>, GolError>;
    async fn activity(&self, token_id: Option<Felt>, limit: u32) -> Result<Vec<MoveEvent>, GolError>; // NewMove feed
}
pub struct MoveEvent { pub token_id: Felt, pub age: u32, pub block_number: u64, pub tx_hash: Felt }

pub struct EventScanDataSource { /* … */ }   // now; later: IndexerDataSource
```

**Event-scan impl note (fixes a real bug):** track the ERC721 `Transfer` event (authoritative
ownership — `from`, `to`, `token_id`), not just `NewLifeForm` (mint only), which misses lifeforms
received via transfer. Use `NewLifeForm` for initial metadata, `NewMove` for activity. Paginate via
the continuation token; expose a `from_block`. Log the scan ceiling — silent truncation reads as
"complete" when it isn't.

### 6.6 Proofs — SNIP-36 move-forward-N (forward-looking, `prover` module)

> ⚠️ **Dependency / status.** `prove_move_forward_n` / `verify_move_forward` and `MoveMessage
> { start_state, final_state, generations }` exist **only on the benchmark `GolBench`**
> (`src/gol_bench.cairo`), not production `GolLifeforms` (which has single-step
> `move_lifeform_forward`). This module works against a deployed `GolBench` today and is
> product-ready only once the NFT exposes an equivalent verify entrypoint. Signing is **external**;
> the SDK never holds keys and never runs the prover. See the SNIP-36 skill and STATUS.md.

```rust
#[async_trait]
pub trait Prover: Send + Sync {
    async fn prove(&self, req: ProveRequest) -> Result<Proof, GolError>;  // { block_number, tx }
}
pub struct Proof { pub proof: String, pub facts: Vec<Felt>, pub reference_block: u64 } // facts[8] = L2→L1 msg hash
pub struct HttpProofProvider { /* url, headers, timeout — matches the SNIP-36 server contract */ }
// dinner / the reference server / a future hosted prover all satisfy `Prover`.

pub struct MoveMessage { pub start_state: U256, pub final_state: U256, pub generations: u32 }
pub fn build_virtual_move_forward(bench: Felt, start_state: U256, generations: u32) -> Call; // virtual; signed sign-only
pub fn resource_bounds_for_generations(n: u32, prices: &GasPrices) -> ResourceBounds;        // formula, no estimate_fee
pub fn decode_move_message(payload: &[Felt]) -> Result<MoveMessage, GolError>;
pub fn build_verify_move_forward(bench: Felt, msg: &MoveMessage) -> Call;
pub fn move_message_hash(bench: Felt, msg: &MoveMessage) -> Felt;                            // poseidon; must match Cairo
```

End-to-end (matches the validated benchmark round-trip): build the virtual call → sign-only via
`strkd` (**the prover's chain id must be pinned** — a mismatch reads as "invalid signature", the
gotcha the sibling hit on mainnet) → `provider.block_number()` → `prover.prove(...)` →
`decode_move_message(msg)` → **assert `facts[8] == move_message_hash(bench, msg)` before paying
gas** (fail-fast; `GolError::Proving("PROOF_MESSAGE_MISMATCH")`) → `build_verify_move_forward` →
`gol.submit(&[verify], SubmitOpts { proof, proof_facts, .. })`. The remote prover may prove against
a slightly different block than requested — trust the reference block in the returned facts, as the
sibling's `RemoteProver` does.

### 6.7 Errors

```rust
// One enum, a handful of categories (mirrors hexposed-sdk's 5-variant SdkError) — callers
// match on the variant, not on dozens of codes.
#[derive(thiserror::Error, Debug)]
pub enum GolError {
    #[error("config: {0}")]     Config(String),     // missing address/rpc for the network
    #[error("input: {0}")]      Input(String),      // out-of-range arg, etc.
    #[error("encoding: {0}")]   Encoding(String),   // calldata/felt/decode failure
    #[error("read: {0}")]       Read(String),       // RPC / view call failure
    #[error("submission: {0}")] Submission(String), // gateway reject, signing, balance
    #[error("proving: {0}")]    Proving(String),    // prover error (SNIP36_* code) or proof_facts[8] mismatch
}
```

Reads that "miss" return `Ok(None)` (e.g. an unminted token) — not an error. Proof-server failures
carry their `SNIP36_*` reason in the `Proving` string; a `facts[8]` mismatch is
`Proving("PROOF_MESSAGE_MISMATCH")`.

### 6.8 Events & selectors

```rust
pub mod events {
    pub const NEW_LIFE_FORM: &str = "NewLifeForm";   // (owner, token_id, lifeform_data)
    pub const NEW_MOVE:      &str = "NewMove";        // (token_id, age)
    pub const TRANSFER:      &str = "Transfer";       // ERC721 (from, to, token_id)
    pub fn selector(name: &str) -> Felt;              // sn_keccak
    pub fn decode_new_life_form(ev: &EmittedEvent) -> Result<(Felt, Felt, LifeformData), GolError>;
    pub fn decode_new_move(ev: &EmittedEvent) -> Result<MoveEvent, GolError>;
    pub fn decode_transfer(ev: &EmittedEvent) -> Result<(Felt, Felt, Felt), GolError>;
}
```

## 7. WASM web binding — `gol-sdk-wasm` (the JS frontend's view)

The web frontend imports an npm package built from a thin `wasm-bindgen` wrapper over `gol-sdk`
(`wasm` feature). The wrapper exposes **reads + call-building + proofs**; **signing/submit stays in
JS**, because browser wallets (ArgentX/Braavos via `get-starknet`) are reachable only from JS.

```rust
#[wasm_bindgen]
pub struct GolSdk { inner: GolClient }

#[wasm_bindgen]
impl GolSdk {
    #[wasm_bindgen(constructor)]
    pub fn new(network: &str, rpc_url: Option<String>) -> Result<GolSdk, JsValue>; // RpcReader; no submitter

    // reads → JS values (serde-wasm-bindgen)
    pub async fn lifeform(&self, token_id: JsValue) -> Result<JsValue, JsValue>;
    pub async fn nut_balance(&self, addr: String) -> Result<JsValue, JsValue>;
    pub async fn owned_lifeforms(&self, owner: String) -> Result<JsValue, JsValue>;

    // writes → return the calls for the JS wallet to sign + send
    pub fn mint_loop_calls(&self, loop_id: JsValue, loop_length: u32, recipient: String) -> Result<JsValue, JsValue>; // Call[]
    pub fn breathe_life_call(&self, token_id: JsValue) -> Result<JsValue, JsValue>;
}
```

Frontend usage — the SDK builds, the wallet signs:

```ts
import init, { GolSdk } from "@gol/sdk";        // wasm-pack output
await init();
const sdk = new GolSdk("sepolia");
const lf  = await sdk.lifeform(tokenId);         // read, all-Rust
const calls = sdk.mint_loop_calls(loopId, len, recipient);
await walletAccount.execute(calls);              // get-starknet wallet signs + broadcasts (JS)
```

So the frontend keeps `get-starknet` + a minimal starknet.js *only* for the wallet account's
`execute`. Everything else — encoding, decoding, address book, engine views, proofs — is the shared
Rust crate. The **native TUI** uses `LocalKeySubmitter`/`StrkdSubmitter` instead and needs no JS.

> WASM caveats to budget for: starknet-rs needs a **fetch-based transport** under `wasm32` (no
> native sockets/tokio); `wasm-bindgen-futures` for async; `serde-wasm-bindgen` for marshaling;
> `U256`/`Felt` cross the boundary as strings/JSON; and `wasm-pack` joins the frontend build.

## 8. ABI sync & build pipeline

```bash
scarb build                                   # → target/dev/*.contract_class.json (ABI source)
cargo build -p gol-sdk                         # build.rs runs cainome → src/abi/*
cargo test  -p gol-sdk                         # §9
wasm-pack build crates/gol-sdk-wasm --target web --out-dir pkg   # → npm package for the frontend
```

CI runs `scarb build` + `cargo build` + `cargo test`; it fails if cainome output drifts
(uncommitted `git diff` in `src/abi/`). Add a `wasm-pack build` job so the web package never breaks.

## 9. Testing

- **Unit (`cargo test`, no chain):** domain decoders (`LifeformData`, `PartialPathData`, `TokenUri`
  base64), `nut_cost_for_*`, call-builder shape (selector + calldata), and `move_message_hash`
  against a **real Sepolia fixture** (a known on-chain `verify_move_forward` tx), mirroring
  hexposed-sdk's `encoding.rs` fixture tests.
- **Read integration (Sepolia, gated):** `grid_size`, the minted lifeform (`98307`), `nut_balance`,
  `token_uri` decodes to JSON+SVG, `iterate_once` matches a known still-life/blinker.
- **Write integration (gated, opt-in):** build → sign-only via `strkd` → submit a `mint_loop` of a
  known small loop; assert the `NewLifeForm` event. Gated behind an env flag so CI doesn't spend.
- **WASM (`wasm-pack test --headless`):** the binding builds, a read round-trips, call-building
  returns well-formed `Call`s.
- **Proof integration (gated, manual):** the GolBench round-trip via `dinner` + `strkd`.

## 10. Implementation plan (phases + checklist)

**Phase A — scaffold & ABI pipeline**
- [ ] Add the `Cargo.toml` workspace; create `crates/gol-sdk` (starknet-rs, cainome, thiserror, async-trait) with `native`/`wasm`/`prover-http` features.
- [ ] `build.rs` cainome codegen from `target/dev`; CI `cargo build`/`test` + drift check.

**Phase B — config, types, reads**
- [ ] `config.rs` address book (§4) + `GolClient::builder`.
- [ ] `types.rs` domain types + decoders; `token_uri` base64 decode.
- [ ] `Reader` + `RpcReader` incl. NUT reads and the engine views; read-integration tests on Sepolia.

**Phase C — writes & submission**
- [ ] `GolWrites` call builders (mint loop/path, partial-path flow, `breathe_life`, transfers, approvals).
- [ ] `nut_cost_for_*` (confirm formula vs contract); `Submitter` trait + `LocalKeySubmitter` + `StrkdSubmitter`; `gol.submit()`.
- [ ] Gated write-integration test (mint a known loop via `strkd`).

**Phase D — data source**
- [ ] `DataSource` trait; `EventScanDataSource` (Transfer-authoritative, paginated, `from_block`); `activity` over `NewMove`. Indexer impl deferred to Phase 4.

**Phase E — WASM web binding**
- [ ] `crates/gol-sdk-wasm` wrapper (reads + call-building); `wasm-pack` output as an npm package; `wasm-pack test`.

**Phase F — proofs (experimental)**
- [ ] `Prover` + `HttpProofProvider` + move-forward helpers (§6.6); validate the GolBench round-trip via `dinner` + `strkd`. Mark product-blocked on a production verify entrypoint.

**Phase G — frontend migration** (§11)
- [ ] Frontend imports `@gol/sdk` (wasm-pack pkg); replace `contracts.ts`/`useGol` reads + call-building with the SDK; keep `get-starknet` for wallet `execute`. `npm run build` passes.

## 11. Frontend migration (consume the WASM package)

| Today (`useGol`) | With the Rust SDK |
|---|---|
| `contracts.ts` (ADDRESSES, RPC, contracts) | `new GolSdk("sepolia")` (WASM) |
| `mintLoop(loopId, len, to)` | `const calls = sdk.mint_loop_calls(...)` → `walletAccount.execute(calls)` |
| `moveForward(tokenId)` | `walletAccount.execute(sdk.breathe_life_call(tokenId))` |
| `getNutBalance(addr)` | `await sdk.nut_balance(addr)` |
| `getLifeform(id)` | `await sdk.lifeform(id)` |
| `listOwnedLifeforms(owner)` | `await sdk.owned_lifeforms(owner)` (now Transfer-correct) |
| hand-written `LifeformData` + `parseLifeform` | SDK types via `serde-wasm-bindgen` |

Wallet connect (`get-starknet`, `wallet.tsx`) and the wallet account's `execute` stay in JS; the
SDK only builds the calls. The `useGol` hook becomes a thin wrapper around `GolSdk` + the wallet.

## 12. Open questions / out of scope

- **Publish identity:** the npm package name/scope (and whether to publish the crate to crates.io)
  before any release. Until then, `file:`/`workspace` links.
- **Seam dispatch:** `Box<dyn _>` (chosen, WASM-friendly) vs generics `Client<P,S,R>` (sibling's
  zero-cost choice) — revisit if profiling shows dyn dispatch matters.
- **Indexer backend:** custom vs Apibara/Checkpoint — decided when Phase 4 starts; the `DataSource`
  trait is the seam.
- **Product proving:** whether/when production `GolLifeforms` gains a verify-move-forward entrypoint.
  Until then, the prover module targets `GolBench` only.
- **NUT pricing source of truth:** confirm against the minters; fold into the pre-mainnet audit.
- **TUI stack (future):** `ratatui` + `crossterm`, consuming this crate natively — not part of v1.
- **Relayed / gasless submission:** a future `Submitter` could wrap calls in SNIP-9
  outside-execution (as the sibling backend does) or a paymaster. Additive via the seam.
