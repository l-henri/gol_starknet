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
    use gol_starknet::gol_grid_v2::{GridState, grid_with, step, lt, pack, token_id};
    use gol_starknet::interfaces_v2::{
        IGolLifeFormsV2Dispatcher, IGolLifeFormsV2DispatcherTrait, IGolLoopMinterV2Dispatcher,
        IGolLoopMinterV2DispatcherTrait, IGolPathMinterV2Dispatcher,
        IGolPathMinterV2DispatcherTrait,
    };

    const MINTER_ROLE: felt252 = selector!("MINTER_ROLE");
    const ONE_NUT: u256 = 1000000000000000000;

    // update_nutrient_contract_address is an #[external] not in IGolLifeFormsV2.
    #[starknet::interface]
    trait IGolLifeformsV2Admin<TContractState> {
        fn update_nutrient_contract_address(
            ref self: TContractState, nutrient_contract_address: ContractAddress,
        );
    }

    #[derive(Drop, Copy)]
    struct Deployment {
        creator: ContractAddress,
        nutrient: ContractAddress,
        lifeforms: ContractAddress,
        loop_minter: ContractAddress,
        path_minter: ContractAddress,
    }

    fn deploy_all() -> Deployment {
        let creator: ContractAddress = 0x1.try_into().unwrap();

        let nutrient_class = declare("Nutrient").unwrap().contract_class();
        let initial_supply: u256 = 1000000 * ONE_NUT;
        let mut nutrient_cd: Array<felt252> = ArrayTrait::new();
        initial_supply.serialize(ref nutrient_cd);
        creator.serialize(ref nutrient_cd);
        let (nutrient, _) = nutrient_class.deploy(@nutrient_cd).unwrap();

        let lifeforms_class = declare("GolLifeformsV2").unwrap().contract_class();
        let mut lifeforms_cd: Array<felt252> = ArrayTrait::new();
        creator.serialize(ref lifeforms_cd);
        let (lifeforms, _) = lifeforms_class.deploy(@lifeforms_cd).unwrap();

        let loop_class = declare("GolLoopMinterV2").unwrap().contract_class();
        let mut loop_cd: Array<felt252> = ArrayTrait::new();
        lifeforms.serialize(ref loop_cd);
        let (loop_minter, _) = loop_class.deploy(@loop_cd).unwrap();

        let path_class = declare("GolPathMinterV2").unwrap().contract_class();
        let mut path_cd: Array<felt252> = ArrayTrait::new();
        lifeforms.serialize(ref path_cd);
        let (path_minter, _) = path_class.deploy(@path_cd).unwrap();

        // lifeforms may mint NUT
        start_cheat_caller_address(nutrient, creator);
        IAccessControlDispatcher { contract_address: nutrient }.grant_role(MINTER_ROLE, lifeforms);
        stop_cheat_caller_address(nutrient);

        // minters may mint lifeforms; set nutrient address
        start_cheat_caller_address(lifeforms, creator);
        let ac = IAccessControlDispatcher { contract_address: lifeforms };
        ac.grant_role(MINTER_ROLE, loop_minter);
        ac.grant_role(MINTER_ROLE, path_minter);
        IGolLifeformsV2AdminDispatcher { contract_address: lifeforms }
            .update_nutrient_contract_address(nutrient);
        stop_cheat_caller_address(lifeforms);

        // creator funds minting
        start_cheat_caller_address(nutrient, creator);
        IERC20Dispatcher { contract_address: nutrient }.approve(lifeforms, initial_supply);
        stop_cheat_caller_address(nutrient);

        Deployment { creator, nutrient, lifeforms, loop_minter, path_minter }
    }

    // Canonical (smallest) state of the period-2 blinker, plus its rows.
    fn blinker_canonical() -> (GridState, Array<u64>) {
        let a = grid_with(@array![(5_usize, 0b1110_u64)]);
        let b = step(@a);
        let rows = if lt(@b, @a) {
            b
        } else {
            a
        };
        (pack(@rows), rows)
    }

    #[test]
    fn mint_blinker_loop() {
        let d = deploy_all();
        let (loop_state, rows) = blinker_canonical();
        let id = token_id(@rows);

        start_cheat_caller_address(d.loop_minter, d.creator);
        let ok = IGolLoopMinterV2Dispatcher { contract_address: d.loop_minter }
            .mint_loop(loop_state, 2, d.creator);
        stop_cheat_caller_address(d.loop_minter);
        assert(ok, 'minted blinker');

        let data = IGolLifeFormsV2Dispatcher { contract_address: d.lifeforms }
            .get_lifeform_data(id);
        assert(data.is_loop, 'is a loop');
        assert(data.sequence_length == 2, 'period 2');
        assert(data.current_state == loop_state, 'state stored');
        assert(data.age == 0, 'age 0');
    }

    #[test]
    fn mint_still_life_block() {
        let d = deploy_all();
        let rows = grid_with(@array![(10_usize, 0b110_u64), (11_usize, 0b110_u64)]);
        let block = pack(@rows);
        let id = token_id(@rows);

        start_cheat_caller_address(d.loop_minter, d.creator);
        let ok = IGolLoopMinterV2Dispatcher { contract_address: d.loop_minter }
            .mint_loop(block, 1, d.creator);
        stop_cheat_caller_address(d.loop_minter);
        assert(ok, 'minted block');

        let data = IGolLifeFormsV2Dispatcher { contract_address: d.lifeforms }
            .get_lifeform_data(id);
        assert(data.is_still, 'still life');
    }

    #[test]
    fn move_forward_advances() {
        let d = deploy_all();
        let (loop_state, rows) = blinker_canonical();
        let id = token_id(@rows);
        let lifeforms = IGolLifeFormsV2Dispatcher { contract_address: d.lifeforms };

        start_cheat_caller_address(d.loop_minter, d.creator);
        IGolLoopMinterV2Dispatcher { contract_address: d.loop_minter }
            .mint_loop(loop_state, 2, d.creator);
        stop_cheat_caller_address(d.loop_minter);

        start_cheat_caller_address(d.lifeforms, d.creator);
        lifeforms.move_lifeform_forward(id);
        stop_cheat_caller_address(d.lifeforms);

        let data = lifeforms.get_lifeform_data(id);
        assert(data.age == 1, 'age incremented');
        assert(data.current_state != loop_state, 'state advanced');
    }

    #[test]
    fn mint_loop_from_partial_paths() {
        let d = deploy_all();
        let (loop_state, rows) = blinker_canonical();
        let id = token_id(@rows);
        let loop_minter = IGolLoopMinterV2Dispatcher { contract_address: d.loop_minter };

        start_cheat_caller_address(d.loop_minter, d.creator);
        // one length-2 segment spanning the period, trigger = the loop state itself
        loop_minter.mint_partial_path(loop_state, 2, loop_state);
        loop_minter.mint_loop_from_partial_paths(loop_state, d.creator);
        stop_cheat_caller_address(d.loop_minter);

        let data = IGolLifeFormsV2Dispatcher { contract_address: d.lifeforms }
            .get_lifeform_data(id);
        assert(data.is_loop, 'minted a loop');
        assert(data.sequence_length == 2, 'period 2');
        assert(data.current_state == loop_state, 'canonical stored');
    }

    // Legitimate path-from-partial-paths: L-tromino -> block (still-life loop). The loop witness
    // MUST be registered under the landing state's key (token_hash(block)) — that keying is what
    // binds the witness to the path's landing state.
    #[test]
    fn mint_path_from_partial_paths_legit() {
        let d = deploy_all();
        let pm = IGolPathMinterV2Dispatcher { contract_address: d.path_minter };
        let l_rows = grid_with(@array![(1_usize, 0b110_u64), (2_usize, 0b010_u64)]);
        let l_state = pack(@l_rows);
        let block_state = pack(@step(@l_rows));
        let trig = pack(@grid_with(@array![(20_usize, 0b101_u64)])); // never hit on the 1-state main path
        let id = token_id(@l_rows);

        start_cheat_caller_address(d.path_minter, d.creator);
        pm.mint_partial_path(l_state, 1, trig); // main path (exit = l_tromino)
        pm.mint_partial_path(block_state, 1, block_state); // loop witness, keyed at hash(block)
        pm.mint_path_from_partial_paths(l_state, d.creator);
        stop_cheat_caller_address(d.path_minter);

        let data = IGolLifeFormsV2Dispatcher { contract_address: d.lifeforms }
            .get_lifeform_data(id);
        assert(!data.is_loop, 'path minted');
    }

    // Adversarial (refutes the audit's P0): register an UNRELATED blinker as the witness (keyed at
    // hash(blinker)) with trigger = block. The finalize reads registry[hash(block)], which is empty
    // because the witness lives at hash(blinker) — so it reverts. The witness cannot be a disjoint
    // loop; the registry keying forces witness.entrypoint == the landing state.
    #[test]
    #[should_panic(expected: 'Not the right loop')]
    fn mint_path_from_partial_paths_forged_witness_reverts() {
        let d = deploy_all();
        let pm = IGolPathMinterV2Dispatcher { contract_address: d.path_minter };
        let l_rows = grid_with(@array![(1_usize, 0b110_u64), (2_usize, 0b010_u64)]);
        let l_state = pack(@l_rows);
        let block_state = pack(@step(@l_rows));
        let trig = pack(@grid_with(@array![(20_usize, 0b101_u64)]));
        let blinker = pack(@grid_with(@array![(30_usize, 0b1110_u64)]));

        start_cheat_caller_address(d.path_minter, d.creator);
        pm.mint_partial_path(l_state, 1, trig); // main path
        pm.mint_partial_path(blinker, 2, block_state); // witness at hash(blinker), NOT hash(block)
        pm.mint_path_from_partial_paths(l_state, d.creator); // reads hash(block) -> empty -> revert
        stop_cheat_caller_address(d.path_minter);
    }

    #[test]
    fn mint_path_to_block() {
        let d = deploy_all();
        // L-tromino -> 2x2 block in one step.
        let l_rows = grid_with(@array![(1_usize, 0b110_u64), (2_usize, 0b010_u64)]);
        let l_state = pack(@l_rows);
        let id = token_id(@l_rows);

        start_cheat_caller_address(d.path_minter, d.creator);
        let ok = IGolPathMinterV2Dispatcher { contract_address: d.path_minter }
            .mint_path(l_state, 1, 1, d.creator);
        stop_cheat_caller_address(d.path_minter);
        assert(ok, 'minted path');

        let data = IGolLifeFormsV2Dispatcher { contract_address: d.lifeforms }
            .get_lifeform_data(id);
        assert(!data.is_loop, 'path not a loop');
        assert(data.current_state == l_state, 'path state stored');
    }
}
