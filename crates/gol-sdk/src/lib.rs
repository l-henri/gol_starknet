//! `gol-sdk` — Rust SDK for the gol_starknet contracts.
//!
//! One crate of chain logic shared by every consumer — the web frontend (compiled to WASM) and a
//! future native TUI. Composed over three dependency-injected seams: [`Reader`] (reads), the
//! `Submitter` (sign + broadcast), and the prover (SNIP-36). See `docs/sdk-plan.md`.
//!
//! v2 surface: targets the v2 contracts (41×41 grid; state is the 7-felt [`GridState`]; the ERC-721
//! `token_id` is the Poseidon hash of the canonical state, computable off-chain via [`token_id`]).
//! Includes the pure off-chain engine — [`grid`] (bitboard stepper, packing, hashing) and [`engine`]
//! (loop/path discovery), faithful ports of the on-chain Cairo — plus reads ([`RpcReader`], decoding
//! `GridState`/render-params and the raw-JSON `token_uri`), call builders ([`GolWrites`]), the
//! address book ([`config`]), the [`DataSource`] (event-scan + indexer), and the WASM wrapper. The
//! `Submitter` (sign + broadcast) stays a strkd-backed seam; the SNIP-36 prover is a follow-up.

pub mod client;
pub mod config;
pub mod datasource;
pub mod encoding;
pub mod engine;
pub mod error;
pub mod grid;
pub mod events;
pub mod metadata;
pub mod reader;
pub mod rpc;
pub mod submit;
pub mod types;
pub mod writes;

pub use client::GolClient;
pub use config::{deployments, ContractKey, GolAddresses, GolConfig, Network};
pub use datasource::{DataSource, EventScanDataSource, IndexerDataSource, MoveEvent};
pub use engine::{
    classify_fate, combine_partial_path, compute_partial_path, find_loop, is_single_loop,
    is_single_loop_and_entrypoint_is_smallest, step_to, Fate, LoopInfo, PartialPathData, PathFate,
};
pub use error::GolError;
pub use grid::{step, token_hash, token_id, GridState, Rows, MASK, N};
pub use reader::Reader;
pub use rpc::RpcReader;
pub use submit::{StrkdSubmitter, SubmitOpts, SubmitResult, Submitter};
pub use types::{
    Call, Felt, LifeState, LifeformData, MoveMessage, OwnedLifeform, OwnedPath, PathForm,
    RenderParams, TokenAttribute, TokenUri, U256,
};
pub use writes::{nut_cost_for_loop, nut_cost_for_path, GolWrites, MintPlan, MintStep, Minter};

/// Minimal `0x…` hex for a felt (e.g. printing an owner address).
pub fn felt_to_hex(f: &Felt) -> String {
    types::felt_hex(f)
}
