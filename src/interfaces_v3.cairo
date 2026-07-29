//! v3 contract interfaces — the ORBIT-CANONICAL identity model (docs/v3-identity-spec.md).
//!
//! `token_id = Poseidon(orbit canonical)`: the lexicographically smallest member of the creature's
//! full symmetry family (13,448 torus symmetries; for loops additionally × every phase of the
//! cycle). Symmetry copies therefore collide on the id and revert at mint. The chain verifies
//! FAMILY MEMBERSHIP exactly (one witness transform); only MINIMALITY is optimistic, defended by
//! `prove_malformed` (permanent, escrow-staked). Data shapes (`LifeFormData`, `PathFormData`,
//! `RenderParams`) are reused from v2; the drawn state stays in them for display, the canonical is
//! stored alongside as the identity preimage.

use starknet::ContractAddress;
use gol_starknet::gol_grid_v2::GridState;
use gol_starknet::interfaces_v2::{LifeFormData, PathFormData, RenderParams};

#[starknet::interface]
pub trait IGolLifeFormsV3<TContractState> {
    /// Mint a loop lifeform. Guarded: MINTER_ROLE (the loop minter). `lifeform_data.current_state`
    /// is the DRAWN state (display); `canonical` is the verified orbit-canonical (identity
    /// preimage — `token_id` must equal its Poseidon hash; the minter guarantees family
    /// membership). The contract records `sequence_length` NUT from `minter` as this token's
    /// escrow (the `prove_malformed` bounty; unchallenged escrow is the sink).
    fn mint(
        ref self: TContractState,
        recipient: ContractAddress,
        minter: ContractAddress,
        token_id: u256,
        lifeform_data: LifeFormData,
        canonical: GridState,
    );
    fn get_lifeform_data(self: @TContractState, token_id: u256) -> LifeFormData;
    /// The identity preimage: the orbit-canonical state this token's id hashes.
    fn get_canonical_state(self: @TContractState, token_id: u256) -> GridState;
    /// NUT escrowed at mint for this token (the fraud-proof bounty).
    fn get_escrow(self: @TContractState, token_id: u256) -> u256;
    /// Mint order (strictly increasing from 1).
    fn get_mint_nonce(self: @TContractState, token_id: u256) -> u64;
    /// Block timestamp at mint. 0 = minted before the minted_at upgrade (grandfathered, like
    /// nonce 0). Kept in its own map (not LifeFormData) so the shared v2 struct stays untouched.
    fn get_minted_at(self: @TContractState, token_id: u256) -> u64;
    /// The human who discovered this creature (mint's escrow payer — the caller of the minter
    /// contract, not the recipient). Zero address = grandfathered. Permanent artist attribution.
    fn get_discoverer(self: @TContractState, token_id: u256) -> ContractAddress;
    /// Advance one generation; mints 1 NUT to the caller. Public.
    fn move_lifeform_forward(ref self: TContractState, token_id: u256);
    /// Advance `n` generations in one call; mints `n` NUT to the caller. Public.
    fn move_lifeform_forward_n(ref self: TContractState, token_id: u256, n: u32);
    /// Advance `n` generations with the NUT reward minted to `beneficiary` — for caretaker
    /// contracts (pets) feeding on a human's behalf. Public (ride-along, v3-identity-spec §3).
    fn move_lifeform_forward_n_for(
        ref self: TContractState, token_id: u256, n: u32, beneficiary: ContractAddress,
    );
    fn get_grid_size(self: @TContractState) -> u32;
    fn get_render_params(self: @TContractState, token_id: u256) -> RenderParams;
    fn set_render_params(ref self: TContractState, token_id: u256, bg: u32, cell: u32, speed: u16);
    /// Permanent minimality fraud-proof: exhibit `(g, k)` with
    /// `apply_symmetry(g, step^k(canonical)) < canonical` (`k < period`). Burns the token and
    /// pays its escrow to the caller. Public — the on-chain check is the gate.
    fn prove_malformed(
        ref self: TContractState, token_id: u256, d4: u8, dr: u32, dc: u32, k: u32,
    );
}

#[starknet::interface]
pub trait IGolWanderersV3<TContractState> {
    /// Mint a wanderer (path creature). Guarded: MINTER_ROLE. `path_data.start_state` is the
    /// DRAWN start (display); `canonical` the verified orbit-canonical of the start. The contract
    /// stamps `minted_at`, the mint nonce, and escrows `sequence_length` NUT from `minter`.
    fn mint(
        ref self: TContractState,
        recipient: ContractAddress,
        minter: ContractAddress,
        token_id: u256,
        path_data: PathFormData,
        canonical: GridState,
    );
    fn get_path_data(self: @TContractState, token_id: u256) -> PathFormData;
    fn get_canonical_state(self: @TContractState, token_id: u256) -> GridState;
    fn get_mint_nonce(self: @TContractState, token_id: u256) -> u64;
    /// The discoverer (mint's escrow payer). Zero address = grandfathered.
    fn get_discoverer(self: @TContractState, token_id: u256) -> ContractAddress;
    fn get_grid_size(self: @TContractState) -> u32;
    fn get_render_params(self: @TContractState, token_id: u256) -> RenderParams;
    fn set_render_params(ref self: TContractState, token_id: u256, bg: u32, cell: u32, speed: u16);
    /// The TIME-direction anti-farm, carried from v2 (an id cannot collapse forward iterates):
    /// burn `younger_id` iff `older_id` is strictly older (nonce) and the witness relates their
    /// DRAWN starts: `token_id_of(apply_symmetry(g, step^k(older.start))) == hash of younger's
    /// drawn start`... see impl note: in v3 the relation is checked against younger's stored drawn
    /// start (ids are orbit hashes, so the check compares states, not ids). Pays younger's escrow.
    fn challenge_burn(
        ref self: TContractState, older_id: u256, younger_id: u256, d4: u8, dr: u32, dc: u32,
    );
    /// Permanent minimality fraud-proof (paths quotient only the orbit — no phases, so no `k`):
    /// exhibit `g` with `apply_symmetry(g, canonical) < canonical`. Burns + pays escrow.
    fn prove_malformed(ref self: TContractState, token_id: u256, d4: u8, dr: u32, dc: u32);
}

