use super::interfaces::{IGolLifeForms, IGolUtilities };

#[starknet::contract]
mod GolLifeforms {
    use openzeppelin::introspection::src5::SRC5Component;
    use openzeppelin::token::erc721::{ERC721Component, ERC721HooksEmptyImpl};
    use openzeppelin::access::accesscontrol::AccessControlComponent;
    use openzeppelin::access::accesscontrol::DEFAULT_ADMIN_ROLE;
    use openzeppelin::upgrades::UpgradeableComponent;
    use openzeppelin::upgrades::interface::IUpgradeable;
    use starknet::ClassHash;
    use starknet::ContractAddress;
    use starknet::storage::{Map, StorageMapReadAccess, StorageMapWriteAccess};
    use gol_starknet::interfaces::{ LifeFormData };
    use core::dict::Felt252Dict;    
    use core::array::ArrayTrait;
    const grid_size:u32 = 15;   

    component!(path: ERC721Component, storage: erc721, event: ERC721Event);
    component!(path: SRC5Component, storage: src5, event: SRC5Event);
    component!(path: AccessControlComponent, storage: accesscontrol, event: AccessControlEvent);
    component!(path: UpgradeableComponent, storage: upgradeable, event: UpgradeableEvent);

    const MINTER_ROLE: felt252 = selector!("MINTER_ROLE");

    // ERC721 Mixin
    #[abi(embed_v0)]
    impl ERC721MixinImpl = ERC721Component::ERC721MixinImpl<ContractState>;
    impl ERC721InternalImpl = ERC721Component::InternalImpl<ContractState>;
     // AccessControl
    #[abi(embed_v0)]
    impl AccessControlImpl = AccessControlComponent::AccessControlImpl<ContractState>;
    impl AccessControlInternalImpl = AccessControlComponent::InternalImpl<ContractState>;
    // Upgradeable
    impl UpgradeableInternalImpl = UpgradeableComponent::InternalImpl<ContractState>;

    #[storage]
    struct Storage {
        #[substorage(v0)]
        erc721: ERC721Component::Storage,
        #[substorage(v0)]
        src5: SRC5Component::Storage,
        #[substorage(v0)]
        accesscontrol: AccessControlComponent::Storage,
        #[substorage(v0)]
        upgradeable: UpgradeableComponent::Storage,
        pub lifeform_data: Map<felt252, LifeFormData>
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        ERC721Event: ERC721Component::Event,
        #[flat]
        SRC5Event: SRC5Component::Event,
        #[flat]
        AccessControlEvent: AccessControlComponent::Event,
        #[flat]
        UpgradeableEvent: UpgradeableComponent::Event,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        recipient: ContractAddress,
        creator: ContractAddress
    ) {
        let name = "GOL Lifeforms";
        let symbol = "GOL";
        let base_uri = "https://api.example.com/v1/";
        let token_id = 1;

        self.erc721.initializer(name, symbol, base_uri);
        self.erc721.mint(recipient, token_id);
        // AccessControl-related initialization
        self.accesscontrol.initializer();
        self.accesscontrol._grant_role(MINTER_ROLE, recipient);
        self.accesscontrol._grant_role(DEFAULT_ADMIN_ROLE, creator);
    }

