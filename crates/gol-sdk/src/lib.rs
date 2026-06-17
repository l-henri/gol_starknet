//! `gol-sdk` — Rust SDK for the gol_starknet contracts.
//!
//! One crate of chain logic shared by every consumer — the web frontend (compiled to WASM) and a
//! future native TUI. Composed over three dependency-injected seams: [`Reader`] (reads), the
//! `Submitter` (sign + broadcast), and the prover (SNIP-36). See `docs/sdk-plan.md`.
//!
//! v1 surface (this cut): reads + on-chain engine views ([`RpcReader`]), call builders
//! ([`GolWrites`]), the address book ([`config`]), and the encoding primitives ([`encoding`]).
//! The `Submitter` trait is defined with a strkd placeholder; the prover module, ByteArray
//! `token_uri` decoding, the `DataSource`, and the WASM wrapper are follow-ups.

pub mod client;
pub mod config;
pub mod encoding;
pub mod error;
pub mod events;
pub mod reader;
pub mod rpc;
pub mod submit;
pub mod types;
pub mod writes;

pub use client::GolClient;
pub use config::{deployments, ContractKey, GolAddresses, GolConfig, Network};
pub use error::GolError;
pub use reader::Reader;
pub use rpc::RpcReader;
pub use submit::{StrkdSubmitter, SubmitOpts, SubmitResult, Submitter};
pub use types::{
    Call, Felt, LifeformData, LoopCheck, MoveMessage, OwnedLifeform, PartialPathData, U256,
};
pub use writes::{nut_cost_for_loop, nut_cost_for_path, GolWrites, Minter};

/// Minimal `0x…` hex for a felt (e.g. printing an owner address).
pub fn felt_to_hex(f: &Felt) -> String {
    types::felt_hex(f)
}
