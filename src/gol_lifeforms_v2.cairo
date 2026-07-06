//! v2 GolLifeforms ERC-721. Same shape as v1, but `LifeFormData.current_state` is a `GridState`,
//! the per-generation step uses the `gol_grid_v2` bitboard library directly (no utilities
//! component / cross-contract call), and the token_id is the Poseidon hash of the canonical state
//! (computed by the minters and passed in). `token_uri` is stubbed pending Phase 4 (41x41 SVG).

#[starknet::contract]
pub mod GolLifeformsV2 {
    use openzeppelin::introspection::src5::SRC5Component;
    use openzeppelin::token::erc721::{ERC721Component, ERC721HooksEmptyImpl};
    use openzeppelin::interfaces::erc721::{IERC721Metadata, IERC721MetadataCamelOnly};
    use openzeppelin::interfaces::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};
    use openzeppelin::access::accesscontrol::AccessControlComponent;
    use openzeppelin::access::accesscontrol::DEFAULT_ADMIN_ROLE;
    use openzeppelin::upgrades::UpgradeableComponent;
    use openzeppelin::interfaces::upgrades::IUpgradeable;
    use starknet::ClassHash;
    use starknet::{ContractAddress, get_caller_address, get_contract_address};
    use starknet::storage::{Map, StorageMapReadAccess, StorageMapWriteAccess};
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use core::num::traits::Zero;
    use gol_starknet::gol_grid_v2;
    use gol_starknet::gol_grid_v2::GridState;
    use gol_starknet::gol_metadata_v2;
    use gol_starknet::interfaces_v2::{IGolLifeFormsV2, LifeFormData, RenderParams, SPEED_MAX};
    use gol_starknet::interfaces::{
        IGolNutrientTokenDispatcher, IGolNutrientTokenDispatcherTrait,
    };

    component!(path: ERC721Component, storage: erc721, event: ERC721Event);
    component!(path: SRC5Component, storage: src5, event: SRC5Event);
    component!(path: AccessControlComponent, storage: accesscontrol, event: AccessControlEvent);
    component!(path: UpgradeableComponent, storage: upgradeable, event: UpgradeableEvent);

    const MINTER_ROLE: felt252 = selector!("MINTER_ROLE");
    const NUT_DECIMALS: u256 = 1000000000000000000; // 1e18

    // ERC721 core + SRC5 embedded individually (token_uri is overridden below).
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

    // token_uri renders the lifeform's current 41x41 state as an on-chain SVG (see gol_metadata_v2).
    #[abi(embed_v0)]
    impl ERC721MetadataImpl of IERC721Metadata<ContractState> {
        fn name(self: @ContractState) -> ByteArray {
            self.erc721.ERC721_name.read()
        }
        fn symbol(self: @ContractState) -> ByteArray {
            self.erc721.ERC721_symbol.read()
        }
        fn token_uri(self: @ContractState, token_id: u256) -> ByteArray {
            // Re-audit: EIP-721 says token_uri SHOULD revert for non-existent tokens (the custom
            // metadata override otherwise renders valid-looking metadata for phantom ids).
            assert(self.erc721.exists(token_id), 'ERC721: invalid token ID');
            gol_metadata_v2::token_uri(
                token_id, self.lifeform_data.read(token_id), self.resolve_params(token_id),
            )
        }
    }
    #[abi(embed_v0)]
    impl ERC721MetadataCamelImpl of IERC721MetadataCamelOnly<ContractState> {
        fn tokenURI(self: @ContractState, tokenId: u256) -> ByteArray {
            assert(self.erc721.exists(tokenId), 'ERC721: invalid token ID');
            gol_metadata_v2::token_uri(
                tokenId, self.lifeform_data.read(tokenId), self.resolve_params(tokenId),
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
        pub total_supply: u256,
        pub nutrient_token_contract: ContractAddress,
        // Per-token render params (A: derived at mint; C: owner-overridable). speed==0 => unset.
        pub render_params: Map<u256, RenderParams>,
        // Mint-order nonce (symmetry-challenge-spec §3). New maps only — safe for the in-place
        // upgrade. Unwritten slots read 0: pre-upgrade tokens are the grandfathered oldest tier.
        pub next_nonce: u64,
        pub mint_nonce: Map<u256, u64>,
    }

    #[derive(Drop, starknet::Event)]
    struct NewLifeFormEvent {
        owner: ContractAddress,
        token_id: u256,
        lifeform_data: LifeFormData,
    }
    #[derive(Drop, starknet::Event)]
    struct NewMoveEvent {
        token_id: u256,
        age: u32,
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
    #[derive(Drop, starknet::Event)]
    struct ChallengeBurnedEvent {
        a_token_id: u256,
        b_token_id: u256,
        challenger: ContractAddress,
        d4: u8,
        dr: u32,
        dc: u32,
        k: u32,
        bounty: u256,
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
        NutrientContractUpdated: NutrientContractUpdatedEvent,
        RenderParamsUpdated: RenderParamsUpdatedEvent,
        ChallengeBurned: ChallengeBurnedEvent,
    }

    #[constructor]
    fn constructor(
        ref self: ContractState, creator: ContractAddress, nutrient_token: ContractAddress,
    ) {
        // Audit #2: take the nutrient token at construction (non-zero) so the contract is never
        // deployed in a state where mint/move dispatch to the zero address. Still repointable by
        // admin via update_nutrient_contract_address.
        assert!(!creator.is_zero(), "creator_zero");
        assert!(!nutrient_token.is_zero(), "nutrient_zero");
        self.erc721.initializer("Digital bacterias v2", "BACT2", "");
        self.accesscontrol.initializer();
        self.accesscontrol._grant_role(DEFAULT_ADMIN_ROLE, creator);
        self.nutrient_token_contract.write(nutrient_token);
    }

    #[abi(embed_v0)]
    impl GolLifeFormsImpl of IGolLifeFormsV2<ContractState> {
        fn mint(
            ref self: ContractState,
            recipient: ContractAddress,
            minter: ContractAddress,
            token_id: u256,
            lifeform_data: LifeFormData,
        ) {
            // Guarded: only the minter contracts (MINTER_ROLE) may mint.
            self.accesscontrol.assert_only_role(MINTER_ROLE);
            // Re-audit: defense-in-depth — a 0 sequence_length would charge 0 NUT. The v2 minters
            // never pass 0 (they assert length > 0), but enforce it here too.
            assert(lifeform_data.sequence_length > 0, 'sequence_length_zero');
            self.erc721.mint(recipient, token_id);
            // Stamp the mint-order nonce (challenge direction guard). Starts at 1 so that 0
            // remains the grandfathered pre-upgrade tier (unwritten slots read 0).
            let mut nonce = self.next_nonce.read();
            if nonce == 0 {
                nonce = 1;
            }
            self.mint_nonce.write(token_id, nonce);
            self.next_nonce.write(nonce + 1);
            let sequence_length = lifeform_data.sequence_length;
            self.lifeform_data.write(token_id, lifeform_data);
            // A: derive this token's render params from its token_id and store them.
            self.render_params.write(token_id, gol_metadata_v2::derive_params(token_id));
            self.emit(Event::NewLifeForm(NewLifeFormEvent { owner: recipient, token_id, lifeform_data }));
            self.total_supply.write(self.total_supply.read() + 1);
            // Charge the minter `sequence_length` NUT. (Audit #5) The charged NUT accumulates in
            // this contract as an INTENTIONAL sink — a counterweight to the free move-forward
            // faucet. There is deliberately no withdrawal in this proof-of-concept; NUT is
            // faucet-minted, so no user principal is locked here. Revisit (burn vs. treasury sweep)
            // before mainnet.
            let nutrient_token = IERC20Dispatcher {
                contract_address: self.nutrient_token_contract.read(),
            };
            nutrient_token
                .transfer_from(minter, get_contract_address(), sequence_length.into() * NUT_DECIMALS);
        }

        fn get_lifeform_data(self: @ContractState, token_id: u256) -> LifeFormData {
            self.lifeform_data.read(token_id)
        }

        fn move_lifeform_forward(ref self: ContractState, token_id: u256) {
            // Intentionally PUBLIC: advancing a real, minted lifeform is the (free-but-effortful)
            // way to earn NUT. Phantom/unminted ids are not "movement", so they are rejected.
            assert(self.erc721.exists(token_id), 'Lifeform not minted');
            let mut lifeform_data = self.lifeform_data.read(token_id);
            let rows = gol_grid_v2::unpack(@lifeform_data.current_state);
            let next = gol_grid_v2::step(@rows);
            lifeform_data.current_state = gol_grid_v2::pack(@next);
            lifeform_data.age += 1;
            self.lifeform_data.write(token_id, lifeform_data);
            self.emit(Event::NewMove(NewMoveEvent { token_id, age: lifeform_data.age }));
            // Mint 1 NUT to the caller.
            let nutrient_token = IGolNutrientTokenDispatcher {
                contract_address: self.nutrient_token_contract.read(),
            };
            nutrient_token.mint(get_caller_address(), NUT_DECIMALS);
        }

        fn move_lifeform_forward_n(ref self: ContractState, token_id: u256, n: u32) {
            // Batch of move_lifeform_forward: one state read/write + one NUT mint of `n`, stepping
            // `n` generations in a loop. Intentionally public, like the single-step version; cheaper
            // than `n` separate calls (no per-step storage round-trip or per-step mint).
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
            self.emit(Event::NewMove(NewMoveEvent { token_id, age: lifeform_data.age }));
            // Mint `n` NUT to the caller (1 per generation), in a single transfer.
            let reward: u256 = n.into();
            let nutrient_token = IGolNutrientTokenDispatcher {
                contract_address: self.nutrient_token_contract.read(),
            };
            nutrient_token.mint(get_caller_address(), reward * NUT_DECIMALS);
        }

        fn get_grid_size(self: @ContractState) -> u32 {
            gol_grid_v2::N
        }

        fn get_render_params(self: @ContractState, token_id: u256) -> RenderParams {
            self.resolve_params(token_id)
        }

        // C: the token's owner may customise its render params, within the invariants.
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

        fn get_mint_nonce(self: @ContractState, token_id: u256) -> u64 {
            self.mint_nonce.read(token_id)
        }

        fn challenge_burn(
            ref self: ContractState,
            a_token_id: u256,
            b_token_id: u256,
            a_state: GridState,
            d4: u8,
            dr: u32,
            dc: u32,
            k: u32,
        ) {
            // Intentionally PUBLIC: the witness verification IS the gate. Burns loop B iff loop A
            // is strictly older and B's canonical is a symmetry copy of a phase of A's cycle.
            // See docs/symmetry-challenge-spec.md §4.
            assert(a_token_id != b_token_id, 'same token');
            assert(self.erc721.exists(a_token_id), 'A not minted');
            assert(self.erc721.exists(b_token_id), 'B not minted');
            // The stored state mutates as the loop is fed, so the challenger supplies A's
            // canonical preimage and we pin it against A's token id (the hash IS the identity).
            let a_rows = gol_grid_v2::unpack(@a_state);
            assert(gol_grid_v2::token_id(@a_rows) == a_token_id, 'A preimage mismatch');
            // Direction guard: strict mint order. Pre-upgrade tokens (nonce 0) are the tied
            // oldest tier: they can burn any later copy but never each other.
            assert(
                self.mint_nonce.read(a_token_id) < self.mint_nonce.read(b_token_id), 'A not older',
            );
            let a_data = self.lifeform_data.read(a_token_id);
            let b_data = self.lifeform_data.read(b_token_id);
            // Symmetry preserves the period; k selects the phase within A's cycle.
            assert(a_data.sequence_length == b_data.sequence_length, 'periods differ');
            assert(k < a_data.sequence_length.into(), 'k out of range');
            // candidate = apply_symmetry(g, step^k(A_canonical)); must hash to B's id.
            let mut rows = a_rows;
            let mut i: u32 = 0;
            while i < k {
                rows = gol_grid_v2::step(@rows);
                i += 1;
            };
            let cand = gol_grid_v2::apply_symmetry(d4, dr.into(), dc.into(), @rows);
            assert(gol_grid_v2::token_id(@cand) == b_token_id, 'not a copy');
            // Burn B; bounty = B's mint price (sequence_length NUT), freshly minted to the
            // challenger (loops escrow nothing — decided 2026-07-03; supply-neutral vs the sink).
            let bounty: u256 = b_data.sequence_length.into() * NUT_DECIMALS;
            self.erc721.burn(b_token_id);
            self.total_supply.write(self.total_supply.read() - 1);
            let challenger = get_caller_address();
            self
                .emit(
                    Event::ChallengeBurned(
                        ChallengeBurnedEvent {
                            a_token_id, b_token_id, challenger, d4, dr, dc, k, bounty,
                        },
                    ),
                );
            let nutrient_token = IGolNutrientTokenDispatcher {
                contract_address: self.nutrient_token_contract.read(),
            };
            nutrient_token.mint(challenger, bounty);
        }
    }

    #[generate_trait]
    impl PrivateImpl of PrivateTrait {
        /// Stored render params, or (when unset, i.e. speed==0) the deterministic derivation from
        /// the token_id. Used by token_uri and get_render_params.
        fn resolve_params(self: @ContractState, token_id: u256) -> RenderParams {
            let rp = self.render_params.read(token_id);
            if rp.speed == 0 {
                gol_metadata_v2::derive_params(token_id)
            } else {
                rp
            }
        }
    }

    #[abi(embed_v0)]
    impl UpgradeableImpl of IUpgradeable<ContractState> {
        fn upgrade(ref self: ContractState, new_class_hash: ClassHash) {
            self.accesscontrol.assert_only_role(DEFAULT_ADMIN_ROLE);
            assert!(!new_class_hash.is_zero(), "class_hash_zero");
            // (Audit #6) No timelock / version-floor / multi-admin guard — accepted for this
            // proof-of-concept. Add a delay + downgrade protection (and consider a 2-admin
            // bootstrap to avoid sole-admin self-revocation lockout) before mainnet.
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
