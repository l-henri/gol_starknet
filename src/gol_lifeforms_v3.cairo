//! v3 GolLifeforms ERC-721 — "Digital Bacteria" / BACT, the ORBIT-CANONICAL identity model
//! (docs/v3-identity-spec.md). `token_id = Poseidon(orbit canonical)`, so symmetry copies revert
//! at mint; the stored `current_state` is the DRAWN state (display) while `canonical_state` is the
//! identity preimage. Minimality is optimistic and permanently fraud-provable (`prove_malformed`,
//! bounty = the token's mint escrow). Feed rewards carry the beneficiary (`_n_for`) and the feed
//! event records the feeder (v3 ride-alongs). No symmetry challenge-burn here — copies can't mint.

#[starknet::contract]
pub mod GolLifeformsV3 {
    use openzeppelin::introspection::src5::SRC5Component;
    use openzeppelin::token::erc721::{ERC721Component, ERC721HooksEmptyImpl};
    use openzeppelin::interfaces::erc721::{IERC721Metadata, IERC721MetadataCamelOnly};
    use openzeppelin::interfaces::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};
    use openzeppelin::access::accesscontrol::AccessControlComponent;
    use openzeppelin::access::accesscontrol::DEFAULT_ADMIN_ROLE;
    use openzeppelin::upgrades::UpgradeableComponent;
    use openzeppelin::interfaces::upgrades::IUpgradeable;
    use starknet::ClassHash;
    use starknet::{
        ContractAddress, get_caller_address, get_contract_address, get_block_timestamp,
    };
    use starknet::storage::{Map, StorageMapReadAccess, StorageMapWriteAccess};
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use core::num::traits::Zero;
    use gol_starknet::gol_grid_v2;
    use gol_starknet::gol_grid_v2::GridState;
    use gol_starknet::gol_metadata_v2;
    use gol_starknet::interfaces_v3::IGolLifeFormsV3;
    use gol_starknet::interfaces_v2::{LifeFormData, RenderParams, SPEED_MAX};
    use gol_starknet::interfaces::{
        IGolNutrientTokenDispatcher, IGolNutrientTokenDispatcherTrait,
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

    // token_uri renders the DRAWN (evolving) state — the artist's orientation, not the canonical.
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
            gol_metadata_v2::token_uri_with_discoverer(
                token_id,
                self.lifeform_data.read(token_id),
                self.resolve_params(token_id),
                self.discoverer.read(token_id),
            )
        }
    }
    #[abi(embed_v0)]
    impl ERC721MetadataCamelImpl of IERC721MetadataCamelOnly<ContractState> {
        fn tokenURI(self: @ContractState, tokenId: u256) -> ByteArray {
            assert(self.erc721.exists(tokenId), 'ERC721: invalid token ID');
            gol_metadata_v2::token_uri_with_discoverer(
                tokenId,
                self.lifeform_data.read(tokenId),
                self.resolve_params(tokenId),
                self.discoverer.read(tokenId),
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
        pub lifeform_data: Map<u256, LifeFormData>,
        /// Identity preimage: token_id == Poseidon(canonical_state). Fraud-proof base.
        pub canonical_state: Map<u256, GridState>,
        /// Per-token mint escrow (= sequence_length NUT) — the prove_malformed bounty.
        pub escrow: Map<u256, u256>,
        pub total_supply: u256,
        pub nutrient_token_contract: ContractAddress,
        pub render_params: Map<u256, RenderParams>,
        pub next_nonce: u64,
        pub mint_nonce: Map<u256, u64>,
        /// Block timestamp at mint. 0 = grandfathered (minted before this field existed), same
        /// convention as mint_nonce 0. Own map so the shared LifeFormData layout stays untouched.
        pub minted_at: Map<u256, u64>,
        /// The human who discovered this creature (= mint's `minter`: the escrow payer, i.e. the
        /// caller of the minter contract — not `recipient`, which may be a gift target).
        /// Zero = grandfathered. Permanent artist attribution.
        pub discoverer: Map<u256, ContractAddress>,
    }

    #[derive(Drop, starknet::Event)]
    struct NewLifeFormEvent {
        owner: ContractAddress,
        token_id: u256,
        lifeform_data: LifeFormData,
        // Appended (indexers parse leading fields positionally): the discoverer/escrow payer.
        discoverer: ContractAddress,
    }
    #[derive(Drop, starknet::Event)]
    struct NewMoveEvent {
        token_id: u256,
        age: u32,
        // v3 ride-along: exact feed attribution (the NUT beneficiary).
        feeder: ContractAddress,
    }
    #[derive(Drop, starknet::Event)]
    struct IdFraudProvenEvent {
        token_id: u256,
        prover: ContractAddress,
        d4: u8,
        dr: u32,
        dc: u32,
        k: u32,
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
        NewLifeForm: NewLifeFormEvent,
        NewMove: NewMoveEvent,
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
        self.erc721.initializer("Digital Bacteria", "BACT", "");
        self.accesscontrol.initializer();
        self.accesscontrol._grant_role(DEFAULT_ADMIN_ROLE, creator);
        self.nutrient_token_contract.write(nutrient_token);
        // Genesis: the EMPTY GRID, minted to the deployer at deploy. It's the one loop the
        // website can never mint (you can't draw nothing), yet it's the fixed point every dead
        // creature settles into — the vacuum belongs in the collection. Escrow is 0: no NUT can
        // exist at deploy, and the empty grid is the global lex-minimum, so `prove_malformed`
        // can never fire on it (the bounty would be unclaimable anyway).
        let empty_rowvals: Array<(usize, u64)> = array![];
        let empty_rows = gol_grid_v2::grid_with(@empty_rowvals);
        let empty = gol_grid_v2::pack(@empty_rows);
        let token_id = gol_grid_v2::token_id(@empty_rows);
        self.erc721.mint(creator, token_id);
        self.mint_nonce.write(token_id, 1);
        self.next_nonce.write(2);
        self.minted_at.write(token_id, get_block_timestamp());
        self.discoverer.write(token_id, creator);
        let lifeform_data = LifeFormData {
            is_loop: true,
            is_still: true,
            is_alive: false,
            is_dead: true,
            sequence_length: 1,
            current_state: empty, // drawn == canonical: the empty grid is its own orbit minimum
            age: 0,
        };
        self.lifeform_data.write(token_id, lifeform_data);
        self.canonical_state.write(token_id, empty);
        self.render_params.write(token_id, gol_metadata_v2::derive_params(token_id));
        self.total_supply.write(1);
        self
            .emit(
                Event::NewLifeForm(
                    NewLifeFormEvent {
                        owner: creator, token_id, lifeform_data, discoverer: creator,
                    },
                ),
            );
    }

    #[abi(embed_v0)]
    impl GolLifeFormsImpl of IGolLifeFormsV3<ContractState> {
        fn mint(
            ref self: ContractState,
            recipient: ContractAddress,
            minter: ContractAddress,
            token_id: u256,
            lifeform_data: LifeFormData,
            canonical: GridState,
        ) {
            self.accesscontrol.assert_only_role(MINTER_ROLE);
            assert(lifeform_data.sequence_length > 0, 'sequence_length_zero');
            // Identity integrity: the id IS the hash of the canonical preimage. (Family
            // membership of `canonical` was verified by the minter's witness check.)
            assert(
                gol_grid_v2::grid_hash(@canonical).into() == token_id, 'id != hash(canonical)',
            );
            // Copy prevention: a symmetry copy has the same canonical, hence the same id — the
            // ERC-721 mint below reverts on the collision.
            self.erc721.mint(recipient, token_id);
            let mut nonce = self.next_nonce.read();
            if nonce == 0 {
                nonce = 1;
            }
            self.mint_nonce.write(token_id, nonce);
            self.next_nonce.write(nonce + 1);
            self.minted_at.write(token_id, get_block_timestamp());
            self.discoverer.write(token_id, minter);
            let sequence_length = lifeform_data.sequence_length;
            self.lifeform_data.write(token_id, lifeform_data);
            self.canonical_state.write(token_id, canonical);
            self.render_params.write(token_id, gol_metadata_v2::derive_params(token_id));
            self
                .emit(
                    Event::NewLifeForm(
                        NewLifeFormEvent {
                            owner: recipient, token_id, lifeform_data, discoverer: minter,
                        },
                    ),
                );
            self.total_supply.write(self.total_supply.read() + 1);
            // The mint charge is now a per-token ESCROW (the prove_malformed bounty). Unchallenged
            // escrow never leaves the contract — the intentional sink, per-token accounted.
            let amount: u256 = sequence_length.into() * NUT_DECIMALS;
            self.escrow.write(token_id, amount);
            let nutrient_token = IERC20Dispatcher {
                contract_address: self.nutrient_token_contract.read(),
            };
            nutrient_token.transfer_from(minter, get_contract_address(), amount);
        }

        fn get_lifeform_data(self: @ContractState, token_id: u256) -> LifeFormData {
            self.lifeform_data.read(token_id)
        }

        fn get_canonical_state(self: @ContractState, token_id: u256) -> GridState {
            self.canonical_state.read(token_id)
        }

        fn get_escrow(self: @ContractState, token_id: u256) -> u256 {
            self.escrow.read(token_id)
        }

        fn get_mint_nonce(self: @ContractState, token_id: u256) -> u64 {
            self.mint_nonce.read(token_id)
        }

        fn get_minted_at(self: @ContractState, token_id: u256) -> u64 {
            self.minted_at.read(token_id)
        }

        fn get_discoverer(self: @ContractState, token_id: u256) -> ContractAddress {
            self.discoverer.read(token_id)
        }

        fn move_lifeform_forward(ref self: ContractState, token_id: u256) {
            self.advance(token_id, 1, get_caller_address());
        }

        fn move_lifeform_forward_n(ref self: ContractState, token_id: u256, n: u32) {
            self.advance(token_id, n, get_caller_address());
        }

        fn move_lifeform_forward_n_for(
            ref self: ContractState, token_id: u256, n: u32, beneficiary: ContractAddress,
        ) {
            // Ride-along for caretaker contracts (pets): the feed is credited to the human, not
            // the calling contract. Feeding is a gift in any direction, so this is unrestricted.
            assert(!beneficiary.is_zero(), 'beneficiary_zero');
            self.advance(token_id, n, beneficiary);
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
            assert(self.erc721.exists(token_id), 'Lifeform not minted');
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

        fn prove_malformed(
            ref self: ContractState, token_id: u256, d4: u8, dr: u32, dc: u32, k: u32,
        ) {
            // Intentionally PUBLIC and PERMANENT: a non-minimal id is wrong forever. The prover
            // exhibits a strictly smaller family member derived from the stored canonical.
            assert(self.erc721.exists(token_id), 'Lifeform not minted');
            let data = self.lifeform_data.read(token_id);
            assert(k < data.sequence_length, 'k out of range');
            let canonical = self.canonical_state.read(token_id);
            let canon_rows = gol_grid_v2::unpack(@canonical);
            let mut rows = gol_grid_v2::unpack(@canonical);
            let mut i: u32 = 0;
            while i < k {
                rows = gol_grid_v2::step(@rows);
                i += 1;
            };
            let cand = gol_grid_v2::apply_symmetry(d4, dr.into(), dc.into(), @rows);
            // Family membership of `cand` holds by construction (derived from the canonical).
            assert(gol_grid_v2::lt(@cand, @canon_rows), 'id is minimal');
            let bounty = self.escrow.read(token_id);
            self.escrow.write(token_id, 0);
            self.erc721.burn(token_id);
            self.total_supply.write(self.total_supply.read() - 1);
            let prover = get_caller_address();
            self
                .emit(
                    Event::IdFraudProven(
                        IdFraudProvenEvent { token_id, prover, d4, dr, dc, k, bounty },
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

        /// Shared feed body: step `n` generations, mint `n` NUT to `beneficiary`, record the
        /// feeder in the event.
        fn advance(
            ref self: ContractState, token_id: u256, n: u32, beneficiary: ContractAddress,
        ) {
            assert(self.erc721.exists(token_id), 'Lifeform not minted');
            assert(n > 0, 'n must be positive');
            let mut lifeform_data = self.lifeform_data.read(token_id);
            let mut rows = gol_grid_v2::unpack(@lifeform_data.current_state);
            let mut i: u32 = 0;
            while i < n {
                rows = gol_grid_v2::step(@rows);
                i += 1;
            };
            lifeform_data.current_state = gol_grid_v2::pack(@rows);
            lifeform_data.age += n;
            self.lifeform_data.write(token_id, lifeform_data);
            self
                .emit(
                    Event::NewMove(
                        NewMoveEvent { token_id, age: lifeform_data.age, feeder: beneficiary },
                    ),
                );
            let reward: u256 = n.into();
            let nutrient_token = IGolNutrientTokenDispatcher {
                contract_address: self.nutrient_token_contract.read(),
            };
            nutrient_token.mint(beneficiary, reward * NUT_DECIMALS);
        }
    }

    #[abi(embed_v0)]
    impl UpgradeableImpl of IUpgradeable<ContractState> {
        fn upgrade(ref self: ContractState, new_class_hash: ClassHash) {
            self.accesscontrol.assert_only_role(DEFAULT_ADMIN_ROLE);
            assert!(!new_class_hash.is_zero(), "class_hash_zero");
            // No timelock yet (v3-identity-spec §3); immutability is the stated endgame.
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
