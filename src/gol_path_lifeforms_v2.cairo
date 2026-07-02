//! v2 GolPathLifeforms ERC-721 — the NFT contract for PATH creatures (transients that lead into a
//! loop but aren't in it). Separate from the loop NFT (`gol_lifeforms_v2`). A path is a static
//! snapshot: it is NOT feedable (no `move_lifeform_forward`) and earns no NUT. Minting escrows
//! `sequence_length` NUT and stamps a mint timestamp; `challenge_burn` is a permissionless anti-farm
//! that burns a proven forward sub-path and pays its escrow to the challenger. See
//! `docs/path-creatures-spec.md`.

#[starknet::contract]
pub mod GolPathLifeformsV2 {
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
    use gol_starknet::gol_metadata_v2;
    use gol_starknet::interfaces_v2::{
        IGolPathLifeFormsV2, PathFormData, LifeState, LifeFormData, RenderParams, SPEED_MAX,
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

    // token_uri renders the path's START state as an on-chain SVG, reusing the loop metadata via a
    // LifeFormData view (path-specific traits are a follow-up; see spec §9).
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
        pub total_supply: u256,
        pub nutrient_token_contract: ContractAddress,
        pub render_params: Map<u256, RenderParams>,
    }

    #[derive(Drop, starknet::Event)]
    struct NewPathEvent {
        owner: ContractAddress,
        token_id: u256,
        path_data: PathFormData,
    }
    #[derive(Drop, starknet::Event)]
    struct PathBurnedEvent {
        older_id: u256,
        younger_id: u256,
        challenger: ContractAddress,
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
        NewPath: NewPathEvent,
        PathBurned: PathBurnedEvent,
        NutrientContractUpdated: NutrientContractUpdatedEvent,
        RenderParamsUpdated: RenderParamsUpdatedEvent,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState, creator: ContractAddress, nutrient_token: ContractAddress,
    ) {
        assert!(!creator.is_zero(), "creator_zero");
        assert!(!nutrient_token.is_zero(), "nutrient_zero");
        self.erc721.initializer("Digital bacteria paths", "PATH", "");
        self.accesscontrol.initializer();
        self.accesscontrol._grant_role(DEFAULT_ADMIN_ROLE, creator);
        self.nutrient_token_contract.write(nutrient_token);
    }

    #[abi(embed_v0)]
    impl GolPathLifeFormsImpl of IGolPathLifeFormsV2<ContractState> {
        fn mint(
            ref self: ContractState,
            recipient: ContractAddress,
            minter: ContractAddress,
            token_id: u256,
            path_data: PathFormData,
        ) {
            // Guarded: only the path minter (MINTER_ROLE) may mint.
            self.accesscontrol.assert_only_role(MINTER_ROLE);
            assert(path_data.sequence_length > 0, 'sequence_length_zero');
            self.erc721.mint(recipient, token_id);
            // The contract stamps the timestamp + escrow (ignoring any values passed in) so they can't
            // be forged: `minted_at` is the sub-path direction guard; `escrow` funds the bounty.
            let escrow: u256 = path_data.sequence_length.into() * NUT_DECIMALS;
            let stored = PathFormData {
                minted_at: get_block_timestamp(), escrow, ..path_data,
            };
            self.path_data.write(token_id, stored);
            self.render_params.write(token_id, gol_metadata_v2::derive_params(token_id));
            self.emit(Event::NewPath(NewPathEvent { owner: recipient, token_id, path_data: stored }));
            self.total_supply.write(self.total_supply.read() + 1);
            // Escrow `sequence_length` NUT from the minter into this contract (held for the bounty;
            // an unchallenged path's escrow is a permanent sink — no withdrawal). See spec §6.
            let nutrient_token = IERC20Dispatcher {
                contract_address: self.nutrient_token_contract.read(),
            };
            nutrient_token.transfer_from(minter, get_contract_address(), escrow);
        }

        fn get_path_data(self: @ContractState, token_id: u256) -> PathFormData {
            self.path_data.read(token_id)
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
            assert(self.erc721.exists(token_id), 'Path not minted');
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

        fn challenge_burn(ref self: ContractState, older_id: u256, younger_id: u256) {
            // Intentionally PUBLIC: the on-chain stepping proof IS the gate. Anyone may submit it and
            // claim the bounty. Burns `younger_id` iff `older_id` is a proper, earlier-minted forward
            // ancestor of it (older leads to younger). See spec §5.
            assert(older_id != younger_id, 'same token');
            assert(self.erc721.exists(older_id), 'older not minted');
            assert(self.erc721.exists(younger_id), 'younger not minted');
            let older = self.path_data.read(older_id);
            let younger = self.path_data.read(younger_id);
            // (2) direction guard: only an OLDER path may absorb a newer one.
            assert(older.minted_at < younger.minted_at, 'older not older');
            // (3) same terminal — cheap pre-filter (a real sub-path always shares the loop).
            assert(older.target_loop_id == younger.target_loop_id, 'different target loop');
            // (4) older is strictly further from the loop; k = the gap between them.
            assert(older.sequence_length > younger.sequence_length, 'older not longer');
            let k = older.sequence_length - younger.sequence_length;
            // (5) step older's start forward k generations and check it reaches younger's start.
            let mut rows = gol_grid_v2::unpack(@older.start_state);
            let mut i: usize = 0;
            while i < k {
                rows = gol_grid_v2::step(@rows);
                i += 1;
            };
            assert(gol_grid_v2::token_id(@rows) == younger_id, 'not a sub-path');
            // Burn the sub-path and pay its escrow to the challenger.
            let bounty = younger.escrow;
            self.erc721.burn(younger_id);
            self.total_supply.write(self.total_supply.read() - 1);
            let challenger = get_caller_address();
            self
                .emit(
                    Event::PathBurned(
                        PathBurnedEvent { older_id, younger_id, challenger, bounty },
                    ),
                );
            let nutrient_token = IERC20Dispatcher {
                contract_address: self.nutrient_token_contract.read(),
            };
            nutrient_token.transfer(challenger, bounty);
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

        /// A LifeFormData view of a path, for reusing the loop metadata renderer. The path renders as
        /// its START state; life-state maps to the still/alive/dead flags.
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

    // Guarded: only DEFAULT_ADMIN_ROLE may repoint the nutrient token.
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
