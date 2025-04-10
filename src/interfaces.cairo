use starknet::ContractAddress;

#[starknet::interface]
pub trait IGolUtilities<TContractState> {
    // Load grid from state
    fn unpack_grid_from_uint(self: @TContractState,state: u256) -> Array<Array<bool>>;
    // Pack grid in u256
    fn pack_grid_in_uint(self: @TContractState, grid: Array<Array<bool>>) -> u256;
    /// Iterate state once
    fn iterate_life_once(self: @TContractState,initial_state: u256) -> u256;
    /// Iterate state several times
    fn iterate_life_several_times(self: @TContractState,initial_state: u256, generations: usize) -> Array<u256>;
    // Iterate life several times and:
    // - Return false is a specific incorrect value is found
    // - Return the smallest value in the sequence
    // - Return the sequence of states it went through
    fn iterate_life_several_times_enhanced(self: @TContractState, initial_state: u256, trigger_state: u256,  generations: usize)->  (bool, u256, Array<u256>); 
    // Validate loops are valid (single loop)
    fn is_single_loop_from_initial_state(self: @TContractState,initial_state: u256, generations: usize) -> (bool, u256, Array<u256>);
    // Validate loops are valid (single loop & entry point is the smallest)) 
    fn is_single_loop_and_entrypoint_is_smallest_from_initial_state(self: @TContractState,initial_state: u256, generations: usize) -> bool;
    // Compute a partial path data
    fn compute_partial_path(self: @TContractState, initial_state: u256, trigger_state: u256, generations: usize) -> PartialPathData;
    // Combine partial paths
    fn combine_partial_path(self: @TContractState, partial_path_1: PartialPathData, partial_path_2: PartialPathData) -> PartialPathData;
}

#[starknet::interface]
pub trait IGolLoopMinter<TContractState> {
    // Mint a loop
    fn mint_loop(ref self: TContractState, loop_id: u256, loop_length: usize, recipient: ContractAddress) -> bool;
    fn mint_partial_path(ref self: TContractState, path_start: u256, path_length: usize, trigger_state: u256);
    fn combine_partial_path(ref self: TContractState, partial_path_id_1: u256, partial_path_id_2: u256);
    fn mint_loop_from_partial_paths(ref self: TContractState, loop_id: u256, recipient: ContractAddress);
}

#[starknet::interface]
pub trait IGolPathMinter<TContractState> {
    // Mint a path
    fn mint_path(ref self: TContractState, path_id: u256, length_to_loop_entrypoint: usize, loop_entrypoint: u256, loop_length: usize, recipient: ContractAddress) -> bool;
    fn mint_partial_path(ref self: TContractState, path_start: u256, path_length: usize, trigger_state: u256);
    fn combine_partial_path(ref self: TContractState, partial_path_id_1: u256, partial_path_id_2: u256);
    fn mint_path_from_partial_paths(ref self: TContractState, path_id: u256, recipient: ContractAddress);
}

#[starknet::interface]
pub trait IGolLifeForms<TContractState> {
    // Mint a token
    fn mint(ref self: TContractState, recipient: ContractAddress, minter: ContractAddress, token_id: u256, lifeform_data: LifeFormData);
    fn get_lifeform_data(self: @TContractState, token_id: u256) -> LifeFormData;
    fn move_lifeform_forward(ref self: TContractState, token_id: u256);
}

#[starknet::interface]
pub trait IGolNutrientToken<TContractState> {
    // Mint a token
    fn mint(ref self: TContractState, recipient: ContractAddress, amount: u256);
}


#[derive(Drop, Serde, Copy, starknet::Store)]
pub struct LifeFormData {
    pub is_loop: bool,
    pub is_still: bool,
    pub is_alive: bool,
    pub is_dead: bool,
    pub sequence_length: usize,
    pub current_state: u256,
    pub age: u32,
}

#[derive(Drop, Serde, Copy, starknet::Store)]
pub struct PartialPathData {
    pub entrypoint: u256,
    pub exitpoint: u256,
    pub length: usize,
    pub trigger_state: u256,
    pub smallest_element: u256
}