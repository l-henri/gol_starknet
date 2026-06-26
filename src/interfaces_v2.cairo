//! v2 contract interfaces. The grid state is now a multi-felt `GridState` (gol_grid_v2) instead of
//! a `u256`; the ERC-721 `token_id` is the Poseidon hash of the canonical state. See
//! `docs/v2-grid-redesign.md`.

use starknet::ContractAddress;
use gol_starknet::gol_grid_v2::GridState;

/// Exclusive upper bound on a lifeform's display speed (generations/second): valid speed in [1,200).
pub const SPEED_MAX: u16 = 200;

/// Per-token render parameters. Colors are 24-bit 0xRRGGBB; speed is generations/second.
/// Invariant (enforced at mint-derivation and in set_render_params): bg != cell, 0 < speed < SPEED_MAX.
/// A stored speed of 0 is the "unset" sentinel -> the renderer falls back to derive_params(token_id).
#[derive(Drop, Serde, Copy, starknet::Store, PartialEq)]
pub struct RenderParams {
    pub bg: u32,
    pub cell: u32,
    pub speed: u16,
}

/// Per-token lifeform record. Identical to v1 except `current_state` is now a `GridState`.
#[derive(Drop, Serde, Copy, starknet::Store)]
pub struct LifeFormData {
    pub is_loop: bool,
    pub is_still: bool,
    pub is_alive: bool,
    pub is_dead: bool,
    pub sequence_length: usize,
    pub current_state: GridState,
    pub age: u32,
}

#[starknet::interface]
pub trait IGolLifeFormsV2<TContractState> {
    /// Mint a lifeform. Guarded: only MINTER_ROLE (the minter contracts).
    fn mint(
        ref self: TContractState,
        recipient: ContractAddress,
        minter: ContractAddress,
        token_id: u256,
        lifeform_data: LifeFormData,
    );
    fn get_lifeform_data(self: @TContractState, token_id: u256) -> LifeFormData;
    /// Advance a minted lifeform one generation and mint 1 NUT to the caller. Intentionally public.
    fn move_lifeform_forward(ref self: TContractState, token_id: u256);
    /// Advance a minted lifeform `n` generations in ONE call and mint `n` NUT to the caller — a
    /// cheaper single-tx batch of move_lifeform_forward (one state read/write + one mint).
    /// Intentionally public, like the single-step version.
    fn move_lifeform_forward_n(ref self: TContractState, token_id: u256, n: u32);
    /// Grid edge length (for SDK/frontend; replaces v1's component getter).
    fn get_grid_size(self: @TContractState) -> u32;
    /// Render params for a token: the stored ones, or (if unset) those derived from its token_id.
    fn get_render_params(self: @TContractState, token_id: u256) -> RenderParams;
    /// Owner-only: customise a token's render params. Asserts bg != cell and 0 < speed < SPEED_MAX.
    fn set_render_params(
        ref self: TContractState, token_id: u256, bg: u32, cell: u32, speed: u16,
    );
}

#[starknet::interface]
pub trait IGolLoopMinterV2<TContractState> {
    /// Mint a loop: `loop_state` must be a single loop of `loop_length` AND its canonical (smallest)
    /// state. Public — the verification is the gate.
    fn mint_loop(
        ref self: TContractState, loop_state: GridState, loop_length: usize, recipient: ContractAddress,
    ) -> bool;
    fn mint_partial_path(
        ref self: TContractState, path_start: GridState, path_length: usize, trigger_state: GridState,
    );
    fn combine_partial_path(
        ref self: TContractState, partial_path_id_1: felt252, partial_path_id_2: felt252,
    );
    /// `loop_state` = the loop's canonical (smallest) state; the registry key is its `token_hash`.
    fn mint_loop_from_partial_paths(
        ref self: TContractState, loop_state: GridState, recipient: ContractAddress,
    );
}

#[starknet::interface]
pub trait IGolPathMinterV2<TContractState> {
    /// Mint a path: `path_start` reaches a loop of `loop_length` after `length_to_loop_entrypoint`
    /// steps, entering it from outside. Public — the verification is the gate.
    fn mint_path(
        ref self: TContractState,
        path_start: GridState,
        length_to_loop_entrypoint: usize,
        loop_length: usize,
        recipient: ContractAddress,
    ) -> bool;
    fn mint_partial_path(
        ref self: TContractState, path_start: GridState, path_length: usize, trigger_state: GridState,
    );
    fn combine_partial_path(
        ref self: TContractState, partial_path_id_1: felt252, partial_path_id_2: felt252,
    );
    /// `path_start` = the path's starting state; the registry key is its `token_hash`.
    fn mint_path_from_partial_paths(
        ref self: TContractState, path_start: GridState, recipient: ContractAddress,
    );
}
