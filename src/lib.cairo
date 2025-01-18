/// Interface representing `HelloContract`.
/// This interface allows modification and retrieval of the contract balance.

#[starknet::interface]
pub trait IHelloStarknet<TContractState> {
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
}

/// Simple contract for managing balance.
#[starknet::contract]
mod GameOfLife {
    use core::dict::Felt252Dict;    
    use core::array::ArrayTrait;
    const grid_size:u32 = 15;   

    #[storage]
    struct Storage {
        balance: felt252,
    }

    #[abi(embed_v0)]
    impl HelloStarknetImpl of super::IHelloStarknet<ContractState> {
        
        

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
        fn detect_loop(self: @ContractState,sequence_of_states: Array<felt252>) -> Array<felt252>
        {
            let mut loop_sequence: Array<felt252> = ArrayTrait::new();
            let mut sequence_positions: Felt252Dict<usize> = Default::default();

            // Go through the proposed sequence and find the loop point
            let raw_sequence_length = sequence_of_states.len();
            let mut counter: usize = 0;
            loop {
                // Breaking if it went through he array
                if counter >= raw_sequence_length {
                    break;
                }
                // Breaking if a loop was detected
                if sequence_positions.get(*sequence_of_states[counter]) != 0 {
                    break;
                }

                sequence_positions.insert(*sequence_of_states[counter], counter + 1);
                counter += 1;
            };

            // If there is no loop
            if counter >= raw_sequence_length
            {
                loop_sequence.append(0);
            }
            else
            {
            // Calculating loop length
            let mut loop_length = counter + 1 - sequence_positions.get(*sequence_of_states[counter]);
            loop_sequence.append(loop_length.into());
            let mut test = *sequence_of_states[counter] - 1;
            let mut counter_2 = test.try_into().unwrap();
            loop {
                // Breaking we finished the loop
                if counter_2 >= counter {
                    break;
                }
                loop_sequence.append(*sequence_of_states[counter_2]);
                counter_2 += 1;
                };
            }
            loop_sequence
        }
    }
}