    #[abi(embed_v0)]
    impl GolLifeFormsImpl of super::IGolLifeForms<ContractState> {
        fn mint(ref self: ContractState, recipient: ContractAddress, token_id: felt252, lifeform_data: LifeFormData) {
            self.accesscontrol.assert_only_role(MINTER_ROLE);
            self.erc721.mint(recipient, token_id.into());
            self.lifeform_data.write(token_id, lifeform_data);
        }
    
    }
    #[abi(embed_v0)]
    impl UpgradeableImpl of IUpgradeable<ContractState> {
        fn upgrade(ref self: ContractState, new_class_hash: ClassHash) {
            // This function can only be called by the DEFAULT_ADMIN_ROLE
            self.accesscontrol.assert_only_role(DEFAULT_ADMIN_ROLE);

            // Replace the class hash upgrading the contract
            self.upgradeable.upgrade(new_class_hash);
        }
    }
    #[abi(embed_v0)]
    impl GolUtilitiesImpl of super::IGolUtilities<ContractState> {
        fn unpack_grid_from_felt252(self: @ContractState, state: felt252) -> Array<Array<bool>> {
            let mut state_as_u256 : u256 = state.into();
            let mut grid: Array<Array<bool>> = ArrayTrait::new();
            let mut power: u256 = 1;
            // Going though rows
            let mut row: usize = 0;
            loop {
                if row >= 15 {
                    break;
                    }
                let mut single_row: Array<bool> = ArrayTrait::new();

                // Going though columns of a specific row
                let mut column: usize = 0;
                loop {
                    if column >= 15 {
                        break;
                    }
                    // let test3 = test & test2;
                    let pixel = state_as_u256 & power;
                    if pixel != 0 {
                        single_row.append(true);
                    }
                    else {
                        single_row.append(false);
                    }
                    column += 1;
                    power *=2;
                    };
                grid.append(single_row);
                row += 1;
            };
            grid
        }

        fn pack_grid_in_felt252(self: @ContractState, grid: Array<Array<bool>>) -> felt252 {
            let mut packed_state: felt252 = 0;
            let mut power: felt252 = 1;
            // Going though rows
            let mut row: usize = 0;
            loop {
                if row >= 15 {
                    break;
                }
                // Going though columns of a specific row
                let mut column: usize = 0;
                loop {
                    if column >= 15 {
                        break;
                    }
                    
                    if *grid[row][column] {
                        packed_state += power;
                    }
                    power *= 2; // Increment power for the next cell
                    column += 1;
                    };
                row += 1;
            };
           
            
            packed_state
        }

        fn iterate_life_once(self: @ContractState, initial_state: felt252) -> felt252 {
            let grid = self.unpack_grid_from_felt252(initial_state);
            let mut next_grid: Array<Array<bool>> = ArrayTrait::new();
            // Going though rows
            let mut row: usize = 0;
            loop {
                if row >= grid_size {
                    break;
                }
                let mut single_row: Array<bool> = ArrayTrait::new();
                // Going though columns of a specific row
                let mut column: usize = 0;
                loop {
                    if column >= grid_size {
                        break;
                    }
                    // Counting neighbouring cells
                    let mut neighbours_count = 0;
                    // Calculate wrapped indices
                    let row_above = ((row + 15 - 1) % 15);
                    let row_below = ((row + 1) % 15);
                    let col_left = ((column + 15 - 1) % 15);
                    let col_right = ((column + 1) % 15);
                    // 3 cells above
                    if *grid[row_above][col_left] {neighbours_count += 1;}
                    if *grid[row_above][column] {neighbours_count += 1;}
                    if *grid[row_above][col_right] {neighbours_count += 1;}
                    // A cell to the left, a cell to the right
                    if *grid[row][col_right] {neighbours_count += 1;}
                    if *grid[row][col_left] {neighbours_count += 1;}
                    // 3 cells below
                    if *grid[row_below][col_left] {neighbours_count += 1;}
                    if *grid[row_below][column] {neighbours_count += 1;}
                    if *grid[row_below][col_right] {neighbours_count += 1;}

                    // Living rules
                    let will_live = if *grid[row][column] {
                        // Living cell survives with 2 or 3 neighbours
                        neighbours_count == 2 || neighbours_count == 3
                    } else {
                        // Dead cell comes alive with exactly 3 neighbours
                        neighbours_count == 3
                    };
                    single_row.append(will_live);
                    column += 1;
                };
                next_grid.append(single_row);
                row += 1;
            };
            self.pack_grid_in_felt252(next_grid)
        }

