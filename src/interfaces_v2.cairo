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

/// A path creature's life state — what it converges to. See docs/path-creatures-spec.md.
///  * `Alive`  — settles into a dynamic loop (period > 1).
///  * `Frozen` — settles into a still life (period-1, non-empty).
///  * `Dead`   — settles into the empty grid.
/// Store: unit-variant enum stores as a felt; `Alive` is the zero/default variant.
#[derive(Drop, Copy, Serde, PartialEq, starknet::Store)]
pub enum LifeState {
    // `#[default]` is the value an uninitialized storage slot deserializes to; all reads are guarded
    // by `exists(token_id)` so it's only a formality, but the Store derive requires one.
    #[default]
    Alive,
    Frozen,
    Dead,
}

/// Per-token record for a PATH creature (a transient that leads into a loop but isn't in it).
/// `token_id = token_hash(start_state)`. Paths are static snapshots — NOT feedable, no `age`.
/// `minted_at` + `escrow` are stamped by the NFT contract at mint; the minter leaves them 0.
#[derive(Drop, Copy, Serde, starknet::Store)]
pub struct PathFormData {
    pub life_state: LifeState,
    /// distance to the loop: generations from start until it first enters the terminal loop (>=1).
    pub sequence_length: usize,
    /// the path's starting state (identity preimage).
    pub start_state: GridState,
    /// token_hash of the terminal the path settles into (canonical loop / still / empty state).
    pub target_loop_id: felt252,
    /// the terminal loop's period (1 for frozen/dead).
    pub target_period: usize,
    /// block timestamp at mint — the direction guard for sub-path burning.
    pub minted_at: u64,
    /// NUT held for this token (= sequence_length * 1e18); paid to a successful challenger on burn.
    pub escrow: u256,
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
    /// Mint order (strictly increasing from 1). 0 = minted before the nonce upgrade
    /// ("grandfathered": tied oldest tier — cannot burn each other, can burn any later copy).
    fn get_mint_nonce(self: @TContractState, token_id: u256) -> u64;
    /// Permissionless anti-copy burn (docs/symmetry-challenge-spec.md). Burns loop `b_token_id`
    /// iff loop `a_token_id` is strictly older (mint nonce) and the witness relates them:
    /// `token_id(apply_symmetry(d4, dr, dc, step^k(a_state))) == b_token_id`, where `a_state`
    /// is A's canonical state (checked against A's token id) and `k < period` selects the phase.
    /// Bounty: `b.sequence_length` NUT freshly minted to the caller.
    fn challenge_burn(
        ref self: TContractState,
        a_token_id: u256,
        b_token_id: u256,
        a_state: GridState,
        d4: u8,
        dr: u32,
        dc: u32,
        k: u32,
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

#[starknet::interface]
pub trait IGolPathLifeFormsV2<TContractState> {
    /// Mint a path lifeform. Guarded: only MINTER_ROLE (the path minter). The contract stamps
    /// `minted_at` and escrows `sequence_length` NUT from `minter`, overriding those fields on input.
    fn mint(
        ref self: TContractState,
        recipient: ContractAddress,
        minter: ContractAddress,
        token_id: u256,
        path_data: PathFormData,
    );
    fn get_path_data(self: @TContractState, token_id: u256) -> PathFormData;
    fn get_grid_size(self: @TContractState) -> u32;
    fn get_render_params(self: @TContractState, token_id: u256) -> RenderParams;
    /// Owner-only: customise a token's render params. Asserts bg != cell and 0 < speed < SPEED_MAX.
    fn set_render_params(ref self: TContractState, token_id: u256, bg: u32, cell: u32, speed: u16);
    /// Mint order (strictly increasing from 1). 0 = minted before the nonce upgrade
    /// ("grandfathered": tied oldest tier — cannot burn each other, can burn any later copy).
    fn get_mint_nonce(self: @TContractState, token_id: u256) -> u64;
    /// Permissionless anti-farm/anti-copy burn (generalized per docs/symmetry-challenge-spec.md):
    /// burn `younger_id` iff `older_id` was minted strictly earlier (mint nonce) and the witness
    /// relates them: `token_id(apply_symmetry(d4, dr, dc, step^k(older.start))) == younger_id`
    /// with `k = older.sequence_length - younger.sequence_length`. `(0,0,0)` witness = the
    /// original forward sub-path rule. Pays the burned path's escrowed NUT to the caller.
    fn challenge_burn(
        ref self: TContractState, older_id: u256, younger_id: u256, d4: u8, dr: u32, dc: u32,
    );
}