#[starknet::interface]
pub trait IGolLoopMinterV3<TContractState> {
    /// Witness-assisted single-shot loop mint. `drawn` must be a single loop of `loop_length`
    /// (verified by walking the cycle — the v2 "must be time-smallest" assert is dropped);
    /// `canonical` must satisfy `apply_symmetry(g, step^k(time_smallest)) == canonical`
    /// (`k < loop_length`, anchored on the walk's verified time-lex-min). Public.
    fn mint_loop(
        ref self: TContractState,
        drawn: GridState,
        loop_length: usize,
        canonical: GridState,
        d4: u8,
        dr: u32,
        dc: u32,
        k: u32,
        recipient: ContractAddress,
    ) -> bool;
    fn mint_partial_path(
        ref self: TContractState, path_start: GridState, path_length: usize, trigger_state: GridState,
    );
    fn combine_partial_path(
        ref self: TContractState, partial_path_id_1: felt252, partial_path_id_2: felt252,
    );
    /// Tiled finalization. `loop_state` = the loop's TIME-smallest state (the v2 walk anchor; the
    /// registry accumulator is keyed by its hash and must span the whole cycle). The phase for the
    /// witness comes from a SECOND registered segment keyed `hash(step(loop_state))` of length `k`
    /// with `trigger = canonical` when `k > 0` and `k` is too long to step inline — the contract
    /// prefers that segment when present, else steps `k` inline.
    fn mint_loop_from_partial_paths(
        ref self: TContractState,
        loop_state: GridState,
        canonical: GridState,
        d4: u8,
        dr: u32,
        dc: u32,
        k: u32,
        recipient: ContractAddress,
    );
}

#[starknet::interface]
pub trait IGolWandererMinterV3<TContractState> {
    /// Witness-assisted path mint: v2 verification on the drawn start, plus
    /// `apply_symmetry(g, drawn_start) == canonical` (paths need no phase — `k = 0`). Public.
    fn mint_path(
        ref self: TContractState,
        path_start: GridState,
        length_to_loop_entrypoint: usize,
        loop_length: usize,
        canonical: GridState,
        d4: u8,
        dr: u32,
        dc: u32,
        recipient: ContractAddress,
    ) -> bool;
    fn mint_partial_path(
        ref self: TContractState, path_start: GridState, path_length: usize, trigger_state: GridState,
    );
    fn combine_partial_path(
        ref self: TContractState, partial_path_id_1: felt252, partial_path_id_2: felt252,
    );
    fn mint_path_from_partial_paths(
        ref self: TContractState,
        path_start: GridState,
        canonical: GridState,
        d4: u8,
        dr: u32,
        dc: u32,
        recipient: ContractAddress,
    );
}

#[starknet::interface]
pub trait IGolPetBonds<TContractState> {
    /// Pet a living loop creature: feeds it ONE generation (the ceremonial breath — the NUT reward
    /// lands on the caller via `move_lifeform_forward_n_for`), mints the caller's bond for it if
    /// absent, and refreshes the caller's 7-day clock. Public.
    fn pet(ref self: TContractState, creature_id: u256);
    /// Permissionless reaper: burn `holder`'s bond on `creature_id` if it has lapsed (no pet for
    /// LAPSE_SECONDS). Reward: REAP_REWARD NUT freshly minted to the caller.
    fn reap(ref self: TContractState, creature_id: u256, holder: ContractAddress);
    /// Daycare hand-off: move the caller's bond to `to` WITHOUT resetting the clock (the sitter
    /// inherits the remaining time; their pets refresh it). Skips the ERC-1155 acceptance check so
    /// plain wallet accounts can receive. Reverts if `to` already holds a bond on this creature.
    fn transfer_bond(ref self: TContractState, creature_id: u256, to: ContractAddress);
    fn last_pet_of(self: @TContractState, creature_id: u256, holder: ContractAddress) -> u64;
    fn is_reapable(self: @TContractState, creature_id: u256, holder: ContractAddress) -> bool;
    fn lapse_seconds(self: @TContractState) -> u64;
    fn reap_reward(self: @TContractState) -> u256;
}