        fn iterate_life_several_times(self: @ContractState,initial_state: felt252, iterations: usize) ->  Array<felt252>{
            let mut next_gen : felt252 = initial_state;
            let mut sequence_of_states: Array<felt252> = ArrayTrait::new();
            sequence_of_states.append(initial_state);
            let mut generation: usize = 0;

            loop {
                if generation >= iterations {
                    break;
                }
                next_gen = self.iterate_life_once(next_gen);
                sequence_of_states.append(next_gen);
                generation += 1;
            };
            sequence_of_states
        }
        /// Detects cycles in a sequence of Game of Life states
        /// Returns an array where:
        /// - First element is 0 if no loop found, or the loop length if found
        /// - Remaining elements are the states that form the loop (if found)
        fn detect_loop(self: @ContractState, sequence_of_states: Array<felt252>) -> Array<felt252> {
            let mut loop_sequence: Array<felt252> = ArrayTrait::new();
            let mut sequence_positions: Felt252Dict<usize> = Default::default();

            // Find the first repeated state
            let sequence_length = sequence_of_states.len();
            let mut position: usize = 0;
            loop {
                if position >= sequence_length {
                    break;
                }
                let current_state = *sequence_of_states[position];
                if sequence_positions.get(current_state) != 0 {
                    // Loop found
                    let loop_start = sequence_positions.get(current_state) - 1;
                    let loop_length = position - loop_start;
                    
                    // Add loop length as first element
                    loop_sequence.append(loop_length.into());
                    
                    // Add the states that form the loop
                    let mut loop_pos = loop_start;
                    loop {
                        if loop_pos >= position {
                            break;
                        }
                        loop_sequence.append(*sequence_of_states[loop_pos]);
                        loop_pos += 1;
                    };
                    break;
                }
                
                sequence_positions.insert(current_state, position + 1);
                position += 1;
            };

            // If no loop found
            if position >= sequence_length {
                loop_sequence.append(0);
            }
            
            loop_sequence
        }

        fn validate_loop_from_array(self: @ContractState, sequence: Array<felt252>) -> bool {
            if sequence.len() < 1 {
                return false;
            }
            
            let first_state = *sequence[0];
            let last_state =  *sequence[sequence.len()-1]; 

            // Check wether the sequence indeed loops
            if first_state != last_state {
                return false;
            }

            let mut position: usize = 1;
            let mut return_value = true;
            // Go through the sequence to check wether it is a single loop, and wether the start and finish element is the smallest
            loop {
                if position >= sequence.len() - 1 {
                    break;
                }
                // Check wether the current item is equal, or smaller, than the first item (non single loop, non correct loop entry point)
                // let mut is_valid = first_state - *sequence[position];
                let first_state_u256 : u256 = first_state.into();
                let current_state: felt252 = *sequence[position];
                let current_state_u256: u256 = current_state.into();
                // let current_state_u256: u256 = *sequence[position].into();
                // let test_2 : u256 = 2;
                // let mut is_valid = test > test_2;
                if first_state_u256 >= current_state_u256 {
                    return_value = false;
                }
                position += 1;
            };
            
            return_value
        }

        fn validate_loop_from_initial_state(self: @ContractState, initial_state: felt252, generations: usize) -> bool {
            
            let mut current_state : felt252 = initial_state;
            let mut current_generation: usize = 0;
            let mut return_value = true;
            let initial_state_u256 : u256 = initial_state.into();
            // Go through the sequence to check wether it is a single loop, and wether the start and finish element is the smallest
            loop {
                if current_generation >= generations {
                    break;
                }
                current_state = self.iterate_life_once(current_state);
                // Check wether the current item is equal, or smaller, than the first item (non single loop, non correct loop entry point)
                // let mut is_valid = first_state - *sequence[position];
                
                let current_state_u256: u256 = current_state.into();
                // let current_state_u256: u256 = *sequence[position].into();
                // let test_2 : u256 = 2;
                // let mut is_valid = test > test_2;
                if initial_state_u256 >= current_state_u256 {
                    return_value = false;
                    break;
                }
                current_generation += 1;
            };
            
            // Check wether the sequence indeed loops
            if current_state != initial_state {
                return false;
            }

            return_value
        }
    }
}