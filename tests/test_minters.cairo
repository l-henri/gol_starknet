#[cfg(test)]
mod tests {
    use core::array::ArrayTrait;
    use starknet::{ContractAddress, contract_address_const};
    use snforge_std::{declare, ContractClassTrait, start_prank, stop_prank};
    use gol_starknet::gol_utilities::GolUtilitiesComponent;
    use gol_starknet::gol_loop_minter::GolLoopMinter;
    use gol_starknet::gol_path_minter::GolPathMinter;
    use gol_starknet::interfaces::{IGolUtilities, IGolLoopMinter, IGolPathMinter, PartialPathData};

    // Helper function to create test components
    fn setup_utilities() -> GolUtilitiesComponent::ComponentState<()> {
        GolUtilitiesComponent::component_state_for_testing()
    }

    fn setup_loop_minter() -> GolLoopMinter::ContractState {
        let mut state = GolLoopMinter::contract_state_for_testing();
        let mock_nft_address = contract_address_const::<0x1>();
        GolLoopMinter::constructor(ref state, mock_nft_address);
        state
    }

    fn setup_path_minter() -> GolPathMinter::ContractState {
        let mut state = GolPathMinter::contract_state_for_testing();
        let mock_nft_address = contract_address_const::<0x1>();
        GolPathMinter::constructor(ref state, mock_nft_address);
        state
    }

    #[starknet::interface]
    trait IGolUtilitiesTest<TContractState> {
        fn unpack_grid_from_uint(self: @TContractState, state: u256) -> Array<Array<bool>>;
        fn pack_grid_in_uint(self: @TContractState, grid: Array<Array<bool>>) -> u256;
        fn iterate_life_once(self: @TContractState, initial_state: u256) -> u256;
        fn iterate_life_several_times(self: @TContractState, initial_state: u256, generations: usize) -> Array<u256>;
    }

    #[test]
    fn test_mint_still_life() {
        // Deploy contracts
        let utilities_class = declare('GolUtilities');
        let utilities_address = utilities_class.deploy(@ArrayTrait::new()).unwrap();
        
        let loop_minter_class = declare('GolLoopMinter');
        let loop_minter_address = loop_minter_class.deploy(@ArrayTrait::new()).unwrap();
        
        let recipient = contract_address_const::<0x2>();
        
        // Create a block pattern (2x2 square) - a known still life
        let mut grid: Array<Array<bool>> = ArrayTrait::new();
        let mut i: usize = 0;
        loop {
            if i >= 15 {
                break;
            }
            let mut row: Array<bool> = ArrayTrait::new();
            let mut j: usize = 0;
            loop {
                if j >= 15 {
                    break;
                }
                // Set 2x2 block at (0,0)
                row.append((i == 0 || i == 1) && (j == 0 || j == 1));
                j += 1;
            };
            grid.append(row);
            i += 1;
        };

        // Pack grid and mint
        let utilities = IGolUtilities::dispatcher(utilities_address);
        let loop_minter = IGolLoopMinter::dispatcher(loop_minter_address);
        
        let initial_state = utilities.pack_grid_in_uint(grid);
        
        // Start prank to simulate being the contract owner
        start_prank(loop_minter_address, contract_address_const::<0x1>());
        
        // Should be able to mint a still life as a loop with period 1
        let success = loop_minter.mint_loop(initial_state, 1, recipient);
        assert(success, 'Should mint still life');
        
        stop_prank(loop_minter_address);
    }

    #[test]
    fn test_mint_blinker_loop() {
        // Deploy contracts
        let utilities_class = declare('GolUtilities');
        let utilities_address = utilities_class.deploy(@ArrayTrait::new()).unwrap();
        
        let loop_minter_class = declare('GolLoopMinter');
        let loop_minter_address = loop_minter_class.deploy(@ArrayTrait::new()).unwrap();
        
        let recipient = contract_address_const::<0x2>();
        
        // Create a blinker pattern (vertical line of 3 cells)
        let mut grid: Array<Array<bool>> = ArrayTrait::new();
        let mut i: usize = 0;
        loop {
            if i >= 15 {
                break;
            }
            let mut row: Array<bool> = ArrayTrait::new();
            let mut j: usize = 0;
            loop {
                if j >= 15 {
                    break;
                }
                row.append(j == 1 && (i >= 1 && i <= 3));
                j += 1;
            };
            grid.append(row);
            i += 1;
        };

        // Pack grid and mint
        let utilities = IGolUtilities::dispatcher(utilities_address);
        let loop_minter = IGolLoopMinter::dispatcher(loop_minter_address);
        
        let initial_state = utilities.pack_grid_in_uint(grid);
        
        // Start prank to simulate being the contract owner
        start_prank(loop_minter_address, contract_address_const::<0x1>());
        
        // Should be able to mint a blinker as a loop with period 2
        let success = loop_minter.mint_loop(initial_state, 2, recipient);
        assert(success, 'Should mint blinker loop');
        
        stop_prank(loop_minter_address);
    }

