use starknet::ContractAddress;

#[starknet::interface]
pub trait IGolUtilities<TContractState> {
    // Load grid from state
    fn unpack_grid_from_felt252(self: @TContractState,state: felt252) -> Array<Array<bool>>;
    // Pack grid in felt
    fn pack_grid_in_felt252(self: @TContractState, grid: Array<Array<bool>>) -> felt252;
    /// Iterate state once
    fn iterate_life_once(self: @TContractState,initial_state: felt252) -> felt252;
    /// Iterate state several times
    fn iterate_life_several_times(self: @TContractState,initial_state: felt252, iterations: usize) -> Array<felt252>;
    // Validate loops are valid (single loop)
    fn is_single_loop_from_initial_state(self: @TContractState,initial_state: felt252, generations: usize) -> (bool, felt252, felt252);
    // Validate loops are valid (single loop & entry point is the smallest)) 
    fn is_single_loop_and_entrypoint_is_smallest_from_initial_state(self: @TContractState,initial_state: felt252, generations: usize) -> bool;
    // Test function
    fn iterate_life_several_times_write(ref self: TContractState,initial_state: felt252, iterations: usize);
}

#[starknet::interface]
pub trait IGolLoopMinter<TContractState> {
    // Mint a loop
    fn mint_loop(ref self: TContractState, loop_id: felt252, loop_length: usize, recipient: ContractAddress) -> bool;
}

#[starknet::interface]
pub trait IGolPathMinter<TContractState> {
    // Mint a path
    fn mint_path(ref self: TContractState, path_id: felt252, length_to_loop_entrypoint: usize, loop_entrypoint: felt252, loop_length: usize, recipient: ContractAddress) -> bool;
}

#[starknet::interface]
pub trait IGolLifeForms<TContractState> {
    // Mint a token
    fn mint(ref self: TContractState, recipient: ContractAddress, minter: ContractAddress, token_id: felt252, lifeform_data: LifeFormData);
    fn get_lifeform_data(ref self: TContractState, token_id: felt252) -> LifeFormData;
    fn move_lifeform_forward(ref self: TContractState, token_id: felt252);
}

#[starknet::interface]
pub trait IGolWindToken<TContractState> {
    // Mint a token
    fn mint(ref self: TContractState, recipient: ContractAddress, amount: u256);
}


#[derive(Drop, Serde, starknet::Store)]
pub struct LifeFormData {
    pub is_loop: bool,
    pub is_still: bool,
    pub is_alive: bool,
    pub is_dead: bool,
    pub sequence_length: felt252,
    pub current_state: felt252,
}