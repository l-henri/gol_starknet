use super::interfaces::{IGolUtilities };

#[starknet::component]
pub mod GolUtilitiesComponent {
    use super::IGolUtilities;
    use gol_starknet::interfaces::{PartialPathData};

    // use core::dict::Felt252Dict;    
    use core::array::ArrayTrait;
    use core::traits::{PartialEq, PartialOrd};
    const grid_size:u32 = 15;   

    #[storage]
    pub struct Storage {
    }

    #[event]
    #[derive(Drop, PartialEq, starknet::Event)]
    pub enum Event {
    }

    #[embeddable_as(GolUtilitiesImpl)]
    impl GolUtilities<
        TContractState,
        +HasComponent<TContractState>,
        +Drop<TContractState>,
    > of super::IGolUtilities<ComponentState<TContractState>>  {
        fn unpack_grid_from_felt252(self: @ComponentState<TContractState>, state: felt252) -> Array<Array<bool>> {
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

        fn pack_grid_in_felt252(self: @ComponentState<TContractState>, grid: Array<Array<bool>>) -> felt252 {
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

        fn iterate_life_once(self: @ComponentState<TContractState>, initial_state: felt252) -> felt252 {
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

        fn iterate_life_several_times(self: @ComponentState<TContractState>,initial_state: felt252, generations: usize) ->  Array<felt252>{
            let mut next_gen : felt252 = initial_state;
            let mut sequence_of_states: Array<felt252> = ArrayTrait::new();
            sequence_of_states.append(initial_state);
            let mut generation: usize = 0;

            loop {
                if generation >= generations {
                    break;
                }
                next_gen = self.iterate_life_once(next_gen);
                sequence_of_states.append(next_gen);
                generation += 1;
            };
            sequence_of_states
        }

        fn iterate_life_several_times_enhanced(self: @ComponentState<TContractState>, initial_state: felt252, trigger_state: felt252,  generations: usize) ->  (bool, felt252, Array<felt252>){            
            let mut current_state : felt252 = initial_state;
            let mut sequence_of_states: Array<felt252> = ArrayTrait::new();
            sequence_of_states.append(initial_state);
            let mut current_generation: usize = 0;
            let mut smallest_element = initial_state;
            let mut is_triggered = false;
            let trigger_state_u256 : u256 = trigger_state.into();
            
            // Go through the sequence and:
            // - Detect a trigger value
            // - Find the smallest element in the sequence
            // - Returns the sequence
            loop {
                if current_generation >= generations {
                    break;
                }
                current_state = self.iterate_life_once(current_state);
                sequence_of_states.append(current_state);
                let current_state_u256: u256 = current_state.into();
                // Check if the current state is equal to the trigger state
                if trigger_state_u256 == current_state_u256 {
                    is_triggered = true;
                }
                // Check wether the current state is the lowest element in the loop
                let mut smallest_element_u256 = smallest_element.into();
                if smallest_element_u256 > current_state_u256 {
                    smallest_element = current_state;
                }
                current_generation += 1;
            };

            (is_triggered, smallest_element, sequence_of_states)
        }
        // Returns a tuple:
        // First value is true if it is a loop
        // Second value returns lowest value in loop 
        // Third value is the list of states in the loop
        fn is_single_loop_from_initial_state(self: @ComponentState<TContractState>, initial_state: felt252, generations: usize) -> (bool, felt252, Array<felt252>) {
            assert(generations > 0, 'No loop is smaller than 1');
            let mut is_loop = true;
            // Compute path from initial state until one step before loop completes
            let returned_tuple  = self.iterate_life_several_times_enhanced(initial_state, initial_state, generations - 1);
            let (mut is_triggered, mut smallest_element, mut sequence) = returned_tuple; 
            // Exception if it's a still figure
            let mut second_to_last_element = 0;
            if (generations == 1)
            {
                second_to_last_element = initial_state;
                sequence.append(initial_state);
            }
            else
            {
                // Compute the last step and check wether it loops back
                second_to_last_element = *sequence[generations - 2];
            }
            let last_state = self.iterate_life_once(second_to_last_element);
            sequence.append(last_state);
            if (is_triggered)
            {
                is_loop = false;
            }
            if (last_state != initial_state)
            {
                is_loop = false;
                let smallest_element_u256: u256 = smallest_element.into();
                let last_state_u256: u256 = last_state.into();
                if (last_state < smallest_element)
                {
                    smallest_element = last_state;
                }
            }
            (is_loop, smallest_element, sequence)
        }

        fn is_single_loop_and_entrypoint_is_smallest_from_initial_state(self: @ComponentState<TContractState>, initial_state: felt252, generations: usize) -> bool {
            let returned_tuple  = self.is_single_loop_from_initial_state(initial_state, generations);
            let (is_loop, smallest_element, _) = returned_tuple;
            let mut return_value = false;
            if (is_loop)
            {
                if (smallest_element == initial_state)
                {
                    return_value = true;
                }
            }
            return_value
        }
        fn compute_partial_path(self: @ComponentState<TContractState>, initial_state: felt252, trigger_state: felt252, generations: usize) -> PartialPathData{

            let returned_values = self.iterate_life_several_times_enhanced(initial_state, trigger_state, generations);
            let (is_triggered, smallest_element, sequence_of_states) = returned_values;
            assert(!is_triggered, 'Triggered state reached');
            let mut partialPathData = PartialPathData {
                entrypoint: initial_state,
                exitpoint: *sequence_of_states[generations.into() - 1],
                length: generations.into(),
                trigger_state: trigger_state,
                smallest_element: smallest_element
             };
            partialPathData
        }
        fn combine_partial_path(self: @ComponentState<TContractState>, partial_path_1: PartialPathData, partial_path_2: PartialPathData) -> PartialPathData{
        assert(partial_path_1.exitpoint == partial_path_2.entrypoint, 'Not combinable');
        assert(partial_path_1.trigger_state == partial_path_2.trigger_state, 'Different trigger state');
        }
    }
}