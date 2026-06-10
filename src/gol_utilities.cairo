use super::interfaces::{IGolUtilities };

#[starknet::component]
pub mod GolUtilitiesComponent {
    use super::IGolUtilities;
    use gol_starknet::interfaces::{PartialPathData};

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
        fn get_grid_size(self: @ComponentState<TContractState>) -> u32 {
            grid_size
        }
        fn unpack_grid_from_uint(self: @ComponentState<TContractState>, state: u256) -> Array<Array<bool>> {
            let mut grid: Array<Array<bool>> = ArrayTrait::new();
            let mut power: u256 = 1;
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
                    // Check exact bit value (must be exactly 1, not just non-zero)
                    let pixel = state & power;
                    if pixel == power {
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
        fn pack_grid_in_uint(self: @ComponentState<TContractState>, grid: Array<Array<bool>>) -> u256 {
            let mut packed_state: u256 = 0;
            let mut power: u256 = 1;
            // Going though rows
            let mut row: usize = 0;
            loop {
                if row >= grid_size {
                    break;
                }
                // Going though columns of a specific row
                let mut column: usize = 0;
                loop {
                    if column >= grid_size {
                        break;
                    }
                    
                    if *grid[row][column] {
                        packed_state += power;
                    }
                    
                    // Only double the power if this isn't the very last cell
                    if !(row == grid_size -1 && column == grid_size - 1) {
                        power *= 2; // Increment power for the next cell
                        }      
                    column += 1;        
                    };
                row += 1;
            };
           
            
            packed_state
        }

        fn iterate_life_once(self: @ComponentState<TContractState>, initial_state: u256) -> u256 {
            let grid = self.unpack_grid_from_uint(initial_state);
            let next_grid = step_grid(@grid);
            self.pack_grid_in_uint(next_grid)
        }

        fn iterate_life_several_in_place(self: @ComponentState<TContractState>, initial_state: u256, generations: usize) -> u256 {
            // Unpack and pack the u256 grid exactly once; step the grid in place in between. The
            // per-generation cost is then just `step_grid`, not the expensive u256 pack/unpack, so
            // this advances many more generations per call/tx than looping `iterate_life_once`.
            let mut grid = self.unpack_grid_from_uint(initial_state);
            let mut generation: usize = 0;
            while generation < generations {
                grid = step_grid(@grid);
                generation += 1;
            };
            self.pack_grid_in_uint(grid)
        }

        fn iterate_life_several_times(self: @ComponentState<TContractState>,initial_state: u256, generations: usize) ->  Array<u256>{
            let mut next_gen = initial_state;
            let mut sequence_of_states: Array<u256> = ArrayTrait::new();
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

        fn iterate_life_several_times_enhanced(self: @ComponentState<TContractState>, initial_state: u256, trigger_state: u256,  generations: usize) ->  (bool, u256, Array<u256>){            
            let mut current_state = initial_state;
            let mut sequence_of_states: Array<u256> = ArrayTrait::new();
            sequence_of_states.append(initial_state);
            let mut current_generation: usize = 0;
            let mut smallest_element = initial_state;
            let mut is_triggered = false;
            
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
                // Check if the current state is equal to the trigger state
                if trigger_state == current_state {
                    is_triggered = true;
                }
                // Check wether the current state is the lowest element in the loop
                if smallest_element > current_state {
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
        fn is_single_loop_from_initial_state(self: @ComponentState<TContractState>, initial_state: u256, generations: usize) -> (bool, u256, Array<u256>) {
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
                second_to_last_element = *sequence[generations - 1];
            }
            let last_state = self.iterate_life_once(second_to_last_element);
            sequence.append(last_state);
            assert(!is_triggered, 'triggered in ISLFIS');
            if (is_triggered)
            {
                is_loop = false;
            }
            if (last_state != initial_state)
            {
                is_loop = false;
                if (last_state < smallest_element)
                {
                    smallest_element = last_state;
                }
            }
            assert(is_loop, 'no loop in ISLFIS');
            (is_loop, smallest_element, sequence)
        }

        fn is_single_loop_and_entrypoint_is_smallest_from_initial_state(self: @ComponentState<TContractState>, initial_state: u256, generations: usize) -> bool {
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
        fn compute_partial_path(self: @ComponentState<TContractState>, initial_state: u256, trigger_state: u256, generations: usize) -> PartialPathData{
            assert(generations > 0, 'No path smaller than 1');
            // A partial path of `generations` states spans indices 0..generations-1, so we iterate
            // exactly `generations - 1` times. The trigger guard then covers only the states the
            // segment actually stores -- it must NOT peek one step past the exitpoint, because that
            // peeked step is the loop-closure state the `*_from_partial_paths` mints legitimately
            // need (== loop_id == trigger_state). Peeking made the closing segment unregisterable
            // and left both of those mints unreachable for any real loop.
            let returned_values = self.iterate_life_several_times_enhanced(initial_state, trigger_state, generations - 1);
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
            assert(partial_path_1.length > 0, 'No path smaller than 1');
            assert(partial_path_2.length > 0, 'No path smaller than 1');
            assert(partial_path_1.exitpoint == partial_path_2.entrypoint, 'Not combinable');
            assert(partial_path_1.trigger_state == partial_path_2.trigger_state, 'Different trigger state');
            let mut partialPathData = PartialPathData {
                entrypoint: partial_path_1.entrypoint,
                exitpoint: partial_path_2.exitpoint,
                length: partial_path_1.length + partial_path_2.length - 1,
                trigger_state: partial_path_1.trigger_state,
                smallest_element: partial_path_1.smallest_element
            };
            if (partial_path_1.smallest_element > partial_path_2.smallest_element)
            {
                partialPathData.smallest_element = partial_path_2.smallest_element;
            }
            partialPathData
        }
    }

    // Pure Game-of-Life step on an unpacked (toroidal) grid. Extracted so the neighbour-count and
    // survival rules live in exactly one place, shared by `iterate_life_once` and
    // `iterate_life_several_in_place`. Reads through a snapshot so callers keep ownership.
    fn step_grid(grid: @Array<Array<bool>>) -> Array<Array<bool>> {
        let mut next_grid: Array<Array<bool>> = ArrayTrait::new();
        let mut row: usize = 0;
        loop {
            if row >= grid_size {
                break;
            }
            // Toroidal wrap as branches instead of `%`: a divmod is ~10 steps, a compare is ~2.
            // The row wraps and the three row snapshots only depend on `row`, so they live here,
            // outside the column loop (15x fewer computations than per-cell).
            let row_above = if row == 0 { grid_size - 1 } else { row - 1 };
            let row_below = if row == grid_size - 1 { 0 } else { row + 1 };
            let above = grid.at(row_above);
            let current = grid.at(row);
            let below = grid.at(row_below);
            let mut single_row: Array<bool> = ArrayTrait::new();
            let mut column: usize = 0;
            loop {
                if column >= grid_size {
                    break;
                }
                let col_left = if column == 0 { grid_size - 1 } else { column - 1 };
                let col_right = if column == grid_size - 1 { 0 } else { column + 1 };
                let mut neighbours_count = 0;
                // 3 cells above
                if *above.at(col_left) { neighbours_count += 1; }
                if *above.at(column) { neighbours_count += 1; }
                if *above.at(col_right) { neighbours_count += 1; }
                // left and right
                if *current.at(col_right) { neighbours_count += 1; }
                if *current.at(col_left) { neighbours_count += 1; }
                // 3 cells below
                if *below.at(col_left) { neighbours_count += 1; }
                if *below.at(column) { neighbours_count += 1; }
                if *below.at(col_right) { neighbours_count += 1; }

                let will_live = if *current.at(column) {
                    neighbours_count == 2 || neighbours_count == 3
                } else {
                    neighbours_count == 3
                };
                single_row.append(will_live);
                column += 1;
            };
            next_grid.append(single_row);
            row += 1;
        };
        next_grid
    }
}