#[cfg(test)]
mod tests {
    use core::array::ArrayTrait;
    use starknet::ContractAddress;
    use snforge_std::{
        declare, ContractClassTrait, DeclareResultTrait, start_cheat_caller_address,
        stop_cheat_caller_address, start_cheat_block_timestamp, stop_cheat_block_timestamp,
    };
    use openzeppelin::interfaces::accesscontrol::{
        IAccessControlDispatcher, IAccessControlDispatcherTrait,
    };
    use openzeppelin::interfaces::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};
    use openzeppelin::interfaces::erc721::{
        IERC721MetadataDispatcher, IERC721MetadataDispatcherTrait, IERC721Dispatcher,
        IERC721DispatcherTrait,
    };
    use gol_starknet::gol_grid_v2::{
        GridState, grid_with, step, lt, pack, token_id, translate, apply_symmetry,
    };
    use gol_starknet::interfaces_v2::{
        IGolLifeFormsV2Dispatcher, IGolLifeFormsV2DispatcherTrait, IGolLoopMinterV2Dispatcher,
        IGolLoopMinterV2DispatcherTrait, IGolPathMinterV2Dispatcher,
        IGolPathMinterV2DispatcherTrait, IGolPathLifeFormsV2Dispatcher,
        IGolPathLifeFormsV2DispatcherTrait, LifeFormData, PathFormData, LifeState,
    };

    const MINTER_ROLE: felt252 = selector!("MINTER_ROLE");
    const ONE_NUT: u256 = 1000000000000000000;

    #[derive(Drop, Copy)]
    struct Deployment {
        creator: ContractAddress,
        nutrient: ContractAddress,
        lifeforms: ContractAddress,
        path_lifeforms: ContractAddress,
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
        nutrient.serialize(ref lifeforms_cd); // audit #2: nutrient set at construction
        let (lifeforms, _) = lifeforms_class.deploy(@lifeforms_cd).unwrap();

        let loop_class = declare("GolLoopMinterV2").unwrap().contract_class();
        let mut loop_cd: Array<felt252> = ArrayTrait::new();
        lifeforms.serialize(ref loop_cd);
        let (loop_minter, _) = loop_class.deploy(@loop_cd).unwrap();

        // Path creatures live on their OWN NFT contract (separate from loops).
        let path_lf_class = declare("GolPathLifeformsV2").unwrap().contract_class();
        let mut path_lf_cd: Array<felt252> = ArrayTrait::new();
        creator.serialize(ref path_lf_cd);
        nutrient.serialize(ref path_lf_cd);
        let (path_lifeforms, _) = path_lf_class.deploy(@path_lf_cd).unwrap();

        let path_class = declare("GolPathMinterV2").unwrap().contract_class();
        let mut path_cd: Array<felt252> = ArrayTrait::new();
        path_lifeforms.serialize(ref path_cd); // path minter points at the PATH NFT
        let (path_minter, _) = path_class.deploy(@path_cd).unwrap();

        // lifeforms may mint NUT (the faucet). The path NFT does NOT mint NUT — it only holds/moves
        // the escrow it pulls at mint, so it needs no MINTER_ROLE on the nutrient token.
        start_cheat_caller_address(nutrient, creator);
        IAccessControlDispatcher { contract_address: nutrient }.grant_role(MINTER_ROLE, lifeforms);
        stop_cheat_caller_address(nutrient);

        // loop minter may mint loop lifeforms
        start_cheat_caller_address(lifeforms, creator);
        IAccessControlDispatcher { contract_address: lifeforms }
            .grant_role(MINTER_ROLE, loop_minter);
        stop_cheat_caller_address(lifeforms);

        // path minter may mint path lifeforms
        start_cheat_caller_address(path_lifeforms, creator);
        IAccessControlDispatcher { contract_address: path_lifeforms }
            .grant_role(MINTER_ROLE, path_minter);
        stop_cheat_caller_address(path_lifeforms);

        // creator funds minting on both NFTs (loops charge NUT; paths escrow NUT)
        start_cheat_caller_address(nutrient, creator);
        IERC20Dispatcher { contract_address: nutrient }.approve(lifeforms, initial_supply);
        IERC20Dispatcher { contract_address: nutrient }.approve(path_lifeforms, initial_supply);
        stop_cheat_caller_address(nutrient);

        Deployment { creator, nutrient, lifeforms, path_lifeforms, loop_minter, path_minter }
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
    fn move_forward_n_advances_and_mints() {
        let d = deploy_all();
        let (loop_state, rows) = blinker_canonical();
        let id = token_id(@rows);
        let lifeforms = IGolLifeFormsV2Dispatcher { contract_address: d.lifeforms };
        let nut = IERC20Dispatcher { contract_address: d.nutrient };

        start_cheat_caller_address(d.loop_minter, d.creator);
        IGolLoopMinterV2Dispatcher { contract_address: d.loop_minter }
            .mint_loop(loop_state, 2, d.creator);
        stop_cheat_caller_address(d.loop_minter);

        let before = nut.balance_of(d.creator);
        start_cheat_caller_address(d.lifeforms, d.creator);
        lifeforms.move_lifeform_forward_n(id, 5);
        stop_cheat_caller_address(d.lifeforms);

        let data = lifeforms.get_lifeform_data(id);
        assert(data.age == 5, 'age += n');
        // period-2 blinker after 5 (odd) steps = phase B, not the canonical state
        assert(data.current_state != loop_state, 'advanced 5 gens');
        // minted exactly 5 NUT (1 per generation) to the caller
        assert(nut.balance_of(d.creator) - before == 5000000000000000000, '5 NUT minted');
    }

    #[test]
    #[should_panic(expected: 'n must be positive')]
    fn move_forward_n_rejects_zero() {
        let d = deploy_all();
        let (loop_state, rows) = blinker_canonical();
        let id = token_id(@rows);
        start_cheat_caller_address(d.loop_minter, d.creator);
        IGolLoopMinterV2Dispatcher { contract_address: d.loop_minter }
            .mint_loop(loop_state, 2, d.creator);
        stop_cheat_caller_address(d.loop_minter);
        start_cheat_caller_address(d.lifeforms, d.creator);
        IGolLifeFormsV2Dispatcher { contract_address: d.lifeforms }.move_lifeform_forward_n(id, 0);
        stop_cheat_caller_address(d.lifeforms);
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

        let data = IGolPathLifeFormsV2Dispatcher { contract_address: d.path_lifeforms }
            .get_path_data(id);
        assert(data.life_state == LifeState::Frozen, 'path into still life');
        assert(data.sequence_length == 1, 'length 1');
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

    // Audit #4 fix: caller registers segments under themselves and can finalize a mint to a
    // DIFFERENT recipient. Before the fix this reverted (read used the recipient namespace).
    #[test]
    fn mint_loop_from_partial_paths_to_other_recipient() {
        let d = deploy_all();
        let (loop_state, rows) = blinker_canonical();
        let id = token_id(@rows);
        let other: ContractAddress = 0x2.try_into().unwrap();
        let lm = IGolLoopMinterV2Dispatcher { contract_address: d.loop_minter };

        start_cheat_caller_address(d.loop_minter, d.creator);
        lm.mint_partial_path(loop_state, 2, loop_state); // registered under creator (caller)
        lm.mint_loop_from_partial_paths(loop_state, other); // creator pays, `other` receives
        stop_cheat_caller_address(d.loop_minter);

        let data = IGolLifeFormsV2Dispatcher { contract_address: d.lifeforms }
            .get_lifeform_data(id);
        assert(data.is_loop, 'minted to other recipient');
    }

    // Phase 4: token_uri renders the 41x41 grid on-chain as a base64 data URI.
    #[test]
    fn token_uri_renders() {
        let d = deploy_all();
        let (loop_state, rows) = blinker_canonical();
        let id = token_id(@rows);
        start_cheat_caller_address(d.loop_minter, d.creator);
        IGolLoopMinterV2Dispatcher { contract_address: d.loop_minter }
            .mint_loop(loop_state, 2, d.creator);
        stop_cheat_caller_address(d.loop_minter);

        let uri = IERC721MetadataDispatcher { contract_address: d.lifeforms }.token_uri(id);
        assert(uri.len() > 100, 'token_uri renders');
    }

    // mint a blinker to creator, return its token id
    fn mint_blinker(d: Deployment) -> u256 {
        let (loop_state, rows) = blinker_canonical();
        start_cheat_caller_address(d.loop_minter, d.creator);
        IGolLoopMinterV2Dispatcher { contract_address: d.loop_minter }
            .mint_loop(loop_state, 2, d.creator);
        stop_cheat_caller_address(d.loop_minter);
        token_id(@rows)
    }

    #[test]
    fn render_params_derived_at_mint() {
        let d = deploy_all();
        let id = mint_blinker(d);
        let rp = IGolLifeFormsV2Dispatcher { contract_address: d.lifeforms }.get_render_params(id);
        assert(rp.bg != rp.cell, 'derived bg!=cell');
        assert(rp.speed > 0 && rp.speed < 200, 'derived speed in range');
    }

    #[test]
    fn owner_can_set_render_params() {
        let d = deploy_all();
        let id = mint_blinker(d);
        let lf = IGolLifeFormsV2Dispatcher { contract_address: d.lifeforms };
        start_cheat_caller_address(d.lifeforms, d.creator);
        lf.set_render_params(id, 0x112233, 0xddeeff, 30);
        stop_cheat_caller_address(d.lifeforms);
        let rp = lf.get_render_params(id);
        assert(rp.bg == 0x112233 && rp.cell == 0xddeeff && rp.speed == 30, 'set applied');
    }

    #[test]
    #[should_panic(expected: 'bg and cell must differ')]
    fn set_rejects_equal_colors() {
        let d = deploy_all();
        let id = mint_blinker(d);
        start_cheat_caller_address(d.lifeforms, d.creator);
        IGolLifeFormsV2Dispatcher { contract_address: d.lifeforms }
            .set_render_params(id, 0x111111, 0x111111, 30);
        stop_cheat_caller_address(d.lifeforms);
    }

    #[test]
    #[should_panic(expected: 'speed out of range')]
    fn set_rejects_speed_at_max() {
        let d = deploy_all();
        let id = mint_blinker(d);
        start_cheat_caller_address(d.lifeforms, d.creator);
        IGolLifeFormsV2Dispatcher { contract_address: d.lifeforms }
            .set_render_params(id, 0x1, 0x2, 200);
        stop_cheat_caller_address(d.lifeforms);
    }

    #[test]
    #[should_panic(expected: 'Not token owner')]
    fn set_rejects_non_owner() {
        let d = deploy_all();
        let id = mint_blinker(d);
        let other: ContractAddress = 0x2.try_into().unwrap();
        start_cheat_caller_address(d.lifeforms, other);
        IGolLifeFormsV2Dispatcher { contract_address: d.lifeforms }
            .set_render_params(id, 0x1, 0x2, 30);
        stop_cheat_caller_address(d.lifeforms);
    }

    // Re-audit fix: token_uri reverts for a token that was never minted.
    #[test]
    #[should_panic(expected: 'ERC721: invalid token ID')]
    fn token_uri_reverts_for_phantom() {
        let d = deploy_all();
        IERC721MetadataDispatcher { contract_address: d.lifeforms }.token_uri(999999);
    }

    // Re-audit fix: mint rejects sequence_length == 0 (would charge 0 NUT).
    #[test]
    #[should_panic(expected: 'sequence_length_zero')]
    fn mint_rejects_zero_sequence_length() {
        let d = deploy_all();
        // grant MINTER_ROLE to creator so we can call mint() directly with a crafted record
        start_cheat_caller_address(d.lifeforms, d.creator);
        IAccessControlDispatcher { contract_address: d.lifeforms }
            .grant_role(MINTER_ROLE, d.creator);
        stop_cheat_caller_address(d.lifeforms);
        let (loop_state, _r) = blinker_canonical();
        let lf = LifeFormData {
            is_loop: true, is_still: false, is_alive: true, is_dead: false,
            sequence_length: 0, current_state: loop_state, age: 0,
        };
        start_cheat_caller_address(d.lifeforms, d.creator);
        IGolLifeFormsV2Dispatcher { contract_address: d.lifeforms }
            .mint(d.creator, d.creator, 123, lf);
        stop_cheat_caller_address(d.lifeforms);
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

        let data = IGolPathLifeFormsV2Dispatcher { contract_address: d.path_lifeforms }
            .get_path_data(id);
        assert(data.life_state == LifeState::Frozen, 'block is frozen'); // still life
        assert(data.start_state == l_state, 'path start stored');
        assert(data.sequence_length == 1, 'length 1');
    }

    // -----------------------------------------------------------------------------------------
    // Path escrow + anti-farm (challenge_burn). See docs/path-creatures-spec.md §5–§6.
    // -----------------------------------------------------------------------------------------

    // mint escrows `sequence_length` NUT into the path NFT (a sink until burned).
    #[test]
    fn mint_path_escrows_nut() {
        let d = deploy_all();
        let l_rows = grid_with(@array![(1_usize, 0b110_u64), (2_usize, 0b010_u64)]);
        let l_state = pack(@l_rows);
        let nut = IERC20Dispatcher { contract_address: d.nutrient };
        let before = nut.balance_of(d.path_lifeforms);

        start_cheat_caller_address(d.path_minter, d.creator);
        IGolPathMinterV2Dispatcher { contract_address: d.path_minter }
            .mint_path(l_state, 1, 1, d.creator);
        stop_cheat_caller_address(d.path_minter);

        // length 1 => 1 NUT escrowed into the path contract.
        assert(nut.balance_of(d.path_lifeforms) - before == ONE_NUT, 'escrowed 1 NUT');
    }

    // Grant the creator MINTER_ROLE on the path NFT so tests can craft records directly.
    fn grant_creator_minter(d: Deployment) {
        start_cheat_caller_address(d.path_lifeforms, d.creator);
        IAccessControlDispatcher { contract_address: d.path_lifeforms }
            .grant_role(MINTER_ROLE, d.creator);
        stop_cheat_caller_address(d.path_lifeforms);
    }

    // Mint a path record directly (creator as MINTER_ROLE), controlling start/length/target/timestamp.
    // challenge_burn only checks the sub-path stepping + timestamps + target equality, so crafted-but-
    // real-adjacent states exercise exactly that logic (path validity is the minter's job, tested above).
    fn direct_mint(
        d: Deployment, recipient: ContractAddress, id: u256, start: GridState, length: usize,
        target: felt252, ts: u64,
    ) {
        let pd = PathFormData {
            life_state: LifeState::Alive, sequence_length: length, start_state: start,
            target_loop_id: target, target_period: 2, minted_at: 0, escrow: 0,
        };
        start_cheat_block_timestamp(d.path_lifeforms, ts);
        start_cheat_caller_address(d.path_lifeforms, d.creator);
        IGolPathLifeFormsV2Dispatcher { contract_address: d.path_lifeforms }
            .mint(recipient, d.creator, id, pd);
        stop_cheat_caller_address(d.path_lifeforms);
        stop_cheat_block_timestamp(d.path_lifeforms);
    }

    #[test]
    fn challenge_burn_burns_subpath_and_pays_bounty() {
        let d = deploy_all();
        grant_creator_minter(d);
        // B = step(A): B is A's forward sub-path (k = 1).
        let a_rows = grid_with(@array![(5_usize, 0b1110_u64)]);
        let b_rows = step(@a_rows);
        let (a_id, b_id) = (token_id(@a_rows), token_id(@b_rows));
        let target: felt252 = 0x777;
        let farmer: ContractAddress = 0x5.try_into().unwrap();
        let hunter: ContractAddress = 0x6.try_into().unwrap();

        direct_mint(d, d.creator, a_id, pack(@a_rows), 2, target, 100); // older, length 2
        direct_mint(d, farmer, b_id, pack(@b_rows), 1, target, 200); // newer sub-path, length 1

        let nut = IERC20Dispatcher { contract_address: d.nutrient };
        let erc721 = IERC721Dispatcher { contract_address: d.path_lifeforms };
        assert(erc721.balance_of(farmer) == 1, 'farmer holds sub-path');
        let hunter_before = nut.balance_of(hunter);

        start_cheat_caller_address(d.path_lifeforms, hunter);
        IGolPathLifeFormsV2Dispatcher { contract_address: d.path_lifeforms }
            .challenge_burn(a_id, b_id, 0, 0, 0);
        stop_cheat_caller_address(d.path_lifeforms);

        // sub-path burned; its 1-NUT escrow paid to the challenger.
        assert(erc721.balance_of(farmer) == 0, 'sub-path burned');
        assert(nut.balance_of(hunter) - hunter_before == ONE_NUT, 'bounty paid');
    }

    #[test]
    #[should_panic(expected: 'older not older')]
    fn challenge_burn_rejects_wrong_direction() {
        let d = deploy_all();
        grant_creator_minter(d);
        let a_rows = grid_with(@array![(5_usize, 0b1110_u64)]);
        let b_rows = step(@a_rows);
        let (a_id, b_id) = (token_id(@a_rows), token_id(@b_rows));
        let target: felt252 = 0x777;
        // B (the sub-path) minted FIRST; A minted later. A can't absorb an older token.
        direct_mint(d, d.creator, b_id, pack(@b_rows), 1, target, 100);
        direct_mint(d, d.creator, a_id, pack(@a_rows), 2, target, 200);
        start_cheat_caller_address(d.path_lifeforms, d.creator);
        IGolPathLifeFormsV2Dispatcher { contract_address: d.path_lifeforms }
            .challenge_burn(a_id, b_id, 0, 0, 0);
        stop_cheat_caller_address(d.path_lifeforms);
    }

    #[test]
    #[should_panic(expected: 'not a sub-path')]
    fn challenge_burn_rejects_non_subpath() {
        let d = deploy_all();
        grant_creator_minter(d);
        let a_rows = grid_with(@array![(5_usize, 0b1110_u64)]);
        let u_rows = grid_with(@array![(20_usize, 0b101_u64)]); // unrelated, not step(A)
        let (a_id, u_id) = (token_id(@a_rows), token_id(@u_rows));
        let target: felt252 = 0x777;
        direct_mint(d, d.creator, a_id, pack(@a_rows), 2, target, 100);
        direct_mint(d, d.creator, u_id, pack(@u_rows), 1, target, 200);
        start_cheat_caller_address(d.path_lifeforms, d.creator);
        IGolPathLifeFormsV2Dispatcher { contract_address: d.path_lifeforms }
            .challenge_burn(a_id, u_id, 0, 0, 0);
        stop_cheat_caller_address(d.path_lifeforms);
    }

    // -----------------------------------------------------------------------------------------
    // Symmetry-copy challenge-burn (docs/symmetry-challenge-spec.md) — loops and paths.
    // -----------------------------------------------------------------------------------------

    /// Canonical rows of the blinker's cycle translated by (dr, dc), plus the phase witness k
    /// such that translate(step^k(canonical), dr, dc) == that canonical (lex-min may land on
    /// either phase — symmetry doesn't commute with lex-min).
    fn translated_blinker_canonical(rows: @Array<u64>, dr: usize, dc: usize) -> (Array<u64>, u32) {
        let c0 = translate(rows, dr, dc);
        let c1 = translate(@step(rows), dr, dc);
        if lt(@c0, @c1) {
            (c0, 0)
        } else {
            (c1, 1)
        }
    }

    #[test]
    fn loop_symmetry_copy_burn_pays_minted_bounty() {
        let d = deploy_all();
        let (a_state, a_rows) = blinker_canonical();
        let a_id = token_id(@a_rows);
        let farmer: ContractAddress = 0x5.try_into().unwrap();
        let hunter: ContractAddress = 0x6.try_into().unwrap();

        // A: the original blinker (nonce 1). B: the same blinker shifted one row down (nonce 2).
        let minter = IGolLoopMinterV2Dispatcher { contract_address: d.loop_minter };
        start_cheat_caller_address(d.loop_minter, d.creator);
        minter.mint_loop(a_state, 2, d.creator);
        stop_cheat_caller_address(d.loop_minter);
        let (b_rows, k) = translated_blinker_canonical(@a_rows, 1, 0);
        let b_id = token_id(@b_rows);
        start_cheat_caller_address(d.loop_minter, d.creator);
        minter.mint_loop(pack(@b_rows), 2, farmer);
        stop_cheat_caller_address(d.loop_minter);

        let lifeforms = IGolLifeFormsV2Dispatcher { contract_address: d.lifeforms };
        assert(lifeforms.get_mint_nonce(a_id) == 1, 'A nonce 1');
        assert(lifeforms.get_mint_nonce(b_id) == 2, 'B nonce 2');

        let nut = IERC20Dispatcher { contract_address: d.nutrient };
        let erc721 = IERC721Dispatcher { contract_address: d.lifeforms };
        assert(erc721.balance_of(farmer) == 1, 'farmer holds copy');
        let hunter_before = nut.balance_of(hunter);

        start_cheat_caller_address(d.lifeforms, hunter);
        lifeforms.challenge_burn(a_id, b_id, a_state, 0, 1, 0, k);
        stop_cheat_caller_address(d.lifeforms);

        // copy burned; bounty = B's mint price (2 NUT), freshly minted to the challenger.
        assert(erc721.balance_of(farmer) == 0, 'copy burned');
        assert(nut.balance_of(hunter) - hunter_before == 2 * ONE_NUT, 'minted bounty paid');
    }

    #[test]
    #[should_panic(expected: 'A not older')]
    fn loop_challenge_rejects_newer_challenger() {
        let d = deploy_all();
        let (a_state, a_rows) = blinker_canonical();
        let a_id = token_id(@a_rows);
        let minter = IGolLoopMinterV2Dispatcher { contract_address: d.loop_minter };
        start_cheat_caller_address(d.loop_minter, d.creator);
        minter.mint_loop(a_state, 2, d.creator);
        stop_cheat_caller_address(d.loop_minter);
        let (b_rows, _) = translated_blinker_canonical(@a_rows, 1, 0);
        let b_id = token_id(@b_rows);
        start_cheat_caller_address(d.loop_minter, d.creator);
        minter.mint_loop(pack(@b_rows), 2, d.creator);
        stop_cheat_caller_address(d.loop_minter);
        // The NEWER copy tries to burn the original: direction guard must refuse.
        IGolLifeFormsV2Dispatcher { contract_address: d.lifeforms }
            .challenge_burn(b_id, a_id, pack(@b_rows), 0, 40, 0, 0);
    }

    #[test]
    #[should_panic(expected: 'not a copy')]
    fn loop_challenge_rejects_non_copy() {
        let d = deploy_all();
        let (a_state, a_rows) = blinker_canonical();
        let a_id = token_id(@a_rows);
        let minter = IGolLoopMinterV2Dispatcher { contract_address: d.loop_minter };
        start_cheat_caller_address(d.loop_minter, d.creator);
        minter.mint_loop(a_state, 2, d.creator);
        stop_cheat_caller_address(d.loop_minter);
        // A DOUBLE blinker (two bars in one row): also period 2, but not a symmetry copy.
        let pair0 = grid_with(@array![(5_usize, 0b1110_u64 | 0x380000_u64)]);
        let pair1 = step(@pair0);
        let pair_rows = if lt(@pair0, @pair1) {
            pair0
        } else {
            pair1
        };
        let pair_id = token_id(@pair_rows);
        start_cheat_caller_address(d.loop_minter, d.creator);
        minter.mint_loop(pack(@pair_rows), 2, d.creator);
        stop_cheat_caller_address(d.loop_minter);
        IGolLifeFormsV2Dispatcher { contract_address: d.lifeforms }
            .challenge_burn(a_id, pair_id, a_state, 0, 0, 0, 0);
    }

    #[test]
    fn path_symmetry_copy_burn_pays_escrow() {
        let d = deploy_all();
        grant_creator_minter(d);
        let farmer: ContractAddress = 0x5.try_into().unwrap();
        let hunter: ContractAddress = 0x6.try_into().unwrap();
        // B = rot90 + translate(2,3) of A: an equal-length symmetry copy (different terminal id,
        // so the target pre-filter must be skipped for non-identity witnesses).
        let a_rows = grid_with(@array![(5_usize, 0b1110_u64)]);
        let b_rows = apply_symmetry(1, 2, 3, @a_rows);
        let (a_id, b_id) = (token_id(@a_rows), token_id(@b_rows));
        direct_mint(d, d.creator, a_id, pack(@a_rows), 2, 0x777, 100);
        direct_mint(d, farmer, b_id, pack(@b_rows), 2, 0x778, 200);

        let nut = IERC20Dispatcher { contract_address: d.nutrient };
        let erc721 = IERC721Dispatcher { contract_address: d.path_lifeforms };
        let hunter_before = nut.balance_of(hunter);

        start_cheat_caller_address(d.path_lifeforms, hunter);
        IGolPathLifeFormsV2Dispatcher { contract_address: d.path_lifeforms }
            .challenge_burn(a_id, b_id, 1, 2, 3);
        stop_cheat_caller_address(d.path_lifeforms);

        assert(erc721.balance_of(farmer) == 0, 'copy burned');
        // bounty = B's escrow (length 2 => 2 NUT).
        assert(nut.balance_of(hunter) - hunter_before == 2 * ONE_NUT, 'escrow paid');
    }

    #[test]
    fn path_stepped_symmetry_copy_burn() {
        let d = deploy_all();
        grant_creator_minter(d);
        // B = flip-h(step(A)): stepped AND transformed — evades both single checks, caught by the
        // unified rule (k = 1, g = flip-h).
        let a_rows = grid_with(@array![(5_usize, 0b1110_u64)]);
        let b_rows = apply_symmetry(4, 0, 5, @step(@a_rows));
        let (a_id, b_id) = (token_id(@a_rows), token_id(@b_rows));
        direct_mint(d, d.creator, a_id, pack(@a_rows), 2, 0x777, 100);
        direct_mint(d, d.creator, b_id, pack(@b_rows), 1, 0x779, 200);
        let erc721 = IERC721Dispatcher { contract_address: d.path_lifeforms };
        start_cheat_caller_address(d.path_lifeforms, d.creator);
        IGolPathLifeFormsV2Dispatcher { contract_address: d.path_lifeforms }
            .challenge_burn(a_id, b_id, 4, 0, 5);
        stop_cheat_caller_address(d.path_lifeforms);
        assert(erc721.balance_of(d.creator) == 1, 'only A remains');
    }

    #[test]
    #[should_panic(expected: 'older not longer')]
    fn path_identity_witness_requires_strictly_longer() {
        let d = deploy_all();
        grant_creator_minter(d);
        // Equal lengths with an IDENTITY witness must be refused (a symmetry witness is required
        // to burn an equal-length copy).
        let a_rows = grid_with(@array![(5_usize, 0b1110_u64)]);
        let b_rows = translate(@a_rows, 1, 0);
        let (a_id, b_id) = (token_id(@a_rows), token_id(@b_rows));
        direct_mint(d, d.creator, a_id, pack(@a_rows), 2, 0x777, 100);
        direct_mint(d, d.creator, b_id, pack(@b_rows), 2, 0x777, 200);
        start_cheat_caller_address(d.path_lifeforms, d.creator);
        IGolPathLifeFormsV2Dispatcher { contract_address: d.path_lifeforms }
            .challenge_burn(a_id, b_id, 0, 0, 0);
        stop_cheat_caller_address(d.path_lifeforms);
    }
}
