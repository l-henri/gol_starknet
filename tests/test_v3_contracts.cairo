// v3 integration tests — the orbit-canonical identity model (docs/v3-identity-spec.md).
// Key semantics under test: witness-assisted mint (drawn preserved for display), copy prevention
// by id collision, optimistic minimality + prove_malformed fraud-proofs paying the mint escrow,
// the feed_for ride-along, and the carried-over sub-path challenge on Wanderers.

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
    use openzeppelin::interfaces::erc721::{IERC721Dispatcher, IERC721DispatcherTrait};
    use gol_starknet::gol_grid_v2::{
        GridState, grid_with, step, lt, eq, pack, token_id, translate, apply_symmetry,
    };
    use gol_starknet::interfaces_v2::{PathFormData, LifeState};
    use gol_starknet::interfaces_v3::{
        IGolLifeFormsV3Dispatcher, IGolLifeFormsV3DispatcherTrait, IGolLoopMinterV3Dispatcher,
        IGolLoopMinterV3DispatcherTrait, IGolWanderersV3Dispatcher,
        IGolWanderersV3DispatcherTrait, IGolWandererMinterV3Dispatcher,
        IGolWandererMinterV3DispatcherTrait,
    };

    const MINTER_ROLE: felt252 = selector!("MINTER_ROLE");
    const ONE_NUT: u256 = 1000000000000000000;

    #[derive(Drop, Copy)]
    struct Deployment {
        creator: ContractAddress,
        nutrient: ContractAddress,
        lifeforms: ContractAddress,
        wanderers: ContractAddress,
        loop_minter: ContractAddress,
        wanderer_minter: ContractAddress,
    }

    fn deploy_all() -> Deployment {
        let creator: ContractAddress = 0x1.try_into().unwrap();

        let nutrient_class = declare("Nutrient").unwrap().contract_class();
        let initial_supply: u256 = 1000000 * ONE_NUT;
        let mut nutrient_cd: Array<felt252> = ArrayTrait::new();
        initial_supply.serialize(ref nutrient_cd);
        creator.serialize(ref nutrient_cd);
        let (nutrient, _) = nutrient_class.deploy(@nutrient_cd).unwrap();

        let lifeforms_class = declare("GolLifeformsV3").unwrap().contract_class();
        let mut lifeforms_cd: Array<felt252> = ArrayTrait::new();
        creator.serialize(ref lifeforms_cd);
        nutrient.serialize(ref lifeforms_cd);
        let (lifeforms, _) = lifeforms_class.deploy(@lifeforms_cd).unwrap();

        let loop_class = declare("GolLoopMinterV3").unwrap().contract_class();
        let mut loop_cd: Array<felt252> = ArrayTrait::new();
        lifeforms.serialize(ref loop_cd);
        let (loop_minter, _) = loop_class.deploy(@loop_cd).unwrap();

        let wanderers_class = declare("GolWanderersV3").unwrap().contract_class();
        let mut wanderers_cd: Array<felt252> = ArrayTrait::new();
        creator.serialize(ref wanderers_cd);
        nutrient.serialize(ref wanderers_cd);
        let (wanderers, _) = wanderers_class.deploy(@wanderers_cd).unwrap();

        let wminter_class = declare("GolWandererMinterV3").unwrap().contract_class();
        let mut wminter_cd: Array<felt252> = ArrayTrait::new();
        wanderers.serialize(ref wminter_cd);
        let (wanderer_minter, _) = wminter_class.deploy(@wminter_cd).unwrap();

        // lifeforms may mint NUT (the feed faucet).
        start_cheat_caller_address(nutrient, creator);
        IAccessControlDispatcher { contract_address: nutrient }.grant_role(MINTER_ROLE, lifeforms);
        stop_cheat_caller_address(nutrient);
        // minters may mint their NFTs.
        start_cheat_caller_address(lifeforms, creator);
        IAccessControlDispatcher { contract_address: lifeforms }
            .grant_role(MINTER_ROLE, loop_minter);
        stop_cheat_caller_address(lifeforms);
        start_cheat_caller_address(wanderers, creator);
        IAccessControlDispatcher { contract_address: wanderers }
            .grant_role(MINTER_ROLE, wanderer_minter);
        stop_cheat_caller_address(wanderers);
        // creator funds mint escrows on both NFTs.
        start_cheat_caller_address(nutrient, creator);
        IERC20Dispatcher { contract_address: nutrient }.approve(lifeforms, initial_supply);
        IERC20Dispatcher { contract_address: nutrient }.approve(wanderers, initial_supply);
        stop_cheat_caller_address(nutrient);

        Deployment { creator, nutrient, lifeforms, wanderers, loop_minter, wanderer_minter }
    }

    /// Blinker phase-A rows and the cycle's TIME-lex-min (the witness anchor the minter derives).
    fn blinker() -> (Array<u64>, Array<u64>) {
        let a = grid_with(@array![(5_usize, 0b1110_u64)]);
        let b = step(@a);
        let smallest = if lt(@b, @a) {
            b
        } else {
            a.clone()
        };
        (a, smallest)
    }

    // -------------------------------------------------------------------------------------------
    // Genesis
    // -------------------------------------------------------------------------------------------

    #[test]
    fn constructor_genesis_mints_empty_grid_to_deployer() {
        let d = deploy_all();
        let empty_rowvals: Array<(usize, u64)> = array![];
        let empty_rows = grid_with(@empty_rowvals);
        let id = token_id(@empty_rows);
        let lf = IGolLifeFormsV3Dispatcher { contract_address: d.lifeforms };
        let erc721 = IERC721Dispatcher { contract_address: d.lifeforms };
        assert(erc721.owner_of(id) == d.creator, 'genesis to deployer');
        let data = lf.get_lifeform_data(id);
        assert(data.is_loop && data.is_still && data.is_dead && !data.is_alive, 'vacuum still life');
        assert(data.sequence_length == 1, 'period 1');
        assert(lf.get_canonical_state(id) == data.current_state, 'own canonical');
        assert(lf.get_escrow(id) == 0, 'no escrow');
        assert(lf.get_mint_nonce(id) == 1, 'genesis nonce 1');
        assert(lf.get_discoverer(id) == d.creator, 'discoverer = deployer');
    }

    #[test]
    #[should_panic(expected: 'id is minimal')]
    fn genesis_empty_grid_is_fraud_proof() {
        // The empty grid is the global lex-minimum: prove_malformed can never exhibit smaller.
        let d = deploy_all();
        let empty_rowvals: Array<(usize, u64)> = array![];
        let id = token_id(@grid_with(@empty_rowvals));
        let lf = IGolLifeFormsV3Dispatcher { contract_address: d.lifeforms };
        lf.prove_malformed(id, 1, 7, 3, 0);
    }

    // -------------------------------------------------------------------------------------------
    // Loops
    // -------------------------------------------------------------------------------------------

    #[test]
    fn loop_mint_preserves_drawn_and_records_canonical_escrow() {
        let d = deploy_all();
        let (drawn, smallest) = blinker();
        // Claim a family member DEEP-shifted down-right (lex-smaller than the anchor) as canonical.
        let canonical_rows = translate(@smallest, 3, 5);
        let canonical = pack(@canonical_rows);
        let id = token_id(@canonical_rows);

        start_cheat_caller_address(d.loop_minter, d.creator);
        start_cheat_block_timestamp(d.lifeforms, 1700000000);
        let ok = IGolLoopMinterV3Dispatcher { contract_address: d.loop_minter }
            .mint_loop(pack(@drawn), 2, canonical, 0, 3, 5, 0, d.creator);
        stop_cheat_block_timestamp(d.lifeforms);
        stop_cheat_caller_address(d.loop_minter);
        assert(ok, 'minted');

        let lf = IGolLifeFormsV3Dispatcher { contract_address: d.lifeforms };
        // display keeps the DRAWN orientation, identity keeps the canonical
        let data = lf.get_lifeform_data(id);
        assert(eq(@gol_starknet::gol_grid_v2::unpack(@data.current_state), @drawn), 'drawn kept');
        assert(lf.get_canonical_state(id) == canonical, 'canonical stored');
        assert(lf.get_escrow(id) == 2 * ONE_NUT, 'escrow = period NUT');
        // nonce 1 is the constructor's empty-grid genesis; the first user mint is 2
        assert(lf.get_mint_nonce(id) == 2, 'nonce 2');
        assert(lf.get_minted_at(id) == 1700000000, 'minted_at stamped');
        assert(lf.get_discoverer(id) == d.creator, 'discoverer stamped');
        let erc721 = IERC721Dispatcher { contract_address: d.lifeforms };
        assert(erc721.owner_of(id) == d.creator, 'owner');
    }

    #[test]
    #[should_panic]
    fn loop_copy_mint_reverts_on_id_collision() {
        let d = deploy_all();
        let (drawn, smallest) = blinker();
        let canonical_rows = translate(@smallest, 3, 5);
        let canonical = pack(@canonical_rows);
        let minter = IGolLoopMinterV3Dispatcher { contract_address: d.loop_minter };
        start_cheat_caller_address(d.loop_minter, d.creator);
        minter.mint_loop(pack(@drawn), 2, canonical, 0, 3, 5, 0, d.creator);
        // A SHIFTED copy of the blinker claims the same (correct-for-its-family) canonical:
        // same family -> same canonical -> same token id -> ERC721 collision revert.
        // The copy sits at +(7,9), far from any wrap, so its time-lex-min is the original's
        // shifted by (7,9); the witness back to the canonical (anchor+(3,5)) is the difference:
        // (3-7 mod 41, 5-9 mod 41) = (37, 37).
        let copy_drawn = translate(@drawn, 7, 9);
        assert(eq(@translate(@translate(@smallest, 7, 9), 37, 37), @canonical_rows), 'witness math');
        minter.mint_loop(pack(@copy_drawn), 2, canonical, 0, 37, 37, 0, d.creator);
        stop_cheat_caller_address(d.loop_minter);
    }

    #[test]
    fn loop_mint_witness_anchors_at_drawn() {
        // Locks the 2026-08-03 anchor semantics: k is relative to the DRAWN state, not the
        // walk's time-lex-min. Draw phase B (NOT the time-min); step^1(B) = A; witness = the
        // translation taking A to the claimed canonical.
        let d = deploy_all();
        let (a, smallest) = blinker();
        assert(eq(@a, @smallest), 'A is the time-min');
        let drawn_b = step(@a);
        let canonical_rows = translate(@smallest, 3, 5);
        let canonical = pack(@canonical_rows);
        let id = token_id(@canonical_rows);
        start_cheat_caller_address(d.loop_minter, d.creator);
        let ok = IGolLoopMinterV3Dispatcher { contract_address: d.loop_minter }
            .mint_loop(pack(@drawn_b), 2, canonical, 0, 3, 5, 1, d.creator);
        stop_cheat_caller_address(d.loop_minter);
        assert(ok, 'minted from phase B');
        // display keeps the drawn (B) orientation; identity is the canonical
        let lf = IGolLifeFormsV3Dispatcher { contract_address: d.lifeforms };
        let data = lf.get_lifeform_data(id);
        assert(eq(@gol_starknet::gol_grid_v2::unpack(@data.current_state), @drawn_b), 'drawn kept');
    }

    #[test]
    #[should_panic(expected: 'k out of range')]
    fn loop_mint_rejects_k_at_period() {
        let d = deploy_all();
        let (drawn, smallest) = blinker();
        let canonical = pack(@translate(@smallest, 3, 5));
        start_cheat_caller_address(d.loop_minter, d.creator);
        IGolLoopMinterV3Dispatcher { contract_address: d.loop_minter }
            .mint_loop(pack(@drawn), 2, canonical, 0, 3, 5, 2, d.creator);
        stop_cheat_caller_address(d.loop_minter);
    }

    #[test]
    #[should_panic(expected: 'bad canonical witness')]
    fn loop_mint_rejects_foreign_canonical() {
        let d = deploy_all();
        let (drawn, _) = blinker();
        // A canonical from a DIFFERENT family (a block) can't be witnessed from the blinker.
        let block = grid_with(@array![(10_usize, 0b110_u64), (11_usize, 0b110_u64)]);
        start_cheat_caller_address(d.loop_minter, d.creator);
        IGolLoopMinterV3Dispatcher { contract_address: d.loop_minter }
            .mint_loop(pack(@drawn), 2, pack(@block), 0, 0, 0, 0, d.creator);
        stop_cheat_caller_address(d.loop_minter);
    }

    #[test]
    fn prove_malformed_burns_and_pays_escrow() {
        let d = deploy_all();
        let (drawn, smallest) = blinker();
        // Mint with the anchor ITSELF as canonical (legal family member, but not orbit-minimal:
        // shifting content down-right zeroes earlier rows -> lex-smaller members exist).
        let canonical = pack(@smallest);
        let id = token_id(@smallest);
        start_cheat_caller_address(d.loop_minter, d.creator);
        IGolLoopMinterV3Dispatcher { contract_address: d.loop_minter }
            .mint_loop(pack(@drawn), 2, canonical, 0, 0, 0, 0, d.creator);
        stop_cheat_caller_address(d.loop_minter);

        let prover: ContractAddress = 0x6.try_into().unwrap();
        let nut = IERC20Dispatcher { contract_address: d.nutrient };
        let before = nut.balance_of(prover);
        // sanity: the exhibited member really is smaller
        assert(lt(@translate(@smallest, 2, 2), @smallest), 'exhibit smaller');

        let lf = IGolLifeFormsV3Dispatcher { contract_address: d.lifeforms };
        start_cheat_caller_address(d.lifeforms, prover);
        lf.prove_malformed(id, 0, 2, 2, 0);
        stop_cheat_caller_address(d.lifeforms);

        assert(nut.balance_of(prover) - before == 2 * ONE_NUT, 'escrow paid to prover');
        assert(lf.get_escrow(id) == 0, 'escrow cleared');
        let erc721 = IERC721Dispatcher { contract_address: d.lifeforms };
        // only the constructor's empty-grid genesis remains
        assert(erc721.balance_of(d.creator) == 1, 'token burned');
    }

    #[test]
    #[should_panic(expected: 'id is minimal')]
    fn prove_malformed_rejects_larger_candidate() {
        let d = deploy_all();
        let (drawn, smallest) = blinker();
        // canonical deep-shifted; shifting UP-LEFT wraps content to earlier rows -> LARGER.
        let canonical_rows = translate(@smallest, 3, 5);
        let id = token_id(@canonical_rows);
        start_cheat_caller_address(d.loop_minter, d.creator);
        IGolLoopMinterV3Dispatcher { contract_address: d.loop_minter }
            .mint_loop(pack(@drawn), 2, pack(@canonical_rows), 0, 3, 5, 0, d.creator);
        stop_cheat_caller_address(d.loop_minter);
        IGolLifeFormsV3Dispatcher { contract_address: d.lifeforms }
            .prove_malformed(id, 0, 38, 36, 0); // undoes the shift and more: content moves up
    }

    #[test]
    fn feed_for_credits_the_beneficiary() {
        let d = deploy_all();
        let (drawn, smallest) = blinker();
        let canonical_rows = translate(@smallest, 3, 5);
        let id = token_id(@canonical_rows);
        start_cheat_caller_address(d.loop_minter, d.creator);
        IGolLoopMinterV3Dispatcher { contract_address: d.loop_minter }
            .mint_loop(pack(@drawn), 2, pack(@canonical_rows), 0, 3, 5, 0, d.creator);
        stop_cheat_caller_address(d.loop_minter);

        let kid: ContractAddress = 0x7.try_into().unwrap();
        let nut = IERC20Dispatcher { contract_address: d.nutrient };
        let before = nut.balance_of(kid);
        let lf = IGolLifeFormsV3Dispatcher { contract_address: d.lifeforms };
        // the caller (creator, standing in for a pet contract) feeds; the NUT lands on the kid
        start_cheat_caller_address(d.lifeforms, d.creator);
        lf.move_lifeform_forward_n_for(id, 5, kid);
        stop_cheat_caller_address(d.lifeforms);
        assert(nut.balance_of(kid) - before == 5 * ONE_NUT, 'beneficiary earns the NUT');
        assert(lf.get_lifeform_data(id).age == 5, 'aged 5');
    }

    // -------------------------------------------------------------------------------------------
    // Wanderers
    // -------------------------------------------------------------------------------------------

    #[test]
    fn wanderer_mint_with_witness() {
        let d = deploy_all();
        // L-tromino settles into a still block in 1 step (v2's frozen fixture).
        let start = grid_with(@array![(1_usize, 0b110_u64), (2_usize, 0b010_u64)]);
        let canonical_rows = translate(@start, 4, 6);
        let id = token_id(@canonical_rows);
        start_cheat_caller_address(d.wanderer_minter, d.creator);
        let ok = IGolWandererMinterV3Dispatcher { contract_address: d.wanderer_minter }
            .mint_path(pack(@start), 1, 1, pack(@canonical_rows), 0, 4, 6, d.creator);
        stop_cheat_caller_address(d.wanderer_minter);
        assert(ok, 'minted');
        let w = IGolWanderersV3Dispatcher { contract_address: d.wanderers };
        let data = w.get_path_data(id);
        assert(data.life_state == LifeState::Frozen, 'frozen');
        assert(data.start_state == pack(@start), 'drawn start kept');
        assert(w.get_canonical_state(id) == pack(@canonical_rows), 'canonical stored');
        assert(data.escrow == ONE_NUT, 'escrowed');
        assert(w.get_mint_nonce(id) == 1, 'nonce 1');
        assert(w.get_discoverer(id) == d.creator, 'discoverer stamped');
    }

    #[test]
    #[should_panic]
    fn wanderer_copy_mint_reverts() {
        let d = deploy_all();
        let start = grid_with(@array![(1_usize, 0b110_u64), (2_usize, 0b010_u64)]);
        let canonical_rows = translate(@start, 4, 6);
        let minter = IGolWandererMinterV3Dispatcher { contract_address: d.wanderer_minter };
        start_cheat_caller_address(d.wanderer_minter, d.creator);
        minter.mint_path(pack(@start), 1, 1, pack(@canonical_rows), 0, 4, 6, d.creator);
        // the same tromino shifted by (10,0): witness back to canonical (+(4,6)) is
        // (4-10 mod 41, 6-0) = (35, 6). Same family -> same canonical -> id collision.
        let copy = translate(@start, 10, 0);
        minter.mint_path(pack(@copy), 1, 1, pack(@canonical_rows), 0, 35, 6, d.creator);
        stop_cheat_caller_address(d.wanderer_minter);
    }

    // Grant the creator MINTER_ROLE on the wanderers NFT so tests can craft records directly
    // (challenge_burn only checks stepping + nonces + targets; validity is the minter's job).
    fn grant_creator_minter(d: Deployment) {
        start_cheat_caller_address(d.wanderers, d.creator);
        IAccessControlDispatcher { contract_address: d.wanderers }
            .grant_role(MINTER_ROLE, d.creator);
        stop_cheat_caller_address(d.wanderers);
    }

    fn direct_mint(
        d: Deployment,
        recipient: ContractAddress,
        start: @Array<u64>,
        length: usize,
        target: felt252,
    ) -> u256 {
        // canonical := the start itself (the NFT checks id==hash(canonical), not minimality)
        let id = token_id(start);
        let pd = PathFormData {
            life_state: LifeState::Alive,
            sequence_length: length,
            start_state: pack(start),
            target_loop_id: target,
            target_period: 2,
            minted_at: 0,
            escrow: 0,
        };
        start_cheat_caller_address(d.wanderers, d.creator);
        IGolWanderersV3Dispatcher { contract_address: d.wanderers }
            .mint(recipient, d.creator, id, pd, pack(start));
        stop_cheat_caller_address(d.wanderers);
        id
    }

    #[test]
    fn wanderer_subpath_challenge_regression() {
        let d = deploy_all();
        grant_creator_minter(d);
        let a_rows = grid_with(@array![(5_usize, 0b1110_u64)]);
        let b_rows = step(@a_rows);
        let farmer: ContractAddress = 0x5.try_into().unwrap();
        let hunter: ContractAddress = 0x6.try_into().unwrap();
        let a_id = direct_mint(d, d.creator, @a_rows, 2, 0x777);
        let b_id = direct_mint(d, farmer, @b_rows, 1, 0x777);

        let nut = IERC20Dispatcher { contract_address: d.nutrient };
        let before = nut.balance_of(hunter);
        let w = IGolWanderersV3Dispatcher { contract_address: d.wanderers };
        start_cheat_caller_address(d.wanderers, hunter);
        w.challenge_burn(a_id, b_id, 0, 0, 0);
        stop_cheat_caller_address(d.wanderers);
        assert(nut.balance_of(hunter) - before == ONE_NUT, 'escrow bounty paid');
        let erc721 = IERC721Dispatcher { contract_address: d.wanderers };
        assert(erc721.balance_of(farmer) == 0, 'sub-path burned');
    }

    #[test]
    fn wanderer_prove_malformed() {
        let d = deploy_all();
        grant_creator_minter(d);
        // canonical = the start itself (row 5 content): translate(2,2) is lex-smaller -> malformed
        let start = grid_with(@array![(5_usize, 0b1110_u64)]);
        let id = direct_mint(d, d.creator, @start, 3, 0x777);
        let prover: ContractAddress = 0x8.try_into().unwrap();
        let nut = IERC20Dispatcher { contract_address: d.nutrient };
        let before = nut.balance_of(prover);
        let w = IGolWanderersV3Dispatcher { contract_address: d.wanderers };
        start_cheat_caller_address(d.wanderers, prover);
        w.prove_malformed(id, 0, 2, 2);
        stop_cheat_caller_address(d.wanderers);
        assert(nut.balance_of(prover) - before == 3 * ONE_NUT, 'escrow paid');
        let erc721 = IERC721Dispatcher { contract_address: d.wanderers };
        assert(erc721.balance_of(d.creator) == 0, 'burned');
    }
}
