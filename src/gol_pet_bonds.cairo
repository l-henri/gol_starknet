//! GolPetBonds — the caretaker layer (docs/pet-mechanism-spec.md). An ERC-1155 where
//! `token_id = the creature's token id` and every holder has at most ONE unit: the creature's
//! caretaker pack. Petting IS feeding (one ceremonial generation via the v3 `feed_for` hook, so
//! the NUT lands on the petter); each pet refreshes the holder's 7-day clock. A lapsed bond is
//! permissionlessly reapable for a freshly minted 1-NUT reward. Bonds are TRANSFERABLE (the
//! "daycare" hand-off) but the clock RIDES ALONG — a transfer buys zero time, so self-transfers
//! can't dodge the lapse. Bonds of a burned creature can't be renewed (the feed reverts) and age
//! out through the normal window.

#[starknet::contract]
pub mod GolPetBonds {
    use openzeppelin::introspection::src5::SRC5Component;
    use openzeppelin::token::erc1155::ERC1155Component;
    use openzeppelin::access::accesscontrol::AccessControlComponent;
    use openzeppelin::access::accesscontrol::DEFAULT_ADMIN_ROLE;
    use openzeppelin::upgrades::UpgradeableComponent;
    use openzeppelin::interfaces::upgrades::IUpgradeable;
    use starknet::ClassHash;
    use starknet::{ContractAddress, get_caller_address, get_block_timestamp};
    use starknet::storage::{Map, StorageMapReadAccess, StorageMapWriteAccess};
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use core::num::traits::Zero;
    use gol_starknet::interfaces_v3::{
        IGolPetBonds, IGolLifeFormsV3Dispatcher, IGolLifeFormsV3DispatcherTrait,
    };
    use gol_starknet::interfaces::{
        IGolNutrientTokenDispatcher, IGolNutrientTokenDispatcherTrait,
    };

    component!(path: ERC1155Component, storage: erc1155, event: ERC1155Event);
    component!(path: SRC5Component, storage: src5, event: SRC5Event);
    component!(path: AccessControlComponent, storage: accesscontrol, event: AccessControlEvent);
    component!(path: UpgradeableComponent, storage: upgradeable, event: UpgradeableEvent);

    /// 7 days without a pet → the bond is reapable.
    const LAPSE_SECONDS: u64 = 604800;
    /// Reaper reward, freshly minted (proof-of-participation, like the feed faucet). Tunable PoC constant.
    const REAP_REWARD: u256 = 1000000000000000000; // 1 NUT

    #[abi(embed_v0)]
    impl ERC1155Impl = ERC1155Component::ERC1155Impl<ContractState>;
    #[abi(embed_v0)]
    impl ERC1155MetadataURIImpl = ERC1155Component::ERC1155MetadataURIImpl<ContractState>;
    #[abi(embed_v0)]
    impl SRC5Impl = SRC5Component::SRC5Impl<ContractState>;
    impl ERC1155InternalImpl = ERC1155Component::InternalImpl<ContractState>;
    #[abi(embed_v0)]
    impl AccessControlImpl = AccessControlComponent::AccessControlImpl<ContractState>;
    impl AccessControlInternalImpl = AccessControlComponent::InternalImpl<ContractState>;
    impl UpgradeableInternalImpl = UpgradeableComponent::InternalImpl<ContractState>;

    #[storage]
    struct Storage {
        #[substorage(v0)]
        erc1155: ERC1155Component::Storage,
        #[substorage(v0)]
        src5: SRC5Component::Storage,
        #[substorage(v0)]
        accesscontrol: AccessControlComponent::Storage,
        #[substorage(v0)]
        upgradeable: UpgradeableComponent::Storage,
        /// (creature_id, holder) -> timestamp of the holder's last pet. The tamagotchi clock:
        /// per-HOLDER (ERC-1155 units are fungible per id, so per-unit state is impossible), and
        /// CARRIED on transfer (see the hooks) so moving a bond never buys time.
        pub last_pet: Map<(u256, ContractAddress), u64>,
        pub gol_lifeforms: ContractAddress,
        pub nutrient_token_contract: ContractAddress,
    }

