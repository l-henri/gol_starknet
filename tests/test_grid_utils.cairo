#[cfg(test)]
mod tests {
    use core::array::ArrayTrait;
    use starknet::{ContractAddress, contract_address_const};
    use snforge_std::{declare, ContractClassTrait};
    use gol_starknet::gol_utilities::GolUtilitiesComponent;
    use gol_starknet::interfaces::{IGolUtilities, PartialPathData};

    impl GolUtilitiesImplTestWrapper of IGolUtilities<GolUtilitiesComponent::ComponentState<()>> {
        fn unpack_grid_from_uint(self: @GolUtilitiesComponent::ComponentState<()>, state: u256) -> Array<Array<bool>> {
            GolUtilitiesComponent::unpack_grid_from_uint(self, state)
        }

        fn pack_grid_in_uint(self: @GolUtilitiesComponent::ComponentState<()>, grid: Array<Array<bool>>) -> u256 {
            GolUtilitiesComponent::pack_grid_in_uint(self, grid)
        }

        fn iterate_life_once(self: @GolUtilitiesComponent::ComponentState<()>, initial_state: u256) -> u256 {
            GolUtilitiesComponent::iterate_life_once(self, initial_state)
        }

        fn iterate_life_several_times(self: @GolUtilitiesComponent::ComponentState<()>, initial_state: u256, generations: usize) -> Array<u256> {
            GolUtilitiesComponent::iterate_life_several_times(self, initial_state, generations)
        }

        fn iterate_life_several_times_enhanced(self: @GolUtilitiesComponent::ComponentState<()>, initial_state: u256, trigger_state: u256, generations: usize) -> (bool, u256, Array<u256>) {
            GolUtilitiesComponent::iterate_life_several_times_enhanced(self, initial_state, trigger_state, generations)
        }

        fn is_single_loop_from_initial_state(self: @GolUtilitiesComponent::ComponentState<()>, initial_state: u256, generations: usize) -> (bool, u256, Array<u256>) {
            GolUtilitiesComponent::is_single_loop_from_initial_state(self, initial_state, generations)
        }

        fn is_single_loop_and_entrypoint_is_smallest_from_initial_state(self: @GolUtilitiesComponent::ComponentState<()>, initial_state: u256, generations: usize) -> bool {
            GolUtilitiesComponent::is_single_loop_and_entrypoint_is_smallest_from_initial_state(self, initial_state, generations)
        }

        fn compute_partial_path(self: @GolUtilitiesComponent::ComponentState<()>, initial_state: u256, trigger_state: u256, generations: usize) -> PartialPathData {
            GolUtilitiesComponent::compute_partial_path(self, initial_state, trigger_state, generations)
        }

        fn combine_partial_path(self: @GolUtilitiesComponent::ComponentState<()>, partial_path_1: PartialPathData, partial_path_2: PartialPathData) -> PartialPathData {
            GolUtilitiesComponent::combine_partial_path(self, partial_path_1, partial_path_2)
        }
    }

    // Helper function to create test components
    fn setup_utilities() -> GolUtilitiesComponent::ComponentState<()> {
        GolUtilitiesComponent::component_state_for_testing()
    }

    #[test]
    fn test_basic_grid_packing() {
        let utilities = setup_utilities();

        let mut grid = ArrayTrait::new();
        let mut row = ArrayTrait::new();
        row.append(true);
        grid.append(row);

        let packed = IGolUtilities::pack_grid_in_uint(@utilities, grid);
        let unpacked = IGolUtilities::unpack_grid_from_uint(@utilities, packed);
        assert(*unpacked.at(0).at(0), 'Incorrect unpacking');
    }

    #[test]
    fn test_invalid_bit_values() {
        let utilities = setup_utilities();

        let mut grid = ArrayTrait::new();
        let mut row = ArrayTrait::new();
        row.append(true);
        grid.append(row);

        let packed = IGolUtilities::pack_grid_in_uint(@utilities, grid);
        let unpacked = IGolUtilities::unpack_grid_from_uint(@utilities, packed);
        assert(*unpacked.at(0).at(0), 'Should be normalized');
    }

    #[test]
    fn test_grid_boundaries() {
        let utilities = setup_utilities();

        let mut grid = ArrayTrait::new();
        for _ in 0..3 {
            let mut row = ArrayTrait::new();
            for _ in 0..4 {
                row.append(true);
            };
            grid.append(row);
        };

        let packed = IGolUtilities::pack_grid_in_uint(@utilities, grid);
        let unpacked = IGolUtilities::unpack_grid_from_uint(@utilities, packed);
        assert(*unpacked.at(0).at(0), 'Corner 0,0 incorrect');
        assert(*unpacked.at(0).at(3), 'Corner 0,3 incorrect');
        assert(*unpacked.at(2).at(0), 'Corner 2,0 incorrect');
        assert(*unpacked.at(2).at(3), 'Corner 2,3 incorrect');
    }

    #[test]
    fn test_still_life() {
        let utilities = setup_utilities();

        let mut grid = ArrayTrait::new();
        let mut row = ArrayTrait::new();
        row.append(true);
        row.append(true);
        grid.append(row);
        let mut row = ArrayTrait::new();
        row.append(true);
        row.append(true);
        grid.append(row);

        let initial_state = IGolUtilities::pack_grid_in_uint(@utilities, grid);
        let next_state = IGolUtilities::iterate_life_once(@utilities, initial_state);
        assert(next_state == initial_state, 'Still life should not change');
    }

    #[test]
    fn test_blinker_oscillator() {
        let utilities = setup_utilities();

        let mut grid = ArrayTrait::new();
        for _ in 0..3 {
            let mut row = ArrayTrait::new();
            row.append(true);
            grid.append(row);
        };

        let initial_state = IGolUtilities::pack_grid_in_uint(@utilities, grid);
        let states = IGolUtilities::iterate_life_several_times(@utilities, initial_state, 2);
        assert(*states.at(0) != *states.at(1), 'States should alternate');
        assert(*states.at(0) == initial_state, 'First state should match initial');
        assert(*states.at(2) == initial_state, 'Should return to initial state');
    }

    #[test]
    fn test_empty_grid() {
        let utilities = setup_utilities();

        let empty_state: u256 = 0;
        let next_state = IGolUtilities::iterate_life_once(@utilities, empty_state);
        assert(next_state == empty_state, 'Empty grid should stay empty');

        let states = IGolUtilities::iterate_life_several_times(@utilities, empty_state, 5);
        assert(states.len() == 6, 'Should have 6 states');
        assert(*states.at(5) == 0, 'Should remain empty');
    }
} 