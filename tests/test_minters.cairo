#[cfg(test)]
mod tests {
    use core::array::ArrayTrait;
    use starknet::ContractAddress;
    use snforge_std::{
        declare, ContractClassTrait, DeclareResultTrait, start_cheat_caller_address,
        stop_cheat_caller_address,
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
    // TODO(phase-0): partial-path discovery + combination flows (mint_partial_path,
    // combine_partial_path, mint_loop_from_partial_paths, mint_path_from_partial_paths) still
    // need correct integration coverage. The previous tests for these never passed (they
    // declared a component as a contract and asserted an incorrect L-shape -> blinker evolution).
}
