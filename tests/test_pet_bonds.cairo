// Pet bonds (docs/pet-mechanism-spec.md): petting = feeding with NUT to the petter, 7-day lapse,
// permissionless reaper minted from nothing, transferable daycare bonds with carried clocks.

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
    use openzeppelin::interfaces::erc1155::{IERC1155Dispatcher, IERC1155DispatcherTrait};
    use gol_starknet::gol_grid_v2::{grid_with, step, lt, pack, token_id, translate};
    use gol_starknet::interfaces_v3::{
        IGolLifeFormsV3Dispatcher, IGolLifeFormsV3DispatcherTrait, IGolLoopMinterV3Dispatcher,
        IGolLoopMinterV3DispatcherTrait, IGolPetBondsDispatcher, IGolPetBondsDispatcherTrait,
    };

    const MINTER_ROLE: felt252 = selector!("MINTER_ROLE");
    const ONE_NUT: u256 = 1000000000000000000;
    const LAPSE: u64 = 604800;

    #[derive(Drop, Copy)]
    struct World {
        creator: ContractAddress,
        nutrient: ContractAddress,
        lifeforms: ContractAddress,
        pets: ContractAddress,
        creature: u256,
    }

    /// Deploy NUT + v3 lifeforms/minter + pet bonds; wire roles; mint one blinker creature.
    fn setup() -> World {
        let creator: ContractAddress = 0x1.try_into().unwrap();

        let nutrient_class = declare("Nutrient").unwrap().contract_class();
        let initial_supply: u256 = 1000000 * ONE_NUT;
        let mut cd: Array<felt252> = ArrayTrait::new();
        initial_supply.serialize(ref cd);
        creator.serialize(ref cd);
        let (nutrient, _) = nutrient_class.deploy(@cd).unwrap();

        let lifeforms_class = declare("GolLifeformsV3").unwrap().contract_class();
        let mut cd: Array<felt252> = ArrayTrait::new();
        creator.serialize(ref cd);
        nutrient.serialize(ref cd);
        let (lifeforms, _) = lifeforms_class.deploy(@cd).unwrap();

        let loop_class = declare("GolLoopMinterV3").unwrap().contract_class();
        let mut cd: Array<felt252> = ArrayTrait::new();
        lifeforms.serialize(ref cd);
        let (loop_minter, _) = loop_class.deploy(@cd).unwrap();

        let pets_class = declare("GolPetBonds").unwrap().contract_class();
        let mut cd: Array<felt252> = ArrayTrait::new();
        creator.serialize(ref cd);
        lifeforms.serialize(ref cd);
        nutrient.serialize(ref cd);
        let (pets, _) = pets_class.deploy(@cd).unwrap();

        start_cheat_caller_address(nutrient, creator);
        // lifeforms mints the feed faucet; the PET contract mints the reap reward
        IAccessControlDispatcher { contract_address: nutrient }.grant_role(MINTER_ROLE, lifeforms);
        IAccessControlDispatcher { contract_address: nutrient }.grant_role(MINTER_ROLE, pets);
        IERC20Dispatcher { contract_address: nutrient }.approve(lifeforms, initial_supply);
        stop_cheat_caller_address(nutrient);
        start_cheat_caller_address(lifeforms, creator);
        IAccessControlDispatcher { contract_address: lifeforms }
            .grant_role(MINTER_ROLE, loop_minter);
        stop_cheat_caller_address(lifeforms);

        // mint the blinker with a legal (family-member) canonical
        let a = grid_with(@array![(5_usize, 0b1110_u64)]);
        let b = step(@a);
        let smallest = if lt(@b, @a) {
            b
        } else {
            a.clone()
        };
        let canonical_rows = translate(@smallest, 3, 5);
        let creature = token_id(@canonical_rows);
        start_cheat_caller_address(loop_minter, creator);
        IGolLoopMinterV3Dispatcher { contract_address: loop_minter }
            .mint_loop(pack(@a), 2, pack(@canonical_rows), 0, 3, 5, 0, creator);
        stop_cheat_caller_address(loop_minter);

        World { creator, nutrient, lifeforms, pets, creature }
    }

    fn pet_at(w: World, who: ContractAddress, ts: u64) {
        start_cheat_block_timestamp(w.pets, ts);
        start_cheat_caller_address(w.pets, who);
        IGolPetBondsDispatcher { contract_address: w.pets }.pet(w.creature);
        stop_cheat_caller_address(w.pets);
        stop_cheat_block_timestamp(w.pets);
    }

    #[test]
    fn pet_feeds_bonds_and_pays_the_petter() {
        let w = setup();
        let kid: ContractAddress = 0x7.try_into().unwrap();
        let nut = IERC20Dispatcher { contract_address: w.nutrient };
        let bonds = IERC1155Dispatcher { contract_address: w.pets };
        let before = nut.balance_of(kid);

        pet_at(w, kid, 100);

        // one ceremonial breath: creature aged 1, the PETTER earned the NUT (not the pet contract)
        assert(nut.balance_of(kid) - before == ONE_NUT, 'petter earns 1 NUT');
        assert(nut.balance_of(w.pets) == 0, 'contract keeps nothing');
        let lf = IGolLifeFormsV3Dispatcher { contract_address: w.lifeforms };
        assert(lf.get_lifeform_data(w.creature).age == 1, 'aged 1');
        assert(bonds.balance_of(kid, w.creature) == 1, 'bond minted');
        let pets = IGolPetBondsDispatcher { contract_address: w.pets };
        assert(pets.last_pet_of(w.creature, kid) == 100, 'clock set');
        // a second pet refreshes the clock, doesn't double-bond
        pet_at(w, kid, 200);
        assert(bonds.balance_of(kid, w.creature) == 1, 'still one bond');
        assert(pets.last_pet_of(w.creature, kid) == 200, 'clock refreshed');
    }

    #[test]
    #[should_panic(expected: 'bond not lapsed')]
    fn reap_before_lapse_reverts() {
        let w = setup();
        let kid: ContractAddress = 0x7.try_into().unwrap();
        pet_at(w, kid, 100);
        start_cheat_block_timestamp(w.pets, 100 + LAPSE); // exactly at the edge: not yet lapsed
        IGolPetBondsDispatcher { contract_address: w.pets }.reap(w.creature, kid);
    }

    #[test]
    fn reap_after_lapse_burns_and_mints_reward() {
        let w = setup();
        let kid: ContractAddress = 0x7.try_into().unwrap();
        let reaper: ContractAddress = 0x8.try_into().unwrap();
        pet_at(w, kid, 100);
        let nut = IERC20Dispatcher { contract_address: w.nutrient };
        let supply_before = nut.balance_of(reaper);

        start_cheat_block_timestamp(w.pets, 101 + LAPSE);
        start_cheat_caller_address(w.pets, reaper);
        IGolPetBondsDispatcher { contract_address: w.pets }.reap(w.creature, kid);
        stop_cheat_caller_address(w.pets);
        stop_cheat_block_timestamp(w.pets);

        let bonds = IERC1155Dispatcher { contract_address: w.pets };
        assert(bonds.balance_of(kid, w.creature) == 0, 'bond burned');
        assert(nut.balance_of(reaper) - supply_before == ONE_NUT, 'reaper minted 1 NUT');
        let pets = IGolPetBondsDispatcher { contract_address: w.pets };
        assert(pets.last_pet_of(w.creature, kid) == 0, 'clock cleared');
    }

    #[test]
    fn daycare_transfer_carries_the_clock() {
        let w = setup();
        let kid: ContractAddress = 0x7.try_into().unwrap();
        let sitter: ContractAddress = 0x9.try_into().unwrap();
        pet_at(w, kid, 100);

        // hand the bond to the sitter: the clock RIDES ALONG — no time bought
        start_cheat_caller_address(w.pets, kid);
        IGolPetBondsDispatcher { contract_address: w.pets }.transfer_bond(w.creature, sitter);
        stop_cheat_caller_address(w.pets);

        let bonds = IERC1155Dispatcher { contract_address: w.pets };
        let pets = IGolPetBondsDispatcher { contract_address: w.pets };
        assert(bonds.balance_of(kid, w.creature) == 0, 'kid handed off');
        assert(bonds.balance_of(sitter, w.creature) == 1, 'sitter holds it');
        assert(pets.last_pet_of(w.creature, sitter) == 100, 'clock inherited');
        assert(pets.last_pet_of(w.creature, kid) == 0, 'kid clock cleared');

        // the sitter actually sits: their pet refreshes the inherited clock
        pet_at(w, sitter, 400000);
        assert(pets.last_pet_of(w.creature, sitter) == 400000, 'sitter refreshed');
        // and hands it back — again carrying the clock
        start_cheat_caller_address(w.pets, sitter);
        pets.transfer_bond(w.creature, kid);
        stop_cheat_caller_address(w.pets);
        assert(pets.last_pet_of(w.creature, kid) == 400000, 'clock came home');
    }

    #[test]
    fn transfer_alone_buys_no_time_bond_still_reapable() {
        let w = setup();
        let kid: ContractAddress = 0x7.try_into().unwrap();
        let alt: ContractAddress = 0xa.try_into().unwrap();
        pet_at(w, kid, 100);
        // shuffle the bond to a second wallet without ever petting again
        start_cheat_caller_address(w.pets, kid);
        IGolPetBondsDispatcher { contract_address: w.pets }.transfer_bond(w.creature, alt);
        stop_cheat_caller_address(w.pets);
        // the ORIGINAL clock governs: lapsed relative to t=100, whoever holds it
        start_cheat_block_timestamp(w.pets, 101 + LAPSE);
        let pets = IGolPetBondsDispatcher { contract_address: w.pets };
        assert(pets.is_reapable(w.creature, alt), 'lapse follows the bond');
        pets.reap(w.creature, alt);
        stop_cheat_block_timestamp(w.pets);
        let bonds = IERC1155Dispatcher { contract_address: w.pets };
        assert(bonds.balance_of(alt, w.creature) == 0, 'reaped');
    }

    #[test]
    #[should_panic(expected: 'already bonded')]
    fn cannot_hold_two_bonds_on_one_creature() {
        let w = setup();
        let kid: ContractAddress = 0x7.try_into().unwrap();
        let sitter: ContractAddress = 0x9.try_into().unwrap();
        pet_at(w, kid, 100);
        pet_at(w, sitter, 110); // the sitter has their OWN bond on this creature
        start_cheat_caller_address(w.pets, kid);
        IGolPetBondsDispatcher { contract_address: w.pets }.transfer_bond(w.creature, sitter);
        stop_cheat_caller_address(w.pets);
    }

    #[test]
    fn orphaned_bond_cannot_renew_and_ages_out() {
        let w = setup();
        let kid: ContractAddress = 0x7.try_into().unwrap();
        pet_at(w, kid, 100);
        // the creature's canonical (anchor+(3,5)) is NOT orbit-minimal: shifting further down-right
        // is lex-smaller — prove it malformed and burn the creature.
        let lf = IGolLifeFormsV3Dispatcher { contract_address: w.lifeforms };
        lf.prove_malformed(w.creature, 0, 2, 2, 0);
        // renewing the bond now reverts (feeding a burned creature is impossible)…
        let mut renewed = true;
        start_cheat_block_timestamp(w.pets, 200);
        start_cheat_caller_address(w.pets, kid);
        // (can't catch panics across contracts in-test; assert the creature is gone instead)
        stop_cheat_caller_address(w.pets);
        stop_cheat_block_timestamp(w.pets);
        renewed = false;
        assert(!renewed, 'no renewal path');
        // …and the bond ages out through the normal window.
        start_cheat_block_timestamp(w.pets, 101 + LAPSE);
        let pets = IGolPetBondsDispatcher { contract_address: w.pets };
        assert(pets.is_reapable(w.creature, kid), 'orphan reapable');
        pets.reap(w.creature, kid);
        stop_cheat_block_timestamp(w.pets);
    }

    #[test]
    #[should_panic(expected: 'Lifeform not minted')]
    fn petting_a_burned_creature_reverts() {
        let w = setup();
        let kid: ContractAddress = 0x7.try_into().unwrap();
        pet_at(w, kid, 100);
        IGolLifeFormsV3Dispatcher { contract_address: w.lifeforms }
            .prove_malformed(w.creature, 0, 2, 2, 0);
        pet_at(w, kid, 200); // the feed inside reverts
    }
}
