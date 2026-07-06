//! v3 Wanderers ERC-721 — "Digital Wanderers" / WNDR: PATH creatures (transients that lead into a
//! loop) under the orbit-canonical identity model (docs/v3-identity-spec.md). Identity =
//! Poseidon(orbit canonical of the start); `start_state` stays the DRAWN start for display.
//! Static snapshots — never feedable, earn no NUT. Two permissionless burns:
//!   * `challenge_burn` — the TIME direction (forward sub-paths / stepped copies), carried from v2
//!     with the `(g, k)` witness and the mint-nonce direction guard;
//!   * `prove_malformed` — the identity direction (a non-minimal claimed canonical).
//! Both pay the token's escrowed mint charge to the caller.

#[starknet::contract]
pub mod GolWanderersV3 {
    use openzeppelin::introspection::src5::SRC5Component;
    use openzeppelin::token::erc721::{ERC721Component, ERC721HooksEmptyImpl};
    use openzeppelin::interfaces::erc721::{IERC721Metadata, IERC721MetadataCamelOnly};
    use openzeppelin::interfaces::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};
    use openzeppelin::access::accesscontrol::AccessControlComponent;
    use openzeppelin::access::accesscontrol::DEFAULT_ADMIN_ROLE;
    use openzeppelin::upgrades::UpgradeableComponent;
    use openzeppelin::interfaces::upgrades::IUpgradeable;
    use starknet::ClassHash;
    use starknet::{ContractAddress, get_caller_address, get_contract_address, get_block_timestamp};
    use starknet::storage::{Map, StorageMapReadAccess, StorageMapWriteAccess};
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use core::num::traits::Zero;
    use gol_starknet::gol_grid_v2;
    use gol_starknet::gol_grid_v2::GridState;
    use gol_starknet::gol_metadata_v2;
    use gol_starknet::interfaces_v3::IGolWanderersV3;
    use gol_starknet::interfaces_v2::{
        PathFormData, LifeState, LifeFormData, RenderParams, SPEED_MAX,
    };

    component!(path: ERC721Component, storage: erc721, event: ERC721Event);
    component!(path: SRC5Component, storage: src5, event: SRC5Event);
    component!(path: AccessControlComponent, storage: accesscontrol, event: AccessControlEvent);
    component!(path: UpgradeableComponent, storage: upgradeable, event: UpgradeableEvent);

    const MINTER_ROLE: felt252 = selector!("MINTER_ROLE");
    const NUT_DECIMALS: u256 = 1000000000000000000; // 1e18

    #[abi(embed_v0)]
    impl ERC721Impl = ERC721Component::ERC721Impl<ContractState>;
    #[abi(embed_v0)]
    impl ERC721CamelOnlyImpl = ERC721Component::ERC721CamelOnlyImpl<ContractState>;
    #[abi(embed_v0)]
    impl SRC5Impl = SRC5Component::SRC5Impl<ContractState>;
    impl ERC721InternalImpl = ERC721Component::InternalImpl<ContractState>;
    #[abi(embed_v0)]
    impl AccessControlImpl = AccessControlComponent::AccessControlImpl<ContractState>;
    impl AccessControlInternalImpl = AccessControlComponent::InternalImpl<ContractState>;
    impl UpgradeableInternalImpl = UpgradeableComponent::InternalImpl<ContractState>;

    // token_uri renders the DRAWN start state via the shared metadata renderer.
    #[abi(embed_v0)]
    impl ERC721MetadataImpl of IERC721Metadata<ContractState> {
        fn name(self: @ContractState) -> ByteArray {
            self.erc721.ERC721_name.read()
        }
        fn symbol(self: @ContractState) -> ByteArray {
            self.erc721.ERC721_symbol.read()
        }
        fn token_uri(self: @ContractState, token_id: u256) -> ByteArray {
            assert(self.erc721.exists(token_id), 'ERC721: invalid token ID');
            gol_metadata_v2::token_uri(
                token_id, self.lifeform_view(token_id), self.resolve_params(token_id),
            )
        }
    }
    #[abi(embed_v0)]
    impl ERC721MetadataCamelImpl of IERC721MetadataCamelOnly<ContractState> {
        fn tokenURI(self: @ContractState, tokenId: u256) -> ByteArray {
            assert(self.erc721.exists(tokenId), 'ERC721: invalid token ID');
            gol_metadata_v2::token_uri(
                tokenId, self.lifeform_view(tokenId), self.resolve_params(tokenId),
            )
        }
    }

    #[storage]
    struct Storage {
        #[substorage(v0)]
        erc721: ERC721Component::Storage,
        #[substorage(v0)]
        src5: SRC5Component::Storage,
        #[substorage(v0)]
        accesscontrol: AccessControlComponent::Storage,
        #[substorage(v0)]
        upgradeable: UpgradeableComponent::Storage,
        pub path_data: Map<u256, PathFormData>,
        /// Identity preimage: token_id == Poseidon(canonical_state). Fraud-proof base.
        pub canonical_state: Map<u256, GridState>,
        pub total_supply: u256,
        pub nutrient_token_contract: ContractAddress,
        pub render_params: Map<u256, RenderParams>,
        pub next_nonce: u64,
        pub mint_nonce: Map<u256, u64>,
    }

    #[derive(Drop, starknet::Event)]
    struct NewWandererEvent {
        owner: ContractAddress,
        token_id: u256,
        path_data: PathFormData,
    }
    #[derive(Drop, starknet::Event)]
    struct WandererBurnedEvent {
        older_id: u256,
        younger_id: u256,
        challenger: ContractAddress,
        bounty: u256,
        d4: u8,
        dr: u32,
        dc: u32,
    }
    #[derive(Drop, starknet::Event)]
    struct IdFraudProvenEvent {
        token_id: u256,
        prover: ContractAddress,
        d4: u8,
        dr: u32,
        dc: u32,
        bounty: u256,
    }
    #[derive(Drop, starknet::Event)]
    struct NutrientContractUpdatedEvent {
        nutrient_contract_address: ContractAddress,
    }
    #[derive(Drop, starknet::Event)]
    struct RenderParamsUpdatedEvent {
        token_id: u256,
        bg: u32,
        cell: u32,
        speed: u16,
    }
    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        ERC721Event: ERC721Component::Event,
        #[flat]
        SRC5Event: SRC5Component::Event,
        #[flat]
        AccessControlEvent: AccessControlComponent::Event,
        #[flat]
        UpgradeableEvent: UpgradeableComponent::Event,
        NewWanderer: NewWandererEvent,
        WandererBurned: WandererBurnedEvent,
        IdFraudProven: IdFraudProvenEvent,
        NutrientContractUpdated: NutrientContractUpdatedEvent,
        RenderParamsUpdated: RenderParamsUpdatedEvent,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState, creator: ContractAddress, nutrient_token: ContractAddress,
    ) {
        assert!(!creator.is_zero(), "creator_zero");
        assert!(!nutrient_token.is_zero(), "nutrient_zero");
        self.erc721.initializer("Digital Wanderers", "WNDR", "");
        self.accesscontrol.initializer();
        self.accesscontrol._grant_role(DEFAULT_ADMIN_ROLE, creator);
        self.nutrient_token_contract.write(nutrient_token);
    }

    #[abi(embed_v0)]
    impl GolWanderersImpl of IGolWanderersV3<ContractState> {
        fn mint(
            ref self: ContractState,
            recipient: ContractAddress,
            minter: ContractAddress,
            token_id: u256,
            path_data: PathFormData,
            canonical: GridState,
        ) {
            self.accesscontrol.assert_only_role(MINTER_ROLE);
            assert(path_data.sequence_length > 0, 'sequence_length_zero');
            assert(
                gol_grid_v2::grid_hash(@canonical).into() == token_id, 'id != hash(canonical)',
            );
            // Copy prevention: same family -> same canonical -> same id -> this reverts.
            self.erc721.mint(recipient, token_id);
            let mut nonce = self.next_nonce.read();
            if nonce == 0 {
                nonce = 1;
            }
            self.mint_nonce.write(token_id, nonce);
            self.next_nonce.write(nonce + 1);
            let escrow: u256 = path_data.sequence_length.into() * NUT_DECIMALS;
            let stored = PathFormData { minted_at: get_block_timestamp(), escrow, ..path_data };
            self.path_data.write(token_id, stored);
            self.canonical_state.write(token_id, canonical);
            self.render_params.write(token_id, gol_metadata_v2::derive_params(token_id));
            self
                .emit(
                    Event::NewWanderer(
                        NewWandererEvent { owner: recipient, token_id, path_data: stored },
                    ),
                );
            self.total_supply.write(self.total_supply.read() + 1);
            let nutrient_token = IERC20Dispatcher {
                contract_address: self.nutrient_token_contract.read(),
            };
            nutrient_token.transfer_from(minter, get_contract_address(), escrow);
        }

        fn get_path_data(self: @ContractState, token_id: u256) -> PathFormData {
            self.path_data.read(token_id)
        }

        fn get_canonical_state(self: @ContractState, token_id: u256) -> GridState {
            self.canonical_state.read(token_id)
        }

        fn get_mint_nonce(self: @ContractState, token_id: u256) -> u64 {
            self.mint_nonce.read(token_id)
        }

        fn get_grid_size(self: @ContractState) -> u32 {
            gol_grid_v2::N
        }

        fn get_render_params(self: @ContractState, token_id: u256) -> RenderParams {
            self.resolve_params(token_id)
        }

        fn set_render_params(
            ref self: ContractState, token_id: u256, bg: u32, cell: u32, speed: u16,
        ) {
            assert(self.erc721.exists(token_id), 'Wanderer not minted');
            assert(self.erc721._owner_of(token_id) == get_caller_address(), 'Not token owner');
            assert(bg != cell, 'bg and cell must differ');
            assert(speed > 0 && speed < SPEED_MAX, 'speed out of range');
            self.render_params.write(token_id, RenderParams { bg, cell, speed });
            self
                .emit(
                    Event::RenderParamsUpdated(
                        RenderParamsUpdatedEvent { token_id, bg, cell, speed },
                    ),
                );
        }

        fn challenge_burn(
            ref self: ContractState, older_id: u256, younger_id: u256, d4: u8, dr: u32, dc: u32,
        ) {
            // The TIME-direction anti-farm (v2 rule carried over): burn `younger` iff `older` was
            // minted strictly earlier and step^k(g(older.drawn_start)) == younger.drawn_start,
            // k = the length gap. In v3, ids are orbit hashes, so the relation is checked between
            // the stored DRAWN starts (witness freedom over g covers every family member).
            assert(older_id != younger_id, 'same token');
            assert(self.erc721.exists(older_id), 'older not minted');
            assert(self.erc721.exists(younger_id), 'younger not minted');
            let older = self.path_data.read(older_id);
            let younger = self.path_data.read(younger_id);
            assert(
                self.mint_nonce.read(older_id) < self.mint_nonce.read(younger_id), 'older not older',
            );
            let identity = d4 == 0 && dr == 0 && dc == 0;
            if identity {
                assert(older.target_loop_id == younger.target_loop_id, 'different target loop');
                assert(older.sequence_length > younger.sequence_length, 'older not longer');
            } else {
                assert(older.sequence_length >= younger.sequence_length, 'older not longer');
            }
            let k = older.sequence_length - younger.sequence_length;
            let mut rows = gol_grid_v2::unpack(@older.start_state);
            let mut i: usize = 0;
            while i < k {
                rows = gol_grid_v2::step(@rows);
                i += 1;
            };
            let cand = gol_grid_v2::apply_symmetry(d4, dr.into(), dc.into(), @rows);
            assert(
                gol_grid_v2::token_hash(@cand) == gol_grid_v2::grid_hash(@younger.start_state),
                'not a sub-path',
            );
            let bounty = younger.escrow;
            self.erc721.burn(younger_id);
            self.total_supply.write(self.total_supply.read() - 1);
            let challenger = get_caller_address();
            self
                .emit(
                    Event::WandererBurned(
                        WandererBurnedEvent {
                            older_id, younger_id, challenger, bounty, d4, dr, dc,
                        },
                    ),
                );
            let nutrient_token = IERC20Dispatcher {
                contract_address: self.nutrient_token_contract.read(),
            };
            nutrient_token.transfer(challenger, bounty);
        }

        fn prove_malformed(ref self: ContractState, token_id: u256, d4: u8, dr: u32, dc: u32) {
            // Identity-direction fraud-proof: paths quotient only the orbit (no phases), so the
            // prover exhibits g with g(canonical) < canonical. Permanent and public.
            assert(self.erc721.exists(token_id), 'Wanderer not minted');
            let canonical = self.canonical_state.read(token_id);
            let canon_rows = gol_grid_v2::unpack(@canonical);
            let cand = gol_grid_v2::apply_symmetry(d4, dr.into(), dc.into(), @canon_rows);
            assert(gol_grid_v2::lt(@cand, @canon_rows), 'id is minimal');
            let data = self.path_data.read(token_id);
            let bounty = data.escrow;
            self.erc721.burn(token_id);
            self.total_supply.write(self.total_supply.read() - 1);
            let prover = get_caller_address();
            self
                .emit(
                    Event::IdFraudProven(
                        IdFraudProvenEvent { token_id, prover, d4, dr, dc, bounty },
                    ),
                );
            let nutrient_token = IERC20Dispatcher {
                contract_address: self.nutrient_token_contract.read(),
            };
            nutrient_token.transfer(prover, bounty);
        }
    }

    #[generate_trait]
    impl PrivateImpl of PrivateTrait {
        fn resolve_params(self: @ContractState, token_id: u256) -> RenderParams {
            let rp = self.render_params.read(token_id);
            if rp.speed == 0 {
                gol_metadata_v2::derive_params(token_id)
            } else {
                rp
            }
        }

        /// A LifeFormData view for the shared metadata renderer: renders the DRAWN start.
        fn lifeform_view(self: @ContractState, token_id: u256) -> LifeFormData {
            let p = self.path_data.read(token_id);
            LifeFormData {
                is_loop: false,
                is_still: p.life_state == LifeState::Frozen,
                is_alive: p.life_state == LifeState::Alive,
                is_dead: p.life_state == LifeState::Dead,
                sequence_length: p.sequence_length,
                current_state: p.start_state,
                age: 0,
            }
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

    #[external(v0)]
    fn update_nutrient_contract_address(
        ref self: ContractState, nutrient_contract_address: ContractAddress,
    ) {
        self.accesscontrol.assert_only_role(DEFAULT_ADMIN_ROLE);
        assert!(!nutrient_contract_address.is_zero(), "nutrient_zero");
        self.nutrient_token_contract.write(nutrient_contract_address);
        self
            .emit(
                Event::NutrientContractUpdated(
                    NutrientContractUpdatedEvent { nutrient_contract_address },
                ),
            );
    }
}
