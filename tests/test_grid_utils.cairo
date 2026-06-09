#[cfg(test)]
mod tests {
    use core::array::ArrayTrait;
    use starknet::ContractAddress;
    use snforge_std::{declare, ContractClassTrait, DeclareResultTrait};
    use gol_starknet::interfaces::{IGolUtilitiesDispatcher, IGolUtilitiesDispatcherTrait};

    const GRID_SIZE: usize = 15;

    // Build a full 15x15 grid with the given (row, col) cells alive. The on-chain pack/iterate
    // routines always index a full grid_size x grid_size grid, so inputs must be 15x15.
    fn grid_with(live: Span<(usize, usize)>) -> Array<Array<bool>> {
        let mut grid: Array<Array<bool>> = ArrayTrait::new();
        let mut r: usize = 0;
        while r < GRID_SIZE {
            let mut row: Array<bool> = ArrayTrait::new();
            let mut c: usize = 0;
            while c < GRID_SIZE {
                let mut alive = false;
                let mut k: usize = 0;
                while k < live.len() {
                    let (lr, lc) = *live.at(k);
                    if lr == r && lc == c {
                        alive = true;
                    }
                    k += 1;
                };
                row.append(alive);
                c += 1;
            };
            grid.append(row);
            r += 1;
        };
        grid
    }

    // GolUtilities is a component embedded in GolLifeforms and exposed via its ABI, so we exercise
    // it through a deployed lifeforms contract rather than a bare component state.
    fn deploy_utilities() -> IGolUtilitiesDispatcher {
        let creator: ContractAddress = 0x1.try_into().unwrap();
        let class = declare("GolLifeforms").unwrap().contract_class();
        let mut calldata: Array<felt252> = ArrayTrait::new();
        creator.serialize(ref calldata);
        let (address, _) = class.deploy(@calldata).unwrap();
        IGolUtilitiesDispatcher { contract_address: address }
    }

    #[test]
    fn test_pack_unpack_single_cell() {
        let utils = deploy_utilities();
        // Cell (0,0) is the least-significant bit.
        let packed = utils.pack_grid_in_uint(grid_with(array![(0, 0)].span()));
        assert(packed == 1, 'cell (0,0) should pack to 1');
        let unpacked = utils.unpack_grid_from_uint(packed);
        assert(*unpacked.at(0).at(0), 'should unpack (0,0)');
    }

    #[test]
    fn test_pack_unpack_corners() {
        let utils = deploy_utilities();
        let unpacked = utils
            .unpack_grid_from_uint(
                utils.pack_grid_in_uint(grid_with(array![(0, 0), (0, 14), (14, 0), (14, 14)].span())),
            );
        assert(*unpacked.at(0).at(0), 'corner 0,0');
        assert(*unpacked.at(0).at(14), 'corner 0,14');
        assert(*unpacked.at(14).at(0), 'corner 14,0');
        assert(*unpacked.at(14).at(14), 'corner 14,14');
    }

    #[test]
    fn test_still_life_block() {
        let utils = deploy_utilities();
        let block = utils
            .pack_grid_in_uint(grid_with(array![(0, 0), (0, 1), (1, 0), (1, 1)].span()));
        assert(utils.iterate_life_once(block) == block, 'block should be still');
    }

    #[test]
    fn test_blinker_oscillator() {
        let utils = deploy_utilities();
        let vertical = utils.pack_grid_in_uint(grid_with(array![(1, 1), (2, 1), (3, 1)].span()));
        let states = utils.iterate_life_several_times(vertical, 2);
        assert(*states.at(0) == vertical, 'first state is initial');
        assert(*states.at(0) != *states.at(1), 'states should alternate');
        assert(*states.at(2) == vertical, 'period 2 returns to start');
    }

    #[test]
    fn test_iterate_in_place_matches_looped() {
        let utils = deploy_utilities();
        // A glider keeps changing every generation, so this is a real multi-generation check.
        let glider = utils
            .pack_grid_in_uint(grid_with(array![(0, 1), (1, 2), (2, 0), (2, 1), (2, 2)].span()));

        // Looping iterate_life_once N times must equal the in-place result for the same N.
        let mut looped = glider;
        let mut i: usize = 0;
        while i < 13 {
            looped = utils.iterate_life_once(looped);
            i += 1;
        };
        assert(utils.iterate_life_several_in_place(glider, 13) == looped, 'in_place == looped');
        // Zero generations is the identity.
        assert(utils.iterate_life_several_in_place(glider, 0) == glider, '0 gens is identity');
    }

    #[test]
    fn test_empty_grid_stays_empty() {
        let utils = deploy_utilities();
        assert(utils.iterate_life_once(0) == 0, 'empty grid stays empty');
        let states = utils.iterate_life_several_times(0, 5);
        assert(states.len() == 6, 'should have 6 states');
        assert(*states.at(5) == 0, 'should remain empty');
    }
}
