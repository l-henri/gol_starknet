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

    #[test]
    fn bench_in_place_20_gens() {
        let utils = deploy_utilities();
        let glider = utils
            .pack_grid_in_uint(grid_with(array![(0, 1), (1, 2), (2, 0), (2, 1), (2, 2)].span()));
        let result = utils.iterate_life_several_in_place(glider, 20);
        assert(result != 0, 'sanity');
    }

    #[test]
    fn bench_in_place_100_gens() {
        let utils = deploy_utilities();
        let glider = utils
            .pack_grid_in_uint(grid_with(array![(0, 1), (1, 2), (2, 0), (2, 1), (2, 2)].span()));
        let result = utils.iterate_life_several_in_place(glider, 100);
        assert(result != glider, 'sanity');
    }

    #[test]
    fn bench_in_place_200_gens() {
        let utils = deploy_utilities();
        let glider = utils
            .pack_grid_in_uint(grid_with(array![(0, 1), (1, 2), (2, 0), (2, 1), (2, 2)].span()));
        let result = utils.iterate_life_several_in_place(glider, 200);
        assert(result != glider, 'sanity');
    }

    #[test]
    fn bench_in_place_250_gens() {
        let utils = deploy_utilities();
        let glider = utils
            .pack_grid_in_uint(grid_with(array![(0, 1), (1, 2), (2, 0), (2, 1), (2, 2)].span()));
        let result = utils.iterate_life_several_in_place(glider, 250);
        assert(result != glider, 'sanity');
    }

    #[test]
    fn bench_in_place_270_gens() {
        let utils = deploy_utilities();
        let glider = utils
            .pack_grid_in_uint(grid_with(array![(0, 1), (1, 2), (2, 0), (2, 1), (2, 2)].span()));
        let result = utils.iterate_life_several_in_place(glider, 270);
        assert(result != glider, 'sanity');
    }

    // ── reference-output tests ────────────────────────────────────────────────
    // Each expected value was computed by an independent Python GoL simulation
    // (reference: tests/test_grid_utils.cairo comment block) and is checked
    // against the Cairo implementation to ensure exact equivalence.

    #[test]
    fn test_reference_glider_13_steps() {
        let utils = deploy_utilities();
        // Glider at (0,1),(1,2),(2,0),(2,1),(2,2) — 13 steps, interior cells only.
        let start = utils
            .pack_grid_in_uint(grid_with(array![(0, 1), (1, 2), (2, 0), (2, 1), (2, 2)].span()));
        let expected: u256 = 0x400180028000000000000000;
        assert(utils.iterate_life_several_in_place(start, 13) == expected, 'glider 13 mismatch');
    }

    #[test]
    fn test_reference_glider_right_edge_5_steps() {
        let utils = deploy_utilities();
        // Glider near the right edge (col 12-14) — stresses col_right wrap at col 14.
        let start = utils
            .pack_grid_in_uint(
                grid_with(array![(0, 13), (1, 14), (2, 12), (2, 13), (2, 14)].span()),
            );
        let expected: u256 = 0x4000800280040000000;
        assert(
            utils.iterate_life_several_in_place(start, 5) == expected, 'glider right-edge mismatch',
        );
    }

    #[test]
    fn test_reference_glider_bottom_edge_5_steps() {
        let utils = deploy_utilities();
        // Glider near the bottom edge (rows 12-14) — stresses row_below wrap at row 14.
        let start = utils
            .pack_grid_in_uint(
                grid_with(array![(13, 1), (14, 2), (12, 0), (12, 1), (13, 0)].span()),
            );
        let expected: u256 = 0x800280030000000000000_u256 * 0x10000000000000000000000000000_u256;
        // expected lo=0, hi=0x800280030000000000000
        let expected: u256 = u256 { low: 0x0, high: 0x800280030000000000000 };
        assert(
            utils.iterate_life_several_in_place(start, 5) == expected,
            'glider bottom-edge mismatch',
        );
    }

    #[test]
    fn test_reference_left_edge_blinker_2_steps() {
        let utils = deploy_utilities();
        // Vertical blinker at col 0, rows 6-8 — stresses col_left wrap at col 0.
        // After 2 steps it must return to the same state (period-2 oscillator).
        let start = utils
            .pack_grid_in_uint(grid_with(array![(6, 0), (7, 0), (8, 0)].span()));
        assert(utils.iterate_life_several_in_place(start, 2) == start, 'left-edge blinker mismatch');
    }

    // ── toroidal wrap tests ───────────────────────────────────────────────────

    #[test]
    fn test_toroidal_corner_block_still_life() {
        let utils = deploy_utilities();
        // 2x2 block spanning the torus corner: (14,14),(14,0),(0,14),(0,0)
        let corner_block = utils
            .pack_grid_in_uint(
                grid_with(array![(14, 14), (14, 0), (0, 14), (0, 0)].span()),
            );
        assert(utils.iterate_life_once(corner_block) == corner_block, 'corner block still life');
    }

    #[test]
    fn test_toroidal_seam_blinker_oscillates() {
        let utils = deploy_utilities();
        // Vertical blinker spanning the top/bottom seam: (14,5),(0,5),(1,5)
        let vertical = utils
            .pack_grid_in_uint(grid_with(array![(14, 5), (0, 5), (1, 5)].span()));
        // After one step it becomes the horizontal blinker centred at (0,5)
        let horizontal = utils
            .pack_grid_in_uint(grid_with(array![(0, 4), (0, 5), (0, 6)].span()));
        assert(utils.iterate_life_once(vertical) == horizontal, 'should become horizontal');
        assert(utils.iterate_life_once(horizontal) == vertical, 'should return to vertical');
    }
}