    #[test]
    fn test_mint_path_to_blinker() {
        let utilities = setup_utilities();
        let mut path_minter = setup_path_minter();
        let recipient = contract_address_const::<0x2>();
        
        // Create a pre-blinker pattern (L shape that evolves into blinker)
        let mut grid: Array<Array<bool>> = ArrayTrait::new();
        let mut i: usize = 0;
        loop {
            if i >= 15 {
                break;
            }
            let mut row: Array<bool> = ArrayTrait::new();
            let mut j: usize = 0;
            loop {
                if j >= 15 {
                    break;
                }
                let is_l_shape = (i == 1 && j == 1) || // Center
                                (i == 1 && j == 2) || // Right
                                (i == 2 && j == 1);   // Bottom
                row.append(is_l_shape);
                j += 1;
            };
            grid.append(row);
            i += 1;
        };

        let initial_state = utilities.pack_grid_in_uint(grid);
        let blinker_state = utilities.iterate_life_once(initial_state);
        
        // Should be able to mint a path that leads to a blinker
        let success = path_minter.mint_path(initial_state, 1, blinker_state, 2, recipient);
        assert(success, 'Should mint path to blinker');
    }

    #[test]
    fn test_partial_path_operations() {
        let utilities = setup_utilities();
        let mut path_minter = setup_path_minter();
        let recipient = contract_address_const::<0x2>();
        
        // Create two partial paths that can be combined
        let mut grid1: Array<Array<bool>> = ArrayTrait::new();
        let mut grid2: Array<Array<bool>> = ArrayTrait::new();
        let mut i: usize = 0;
        loop {
            if i >= 15 {
                break;
            }
            let mut row1: Array<bool> = ArrayTrait::new();
            let mut row2: Array<bool> = ArrayTrait::new();
            let mut j: usize = 0;
            loop {
                if j >= 15 {
                    break;
                }
                // First path: single cell
                row1.append(i == 0 && j == 0);
                // Second path: two cells
                row2.append((i == 0 && j == 0) || (i == 0 && j == 1));
                j += 1;
            };
            grid1.append(row1);
            grid2.append(row2);
            i += 1;
        };

        let state1 = utilities.pack_grid_in_uint(grid1);
        let state2 = utilities.pack_grid_in_uint(grid2);
        let target_state = 0; // Dead state as target
        
        // Create partial paths
        path_minter.mint_partial_path(state1, 1, target_state);
        path_minter.mint_partial_path(state2, 1, target_state);
        
        // Combine paths
        path_minter.combine_partial_path(state1, state2);
    }

    #[test]
    fn test_loop_from_partial_paths() {
        let utilities = setup_utilities();
        let mut loop_minter = setup_loop_minter();
        let recipient = contract_address_const::<0x2>();
        
        // Create a blinker pattern
        let mut grid: Array<Array<bool>> = ArrayTrait::new();
        let mut i: usize = 0;
        loop {
            if i >= 15 {
                break;
            }
            let mut row: Array<bool> = ArrayTrait::new();
            let mut j: usize = 0;
            loop {
                if j >= 15 {
                    break;
                }
                row.append(j == 1 && (i >= 1 && i <= 3));
                j += 1;
            };
            grid.append(row);
            i += 1;
        };

        let initial_state = utilities.pack_grid_in_uint(grid);
        
        // Create partial path for first half of blinker oscillation
        loop_minter.mint_partial_path(initial_state, 1, initial_state);
        
        // Should be able to mint a loop from the partial path
        loop_minter.mint_loop_from_partial_paths(initial_state, recipient);
    }

    #[test]
    fn test_path_from_partial_paths() {
        let utilities = setup_utilities();
        let mut path_minter = setup_path_minter();
        let recipient = contract_address_const::<0x2>();
        
        // Create a pre-blinker pattern
        let mut grid: Array<Array<bool>> = ArrayTrait::new();
        let mut i: usize = 0;
        loop {
            if i >= 15 {
                break;
            }
            let mut row: Array<bool> = ArrayTrait::new();
            let mut j: usize = 0;
            loop {
                if j >= 15 {
                    break;
                }
                let is_l_shape = (i == 1 && j == 1) || // Center
                                (i == 1 && j == 2) || // Right
                                (i == 2 && j == 1);   // Bottom
                row.append(is_l_shape);
                j += 1;
            };
            grid.append(row);
            i += 1;
        };

        let initial_state = utilities.pack_grid_in_uint(grid);
        let blinker_state = utilities.iterate_life_once(initial_state);
        
        // Create partial paths for the evolution
        path_minter.mint_partial_path(initial_state, 1, blinker_state);
        path_minter.mint_partial_path(blinker_state, 2, blinker_state);
        
        // Should be able to mint a path from the partial paths
        path_minter.mint_path_from_partial_paths(initial_state, recipient);
    }
} 