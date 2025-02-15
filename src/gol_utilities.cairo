use super::interfaces::{IGolUtilities };

#[starknet::component]
pub mod GolUtilitiesComponent {
    use super::IGolUtilities;
    // use core::dict::Felt252Dict;    
    use core::array::ArrayTrait;
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

        fn iterate_life_several_times(self: @ComponentState<TContractState>,initial_state: felt252, iterations: usize) ->  Array<felt252>{
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
        // Returns a tuple:
        // First value is true if it is a loop
        // Second value returns lowest value in loop 
        fn is_single_loop_from_initial_state(self: @ComponentState<TContractState>, initial_state: felt252, generations: usize) -> (bool, felt252) {
            
            let mut current_state : felt252 = initial_state;
            let mut current_generation: usize = 0;
            let mut smallest_element = initial_state;
            let mut is_loop = true;
            let initial_state_u256 : u256 = initial_state.into();
            
            // Go through the sequence to check wether it is a single loop, and wether the start and finish element is the smallest
            loop {
                if current_generation >= generations - 1{
                    break;
                }
                current_state = self.iterate_life_once(current_state);
                let current_state_u256: u256 = current_state.into();
                // Check if the current state is equal to the initial state (means this is not a single loop)
                if initial_state_u256 == current_state_u256 {
                    is_loop = false;
                    break;
                }
                let mut smallest_element_u256 = smallest_element.into();
                // Check wether the current state is the lowest element in the loop
                if smallest_element_u256 > current_state_u256 {
                    smallest_element = current_state;
                }
                current_generation += 1;
            };
            current_state = self.iterate_life_once(current_state);
            
            // Check wether the sequence indeed loops
            if current_state != initial_state {
                is_loop = false;
            }
            (is_loop, smallest_element)
        }

        fn is_single_loop_and_entrypoint_is_smallest_from_initial_state(self: @ComponentState<TContractState>, initial_state: felt252, generations: usize) -> bool {
            let returned_tuple  = self.is_single_loop_from_initial_state(initial_state, generations);
            let (is_loop, smallest_element) = returned_tuple;
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

        fn iterate_life_several_times_write(ref self: ComponentState<TContractState>, initial_state: felt252, iterations: usize) {
            self.iterate_life_several_times(initial_state, iterations);

        }
    }
}