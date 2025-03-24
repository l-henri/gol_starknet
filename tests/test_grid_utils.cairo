#[cfg(test)]
mod tests {
    use core::array::ArrayTrait;
    use gol_starknet::gol_utilities::GolUtilitiesComponent;
    use gol_starknet::interfaces::IGolUtilities;

    // Helper function to create a test component
    fn setup_utilities() -> GolUtilitiesComponent::ComponentState<()> {
        GolUtilitiesComponent::component_state_for_testing()
    }

    #[test]
    fn test_basic_grid_packing() {
        let utilities = setup_utilities();
        
        // Create a simple grid with a single cell
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
                // Set only position (0,0) to true
                row.append(i == 0 && j == 0);
                j += 1;
            };
            grid.append(row);
            i += 1;
        };

        // Pack the grid
        let packed = utilities.pack_grid_in_uint(grid);
        // Should be 1 (only first bit set)
        assert(packed == 1, 'Wrong packing for single cell');

        // Unpack and verify
        let unpacked = utilities.unpack_grid_from_uint(packed);
        assert(*unpacked[0][0], 'First cell should be true');
        assert(!*unpacked[0][1], 'Second cell should be false');
    }

    #[test]
    fn test_invalid_bit_values() {
        let utilities = setup_utilities();
        
        // Test with a value that has extra bits set
        // Instead of just 1 in first position, set it to 3 (11 in binary)
        let invalid_state: u256 = 3;
        let grid = utilities.unpack_grid_from_uint(invalid_state);
        
        // Should only set first bit to true, ignore the second bit
        assert(*grid[0][0], 'First cell should be true');
        assert(!*grid[0][1], 'Second cell should be false');

        // Pack and verify we get the correct value
        let repacked = utilities.pack_grid_in_uint(grid);
        assert(repacked == 1, 'Should normalize to valid state');
    }

    #[test]
    fn test_grid_boundaries() {
        let utilities = setup_utilities();
        
        // Create a grid with cells at the boundaries
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
                // Set corners to true
                row.append(
                    (i == 0 && j == 0) || // top-left
                    (i == 0 && j == 14) || // top-right
                    (i == 14 && j == 0) || // bottom-left
                    (i == 14 && j == 14)   // bottom-right
                );
                j += 1;
            };
            grid.append(row);
            i += 1;
        };

        let packed = utilities.pack_grid_in_uint(grid);
        let unpacked = utilities.unpack_grid_from_uint(packed);

        // Verify corners
        assert(*unpacked[0][0], 'Top-left should be true');
        assert(*unpacked[0][14], 'Top-right should be true');
        assert(*unpacked[14][0], 'Bottom-left should be true');
        assert(*unpacked[14][14], 'Bottom-right should be true');
        assert(!*unpacked[7][7], 'Center should be false');
    }

    #[test]
    fn test_power_overflow() {
        let utilities = setup_utilities();
        
        // Test with maximum possible value
        let max_state = 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff;
        let grid = utilities.unpack_grid_from_uint(max_state);
        let repacked = utilities.pack_grid_in_uint(grid);
        
        // Verify that packing and unpacking preserves the correct bits
        let mut i: usize = 0;
        loop {
            if i >= 15 {
                break;
            }
            let mut j: usize = 0;
            loop {
                if j >= 15 {
                    break;
                }
                assert(*grid[i][j], 'All cells should be true');
                j += 1;
            };
            i += 1;
        };
    }

    #[test]
    fn test_still_life() {
        let utilities = setup_utilities();
        
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

        let initial_state = utilities.pack_grid_in_uint(grid);
        let next_state = utilities.iterate_life_once(initial_state);
        
        // Block pattern should remain unchanged
        assert(initial_state == next_state, 'Still life should not change');
    }

    #[test]
    fn test_blinker_oscillator() {
        let utilities = setup_utilities();
        
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
                // Set vertical line at x=1
                row.append(j == 1 && (i >= 1 && i <= 3));
                j += 1;
            };
            grid.append(row);
            i += 1;
        };

        let initial_state = utilities.pack_grid_in_uint(grid);
        let states = utilities.iterate_life_several_times(initial_state, 2);
        
        // Blinker has period 2, so third state should match initial
        assert(*states[0] != *states[1], 'States should alternate');
        assert(*states[0] == initial_state, 'First state should match initial');
        assert(*states[2] == initial_state, 'Should return to initial state');
    }

    #[test]
    fn test_glider_movement() {
        let utilities = setup_utilities();
        
        // Create a glider pattern
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
                // Set glider pattern
                let is_glider = 
                    (i == 0 && j == 1) || // Top middle
                    (i == 1 && j == 2) || // Right middle
                    (i == 2 && j == 0) || // Bottom left
                    (i == 2 && j == 1) || // Bottom middle
                    (i == 2 && j == 2);   // Bottom right
                row.append(is_glider);
                j += 1;
            };
            grid.append(row);
            i += 1;
        };

        let initial_state = utilities.pack_grid_in_uint(grid);
        let states = utilities.iterate_life_several_times(initial_state, 4);
        
        // Glider should move and not repeat early states
        assert(*states[0] == initial_state, 'First state should match initial');
        assert(*states[1] != initial_state, 'Glider should move');
        assert(*states[2] != *states[1], 'Glider should keep moving');
        assert(*states[3] != *states[2], 'Glider should keep moving');
    }

    #[test]
    fn test_loop_detection() {
        let utilities = setup_utilities();
        
        // Create a blinker (known period-2 oscillator)
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
        
        // Test loop detection with period 2
        let (is_loop, smallest, sequence) = utilities.is_single_loop_from_initial_state(initial_state, 2);
        assert(is_loop, 'Should detect blinker loop');
        assert(sequence.len() == 3, 'Should have 3 states (including repeat)');
        
        // Test with wrong period
        let result = utilities.is_single_loop_and_entrypoint_is_smallest_from_initial_state(initial_state, 3);
        assert(!result, 'Should not detect wrong period');
    }

    #[test]
    fn test_empty_grid_evolution() {
        let utilities = setup_utilities();
        
        // Empty grid should stay empty
        let empty_state: u256 = 0;
        let next_state = utilities.iterate_life_once(empty_state);
        assert(next_state == 0, 'Empty grid should stay empty');
        
        // Test multiple generations
        let states = utilities.iterate_life_several_times(empty_state, 5);
        assert(states.len() == 6, 'Should have 6 states');
        assert(*states[5] == 0, 'Should remain empty');
    }

    #[test]
    fn test_enhanced_iteration() {
        let utilities = setup_utilities();
        
        // Create a blinker and look for specific state
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
        let next_state = utilities.iterate_life_once(initial_state);
        
        // Test finding the next state in sequence
        let (found, smallest, sequence) = utilities.iterate_life_several_times_enhanced(
            initial_state, 
            next_state,  // Looking for the next state
            2
        );
        
        assert(found, 'Should find next state');
        assert(sequence.len() == 3, 'Should have correct sequence length');
        assert(*sequence[1] == next_state, 'Should find target state');
    }
} 