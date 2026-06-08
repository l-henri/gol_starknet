#[cfg(test)]
mod tests {
    use core::array::ArrayTrait;
    use starknet::ContractAddress;
    use snforge_std::{
        declare, ContractClassTrait, DeclareResultTrait, start_cheat_caller_address,
        stop_cheat_caller_address, spy_events, EventSpyTrait, EventsFilterTrait,
    };
    use openzeppelin::interfaces::accesscontrol::{
        IAccessControlDispatcher, IAccessControlDispatcherTrait,
    };
    use openzeppelin::interfaces::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};
    use openzeppelin::interfaces::erc721::{
        IERC721MetadataDispatcher, IERC721MetadataDispatcherTrait,
    };
    use gol_starknet::interfaces::{
        IGolUtilitiesDispatcher, IGolUtilitiesDispatcherTrait, IGolLoopMinterDispatcher,
        IGolLoopMinterDispatcherTrait, IGolPathMinterDispatcher, IGolPathMinterDispatcherTrait,
        IGolLifeFormsDispatcher, IGolLifeFormsDispatcherTrait,
    };

    const MINTER_ROLE: felt252 = selector!("MINTER_ROLE");
    const ONE_NUT: u256 = 1000000000000000000;
    const GRID_SIZE: usize = 15;

    // `update_nutrient_contract_address` is an `#[external]` fn on GolLifeforms that is not part
    // of the IGolLifeForms interface, so we declare a minimal local interface to reach it.
    #[starknet::interface]
    trait IGolLifeformsAdmin<TContractState> {
        fn update_nutrient_contract_address(
            ref self: TContractState, nutrient_contract_address: ContractAddress,
        );
    }

    #[derive(Drop, Copy)]
    struct Deployment {
        creator: ContractAddress,
        nutrient: ContractAddress,
        // The lifeforms contract also exposes the GolUtilities component, so it doubles as the
        // utilities provider for the minters (matching scripts/deploy_full.ts).
        lifeforms: ContractAddress,
        loop_minter: ContractAddress,
        path_minter: ContractAddress,
    }

    // Build a 15x15 grid with the given (row, col) cells alive.
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

    // Deploy the full contract graph and wire up roles + the nutrient address, exactly like the
    // production deploy script does.
    fn deploy_all() -> Deployment {
        let creator: ContractAddress = 0x1.try_into().unwrap();

        // Nutrient (ERC20)
        let nutrient_class = declare("Nutrient").unwrap().contract_class();
        let initial_supply: u256 = 1000000 * ONE_NUT;
        let mut nutrient_cd: Array<felt252> = ArrayTrait::new();
        initial_supply.serialize(ref nutrient_cd);
        creator.serialize(ref nutrient_cd);
        let (nutrient, _) = nutrient_class.deploy(@nutrient_cd).unwrap();

        // Lifeforms (ERC721 + GolUtilities)
        let lifeforms_class = declare("GolLifeforms").unwrap().contract_class();
        let mut lifeforms_cd: Array<felt252> = ArrayTrait::new();
        creator.serialize(ref lifeforms_cd);
        let (lifeforms, _) = lifeforms_class.deploy(@lifeforms_cd).unwrap();

        // Loop & path minters (both point at the lifeforms contract)
        let loop_class = declare("GolLoopMinter").unwrap().contract_class();
        let mut loop_cd: Array<felt252> = ArrayTrait::new();
        lifeforms.serialize(ref loop_cd);
        let (loop_minter, _) = loop_class.deploy(@loop_cd).unwrap();

        let path_class = declare("GolPathMinter").unwrap().contract_class();
        let mut path_cd: Array<felt252> = ArrayTrait::new();
        lifeforms.serialize(ref path_cd);
        let (path_minter, _) = path_class.deploy(@path_cd).unwrap();

        // Grant the lifeforms contract the right to mint NUT.
        start_cheat_caller_address(nutrient, creator);
        IAccessControlDispatcher { contract_address: nutrient }.grant_role(MINTER_ROLE, lifeforms);
        stop_cheat_caller_address(nutrient);

        // Grant both minters the right to mint lifeforms, and set the nutrient address.
        start_cheat_caller_address(lifeforms, creator);
        let lifeforms_ac = IAccessControlDispatcher { contract_address: lifeforms };
        lifeforms_ac.grant_role(MINTER_ROLE, loop_minter);
        lifeforms_ac.grant_role(MINTER_ROLE, path_minter);
        IGolLifeformsAdminDispatcher { contract_address: lifeforms }
            .update_nutrient_contract_address(nutrient);
        stop_cheat_caller_address(lifeforms);

        // The creator funds minting by approving the lifeforms contract to pull NUT.
        start_cheat_caller_address(nutrient, creator);
        IERC20Dispatcher { contract_address: nutrient }.approve(lifeforms, initial_supply);
        stop_cheat_caller_address(nutrient);

        Deployment { creator, nutrient, lifeforms, loop_minter, path_minter }
    }

    #[test]
    fn test_mint_still_life_block() {
        let d = deploy_all();
        let utils = IGolUtilitiesDispatcher { contract_address: d.lifeforms };

        // A 2x2 block is a still life (period-1 loop, trivially its own smallest element).
        let block_state = utils
            .pack_grid_in_uint(grid_with(array![(0, 0), (0, 1), (1, 0), (1, 1)].span()));

        start_cheat_caller_address(d.loop_minter, d.creator);
        let success = IGolLoopMinterDispatcher { contract_address: d.loop_minter }
            .mint_loop(block_state, 1, d.creator);
        stop_cheat_caller_address(d.loop_minter);

        assert(success, 'Should mint still life');

        // The NFT renders on-chain: token_uri returns a populated data URI.
        let uri = IERC721MetadataDispatcher { contract_address: d.lifeforms }
            .token_uri(block_state);
        assert(uri.len() > 100, 'token_uri renders');
    }

    #[test]
    fn test_mint_blinker_loop() {
        let d = deploy_all();
        let utils = IGolUtilitiesDispatcher { contract_address: d.lifeforms };

        // The blinker oscillates between a vertical and a horizontal bar (period 2). mint_loop
        // requires the smallest state in the cycle, so we compute both phases and pick the min.
        let vertical = utils.pack_grid_in_uint(grid_with(array![(1, 1), (2, 1), (3, 1)].span()));
        let horizontal = utils.iterate_life_once(vertical);
        let loop_id = if horizontal < vertical {
            horizontal
        } else {
            vertical
        };

        start_cheat_caller_address(d.loop_minter, d.creator);
        let success = IGolLoopMinterDispatcher { contract_address: d.loop_minter }
            .mint_loop(loop_id, 2, d.creator);
        stop_cheat_caller_address(d.loop_minter);

        assert(success, 'Should mint blinker loop');
    }

    #[test]
    fn test_mint_path_to_block() {
        let d = deploy_all();
        let utils = IGolUtilitiesDispatcher { contract_address: d.lifeforms };

        // An L-tromino converges to a 2x2 block (a period-1 loop) in a single generation.
        let l_tromino = utils.pack_grid_in_uint(grid_with(array![(1, 1), (1, 2), (2, 1)].span()));
        let block_state = utils.iterate_life_once(l_tromino);

        start_cheat_caller_address(d.path_minter, d.creator);
        let success = IGolPathMinterDispatcher { contract_address: d.path_minter }
            .mint_path(l_tromino, 1, block_state, 1, d.creator);
        stop_cheat_caller_address(d.path_minter);

        assert(success, 'Should mint path to block');
    }
    #[test]
    #[should_panic(expected: 'Lifeform not minted')]
    fn test_move_forward_rejects_phantom_token() {
        let d = deploy_all();
        let lifeforms = IGolLifeFormsDispatcher { contract_address: d.lifeforms };
        // 999999 was never minted: advancing it is not real movement and must not earn NUT.
        start_cheat_caller_address(d.lifeforms, d.creator);
        lifeforms.move_lifeform_forward(999999);
        stop_cheat_caller_address(d.lifeforms);
    }

    #[test]
    fn test_move_forward_advances_minted_lifeform() {
        let d = deploy_all();
        let utils = IGolUtilitiesDispatcher { contract_address: d.lifeforms };

        // Mint a blinker (period 2) so advancing it changes the state.
        let vertical = utils.pack_grid_in_uint(grid_with(array![(1, 1), (2, 1), (3, 1)].span()));
        let horizontal = utils.iterate_life_once(vertical);
        let loop_id = if horizontal < vertical {
            horizontal
        } else {
            vertical
        };
        start_cheat_caller_address(d.loop_minter, d.creator);
        IGolLoopMinterDispatcher { contract_address: d.loop_minter }
            .mint_loop(loop_id, 2, d.creator);
        stop_cheat_caller_address(d.loop_minter);

        let lifeforms = IGolLifeFormsDispatcher { contract_address: d.lifeforms };
        let before = lifeforms.get_lifeform_data(loop_id);
        assert(before.age == 0, 'age starts at 0');

        start_cheat_caller_address(d.lifeforms, d.creator);
        lifeforms.move_lifeform_forward(loop_id);
        stop_cheat_caller_address(d.lifeforms);

        let after = lifeforms.get_lifeform_data(loop_id);
        assert(after.age == 1, 'age incremented');
        assert(after.current_state != before.current_state, 'state advanced');
    }

    // ----------------------------------------------------------------------------------------
    // Partial-path machinery.
    //
    // A "partial path" lets a caller trace part of a long trajectory off-chain over several
    // transactions and register each segment, then `combine` adjacent segments, and finally
    // `mint_*_from_partial_paths` once the full trajectory is proven. This exists so loops/paths
    // longer than a single transaction's step budget can still be minted.
    //
    // These tests cover the *reachable* behaviour of that machinery (registration + combination
    // + the validation reverts) and pin down a latent bug that makes the two
    // `*_from_partial_paths` mints unreachable for real loops — see
    // `test_partial_path_cannot_span_a_full_period` below and ROADMAP "Partial-path coverage".

    // mint_partial_path registers a segment and combine_partial_path merges an adjacent one;
    // both emit their events. We trace the L-tromino -> block transient (block is a still life),
    // with a trigger state (empty grid) the trajectory never reaches, so neither segment trips
    // the trigger guard.
    #[test]
    fn test_partial_path_create_and_combine() {
        let d = deploy_all();
        let utils = IGolUtilitiesDispatcher { contract_address: d.lifeforms };
        let path_minter = IGolPathMinterDispatcher { contract_address: d.path_minter };

        let l_tromino = utils.pack_grid_in_uint(grid_with(array![(1, 1), (1, 2), (2, 1)].span()));
        let block_state = utils.iterate_life_once(l_tromino);
        // The L-tromino -> block trajectory is never empty, so trigger 0 is never reached.
        let trigger: u256 = 0;

        let mut spy = spy_events();
        start_cheat_caller_address(d.path_minter, d.creator);
        // Segment 1 spans l_tromino..block (length 2 => exitpoint is the block at index 1).
        path_minter.mint_partial_path(l_tromino, 2, trigger);
        // Segment 2 starts at the block (still life), so it is adjacent to segment 1's exitpoint.
        path_minter.mint_partial_path(block_state, 2, trigger);
        // Combine: segment-1 exitpoint (block) == segment-2 entrypoint (block), same trigger.
        path_minter.combine_partial_path(l_tromino, block_state);
        stop_cheat_caller_address(d.path_minter);

        // Two PartialPathCreated + one PartialPathsCombined, all on the path minter.
        let emitted = spy.get_events().emitted_by(d.path_minter);
        assert(emitted.events.len() == 3, 'expected 3 partial-path events');
    }

    // combine requires the second segment to start exactly where the first ends.
    #[test]
    #[should_panic(expected: 'Not combinable')]
    fn test_combine_rejects_non_adjacent_segments() {
        let d = deploy_all();
        let utils = IGolUtilitiesDispatcher { contract_address: d.lifeforms };
        let path_minter = IGolPathMinterDispatcher { contract_address: d.path_minter };

        let l_tromino = utils.pack_grid_in_uint(grid_with(array![(1, 1), (1, 2), (2, 1)].span()));
        let block_state = utils.iterate_life_once(l_tromino);

        start_cheat_caller_address(d.path_minter, d.creator);
        // Two length-1 segments whose endpoints don't meet: seg(l_tromino).exit == l_tromino,
        // seg(block).entry == block, and l_tromino != block.
        path_minter.mint_partial_path(l_tromino, 1, 0);
        path_minter.mint_partial_path(block_state, 1, 0);
        path_minter.combine_partial_path(l_tromino, block_state);
        stop_cheat_caller_address(d.path_minter);
    }

    // combine requires both segments to share the same trigger state.
    #[test]
    #[should_panic(expected: 'Different trigger state')]
    fn test_combine_rejects_mismatched_trigger() {
        let d = deploy_all();
        let utils = IGolUtilitiesDispatcher { contract_address: d.lifeforms };
        let path_minter = IGolPathMinterDispatcher { contract_address: d.path_minter };

        let l_tromino = utils.pack_grid_in_uint(grid_with(array![(1, 1), (1, 2), (2, 1)].span()));
        let block_state = utils.iterate_life_once(l_tromino);

        start_cheat_caller_address(d.path_minter, d.creator);
        // Adjacent (seg1.exit == block == seg2.entry) but created with different trigger states.
        path_minter.mint_partial_path(l_tromino, 2, 0);
        path_minter.mint_partial_path(block_state, 1, 7);
        path_minter.combine_partial_path(l_tromino, block_state);
        stop_cheat_caller_address(d.path_minter);
    }

    // mint_loop_from_partial_paths needs a segment registered under `loop_id`; an unregistered id
    // reads back the zeroed default, whose trigger_state (0) != loop_id.
    #[test]
    #[should_panic(expected: 'Not the right loop')]
    fn test_mint_loop_from_partial_paths_requires_registration() {
        let d = deploy_all();
        let utils = IGolUtilitiesDispatcher { contract_address: d.lifeforms };
        let loop_minter = IGolLoopMinterDispatcher { contract_address: d.loop_minter };

        let block_state = utils
            .pack_grid_in_uint(grid_with(array![(0, 0), (0, 1), (1, 0), (1, 1)].span()));

        start_cheat_caller_address(d.loop_minter, d.creator);
        loop_minter.mint_loop_from_partial_paths(block_state, d.creator);
        stop_cheat_caller_address(d.loop_minter);
    }

    // End-to-end: register a partial path that spans a full loop period, then mint the loop from
    // it. The blinker (period 2) is the minimal case: one segment of length 2 spans loop_id..M,
    // and `mint_loop_from_partial_paths` closes it (iterate_once(M) == loop_id). This is the path
    // that was unreachable before the `compute_partial_path` peek fix.
    #[test]
    fn test_mint_loop_from_partial_paths() {
        let d = deploy_all();
        let utils = IGolUtilitiesDispatcher { contract_address: d.lifeforms };
        let loop_minter = IGolLoopMinterDispatcher { contract_address: d.loop_minter };
        let lifeforms = IGolLifeFormsDispatcher { contract_address: d.lifeforms };

        let vertical = utils.pack_grid_in_uint(grid_with(array![(1, 1), (2, 1), (3, 1)].span()));
        let horizontal = utils.iterate_life_once(vertical);
        let loop_id = if horizontal < vertical {
            horizontal
        } else {
            vertical
        };

        start_cheat_caller_address(d.loop_minter, d.creator);
        // Span the whole period (length 2) with the loop id as the trigger, then mint.
        loop_minter.mint_partial_path(loop_id, 2, loop_id);
        loop_minter.mint_loop_from_partial_paths(loop_id, d.creator);
        stop_cheat_caller_address(d.loop_minter);

        let data = lifeforms.get_lifeform_data(loop_id);
        assert(data.is_loop, 'minted a loop');
        assert(data.sequence_length == 2, 'period 2');
        assert(data.current_state == loop_id, 'state is the loop id');
    }

    // End-to-end: register a transient main path and the (still-life) loop it falls into, then
    // mint the path from those partial paths. L-tromino -> block: the main path is just the
    // L-tromino (exitpoint L), its loop entry is iterate_once(L) == block, and the block is a
    // period-1 loop (iterate_once(block) == block).
    #[test]
    fn test_mint_path_from_partial_paths() {
        let d = deploy_all();
        let utils = IGolUtilitiesDispatcher { contract_address: d.lifeforms };
        let path_minter = IGolPathMinterDispatcher { contract_address: d.path_minter };
        let lifeforms = IGolLifeFormsDispatcher { contract_address: d.lifeforms };

        let l_tromino = utils.pack_grid_in_uint(grid_with(array![(1, 1), (1, 2), (2, 1)].span()));
        let block_state = utils.iterate_life_once(l_tromino);

        start_cheat_caller_address(d.path_minter, d.creator);
        // Main path: the lone transient state (length 1, exitpoint == l_tromino).
        path_minter.mint_partial_path(l_tromino, 1, 0);
        // Loop partial path keyed by the loop entry; its trigger must equal that entry (block).
        path_minter.mint_partial_path(block_state, 1, block_state);
        path_minter.mint_path_from_partial_paths(l_tromino, d.creator);
        stop_cheat_caller_address(d.path_minter);

        let data = lifeforms.get_lifeform_data(l_tromino);
        assert(!data.is_loop, 'path is not a loop');
        assert(data.sequence_length == 1, 'path length 1');
        assert(data.current_state == l_tromino, 'state is the path id');
    }

    // The trigger guard still bites the other way: a segment that overshoots the period re-includes
    // the loop id among its stored states, so it reverts. (Blinker period 2, length 3 stores
    // loop_id, M, loop_id.)
    #[test]
    #[should_panic(expected: 'Triggered state reached')]
    fn test_partial_path_rejects_overshooting_the_period() {
        let d = deploy_all();
        let utils = IGolUtilitiesDispatcher { contract_address: d.lifeforms };
        let loop_minter = IGolLoopMinterDispatcher { contract_address: d.loop_minter };

        let vertical = utils.pack_grid_in_uint(grid_with(array![(1, 1), (2, 1), (3, 1)].span()));
        let horizontal = utils.iterate_life_once(vertical);
        let loop_id = if horizontal < vertical {
            horizontal
        } else {
            vertical
        };

        start_cheat_caller_address(d.loop_minter, d.creator);
        loop_minter.mint_partial_path(loop_id, 3, loop_id);
        stop_cheat_caller_address(d.loop_minter);
    }
}
