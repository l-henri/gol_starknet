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
    // Detect loops
    fn detect_loop(self: @TContractState,sequence_of_states: Array<felt252>) -> Array<felt252>;
    // Validate loops are valid (single & entry point is the smallest)
    fn validate_loop_from_array(self: @TContractState,sequence: Array<felt252>) -> bool;
    // Validate loops are valid (single & entry point is the smallest)
    fn validate_loop_from_initial_state(self: @TContractState,initial_state: felt252, generations: usize) -> bool;
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
    fn mint_path(ref self: TContractState, path_start_id: felt252, path_length: usize, recipient: ContractAddress) -> bool;
}

#[starknet::interface]
pub trait IGolLifeForms<TContractState> {
    // Mint a token
    fn mint(ref self: TContractState, recipient: ContractAddress, token_id: felt252, lifeform_data: LifeFormData);
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