    #[derive(Drop, starknet::Event)]
    struct PettedEvent {
        creature_id: u256,
        holder: ContractAddress,
        /// The creature's generation age after this breath.
        age: u32,
    }
    #[derive(Drop, starknet::Event)]
    struct ReapedEvent {
        creature_id: u256,
        holder: ContractAddress,
        reaper: ContractAddress,
        reward: u256,
    }
    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        ERC1155Event: ERC1155Component::Event,
        #[flat]
        SRC5Event: SRC5Component::Event,
        #[flat]
        AccessControlEvent: AccessControlComponent::Event,
        #[flat]
        UpgradeableEvent: UpgradeableComponent::Event,
        Petted: PettedEvent,
        Reaped: ReapedEvent,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        creator: ContractAddress,
        gol_lifeforms: ContractAddress,
        nutrient_token: ContractAddress,
    ) {
        assert!(!creator.is_zero(), "creator_zero");
        assert!(!gol_lifeforms.is_zero(), "lifeforms_zero");
        assert!(!nutrient_token.is_zero(), "nutrient_zero");
        self.erc1155.initializer("");
        self.accesscontrol.initializer();
        self.accesscontrol._grant_role(DEFAULT_ADMIN_ROLE, creator);
        self.gol_lifeforms.write(gol_lifeforms);
        self.nutrient_token_contract.write(nutrient_token);
    }

    /// The bond invariants live in the transfer hook so EVERY path (pet-mint, reap-burn, daycare
    /// hand-off, raw ERC-1155 transfer) enforces them:
    ///   * amounts are always exactly 1 (a bond is a bond);
    ///   * a holder can't receive a second bond on the same creature;
    ///   * the clock rides along on holder→holder moves and is cleared on burn.
    impl ERC1155HooksImpl of ERC1155Component::ERC1155HooksTrait<ContractState> {
        fn before_update(
            ref self: ERC1155Component::ComponentState<ContractState>,
            from: ContractAddress,
            to: ContractAddress,
            token_ids: Span<u256>,
            values: Span<u256>,
        ) {
            let mut state = ERC1155Component::HasComponent::get_contract_mut(ref self);
            let mut i: usize = 0;
            while i < token_ids.len() {
                let id = *token_ids.at(i);
                assert(*values.at(i) == 1, 'bond amount must be 1');
                if !to.is_zero() {
                    assert(state.erc1155.balance_of(to, id) == 0, 'already bonded');
                }
                if !from.is_zero() {
                    if to.is_zero() {
                        state.last_pet.write((id, from), 0); // burn clears the clock
                    } else {
                        // daycare: the receiver inherits the sender's clock — no time bought
                        let clock = state.last_pet.read((id, from));
                        state.last_pet.write((id, to), clock);
                        state.last_pet.write((id, from), 0);
                    }
                }
                i += 1;
            };
        }
    }

    #[abi(embed_v0)]
    impl GolPetBondsImpl of IGolPetBonds<ContractState> {
        fn pet(ref self: ContractState, creature_id: u256) {
            let holder = get_caller_address();
            let lifeforms = IGolLifeFormsV3Dispatcher {
                contract_address: self.gol_lifeforms.read(),
            };
            // Effects before interaction (CEI): mint the bond and stamp the clock BEFORE the
            // external feed call, so a reentrant callee can never observe a stale balance and
            // double-mint the bond or write an inconsistent clock. If the creature is
            // unminted/burned the feed below reverts, rolling these writes back atomically —
            // which is exactly how orphaned bonds age out.
            if self.erc1155.balance_of(holder, creature_id) == 0 {
                // internal update (no acceptance check): plain wallet accounts must be bondable
                self
                    .erc1155
                    .update(
                        Zero::zero(),
                        holder,
                        array![creature_id].span(),
                        array![1_u256].span(),
                    );
            }
            self.last_pet.write((creature_id, holder), get_block_timestamp());
            // Interaction: petting IS feeding — one ceremonial generation, NUT to the petter.
            lifeforms.move_lifeform_forward_n_for(creature_id, 1, holder);
            let age = lifeforms.get_lifeform_data(creature_id).age;
            self.emit(Event::Petted(PettedEvent { creature_id, holder, age }));
        }

        fn reap(ref self: ContractState, creature_id: u256, holder: ContractAddress) {
            // Intentionally PUBLIC: neglect is visible and slightly profitable to clean up — the
            // same lazy-enforcement philosophy as the challenge burns.
            assert(self.erc1155.balance_of(holder, creature_id) == 1, 'no bond');
            let last = self.last_pet.read((creature_id, holder));
            let now = get_block_timestamp();
            assert(now > last && now - last > LAPSE_SECONDS, 'bond not lapsed');
            self
                .erc1155
                .update(holder, Zero::zero(), array![creature_id].span(), array![1_u256].span());
            let reaper = get_caller_address();
            self
                .emit(
                    Event::Reaped(
                        ReapedEvent { creature_id, holder, reaper, reward: REAP_REWARD },
                    ),
                );
            let nutrient_token = IGolNutrientTokenDispatcher {
                contract_address: self.nutrient_token_contract.read(),
            };
            nutrient_token.mint(reaper, REAP_REWARD);
        }

        fn transfer_bond(ref self: ContractState, creature_id: u256, to: ContractAddress) {
            assert(!to.is_zero(), 'to_zero');
            let from = get_caller_address();
            assert(self.erc1155.balance_of(from, creature_id) == 1, 'no bond');
            // internal update: the hook moves the clock; no acceptance check (wallet accounts).
            self
                .erc1155
                .update(from, to, array![creature_id].span(), array![1_u256].span());
        }

        fn last_pet_of(self: @ContractState, creature_id: u256, holder: ContractAddress) -> u64 {
            self.last_pet.read((creature_id, holder))
        }

        fn is_reapable(self: @ContractState, creature_id: u256, holder: ContractAddress) -> bool {
            if self.erc1155.balance_of(holder, creature_id) != 1 {
                return false;
            }
            let last = self.last_pet.read((creature_id, holder));
            let now = get_block_timestamp();
            now > last && now - last > LAPSE_SECONDS
        }

        fn lapse_seconds(self: @ContractState) -> u64 {
            LAPSE_SECONDS
        }

        fn reap_reward(self: @ContractState) -> u256 {
            REAP_REWARD
        }
    }

    #[abi(embed_v0)]
    impl UpgradeableImpl of IUpgradeable<ContractState> {
        fn upgrade(ref self: ContractState, new_class_hash: ClassHash) {
            self.accesscontrol.assert_only_role(DEFAULT_ADMIN_ROLE);
            assert!(!new_class_hash.is_zero(), "class_hash_zero");
            self.upgradeable.upgrade(new_class_hash);
        }
    }
}
