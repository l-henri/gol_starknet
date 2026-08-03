//! v3 Wanderer minter — witness-assisted PATH minting for the orbit-canonical identity model
//! (docs/v3-identity-spec.md §4). Path verification is v2's (walk to the loop, prove the loop,
//! prove entry from outside); the orbit witness needs no phase: the family is the orbit of the
//! START state, so `apply_symmetry(g, drawn_start) == canonical` is one transform.

#[starknet::contract]
pub mod GolWandererMinterV3 {
    use starknet::{ContractAddress, get_caller_address};
    use starknet::storage::{
        StoragePointerReadAccess, StoragePointerWriteAccess, StoragePathEntry, Map,
    };
    use core::num::traits::Zero;
    use gol_starknet::gol_grid_v2::GridState;
    use gol_starknet::gol_grid_v2;
    use gol_starknet::gol_utilities_v2::PartialPathData;
    use gol_starknet::gol_utilities_v2;
    use gol_starknet::interfaces_v2::{PathFormData, LifeState};
    use gol_starknet::interfaces_v3::{
        IGolWandererMinterV3, IGolWanderersV3Dispatcher, IGolWanderersV3DispatcherTrait,
    };

    #[storage]
    struct Storage {
        pub gol_wanderers_nft: ContractAddress,
        pub partial_path_registry: Map<ContractAddress, Map<felt252, PartialPathData>>,
    }

    #[derive(Drop, starknet::Event)]
    struct PartialPathCreatedEvent {
        owner: ContractAddress,
        path_start_id: felt252,
        path_length: usize,
    }
    #[derive(Drop, starknet::Event)]
    struct PartialPathsCombinedEvent {
        owner: ContractAddress,
        path_id_1: felt252,
        path_id_2: felt252,
    }
    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        PartialPathCreated: PartialPathCreatedEvent,
        PartialPathsCombined: PartialPathsCombinedEvent,
    }

    #[constructor]
    fn constructor(ref self: ContractState, gol_wanderers_nft: ContractAddress) {
        assert!(!gol_wanderers_nft.is_zero(), "wanderers_zero");
        self.gol_wanderers_nft.write(gol_wanderers_nft);
    }

    #[generate_trait]
    impl PrivateImpl of PrivateTrait {
        /// One-transform family check: `apply_symmetry(g, start) == canonical`. Returns its rows.
        fn verify_canonical(
            self: @ContractState,
            start_rows: @Array<u64>,
            canonical: @GridState,
            d4: u8,
            dr: u32,
            dc: u32,
        ) -> Array<u64> {
            let cand = gol_grid_v2::apply_symmetry(d4, dr.into(), dc.into(), start_rows);
            let canon_rows = gol_grid_v2::unpack(canonical);
            assert(gol_grid_v2::eq(@cand, @canon_rows), 'bad canonical witness');
            canon_rows
        }
    }

    #[abi(embed_v0)]
    impl GolWandererMinter of IGolWandererMinterV3<ContractState> {
        fn mint_path(
            ref self: ContractState,
            path_start: GridState,
            length_to_loop_entrypoint: usize,
            loop_length: usize,
            canonical: GridState,
            d4: u8,
            dr: u32,
            dc: u32,
            recipient: ContractAddress,
        ) -> bool {
            assert(length_to_loop_entrypoint > 0, 'No path smaller than 1');
            let path_rows = gol_grid_v2::unpack(@path_start);
            let (path_prev, loop_entry) = gol_utilities_v2::step_to(
                @path_rows, length_to_loop_entrypoint,
            );
            let (is_loop, smallest, loop_prev, _) = gol_utilities_v2::is_single_loop(
                @loop_entry, loop_length, 0,
            );
            assert(is_loop, 'Not entering a loop');
            assert(!gol_grid_v2::eq(@loop_prev, @path_prev), 'Incorrect loop entrypoint');
            let canon_rows = self.verify_canonical(@path_rows, @canonical, d4, dr, dc);
            let empty = gol_grid_v2::is_empty(@loop_entry);
            let life_state = if empty {
                LifeState::Dead
            } else if loop_length == 1 {
                LifeState::Frozen
            } else {
                LifeState::Alive
            };
            let path_data = PathFormData {
                life_state,
                sequence_length: length_to_loop_entrypoint,
                start_state: gol_grid_v2::pack(@path_rows), // DRAWN start — display
                target_loop_id: gol_grid_v2::token_hash(@smallest),
                target_period: loop_length,
                minted_at: 0, // stamped by the NFT at mint
                escrow: 0, // stamped by the NFT at mint
            };
            let wanderers = IGolWanderersV3Dispatcher {
                contract_address: self.gol_wanderers_nft.read(),
            };
            wanderers
                .mint(
                    recipient,
                    get_caller_address(),
                    gol_grid_v2::token_id(@canon_rows),
                    path_data,
                    canonical,
                );
            true
        }

        fn mint_partial_path(
            ref self: ContractState,
            path_start: GridState,
            path_length: usize,
            trigger_state: GridState,
        ) {
            let start_rows = gol_grid_v2::unpack(@path_start);
            let trigger_rows = gol_grid_v2::unpack(@trigger_state);
            let partial = gol_utilities_v2::compute_partial_path(
                @start_rows, @trigger_rows, path_length,
            );
            let minter = get_caller_address();
            let key = gol_grid_v2::token_hash(@start_rows);
            self.partial_path_registry.entry(minter).entry(key).write(partial);
            self
                .emit(
                    Event::PartialPathCreated(
                        PartialPathCreatedEvent { owner: minter, path_start_id: key, path_length },
                    ),
                );
        }

        fn combine_partial_path(
            ref self: ContractState, partial_path_id_1: felt252, partial_path_id_2: felt252,
        ) {
            let minter = get_caller_address();
            let p1 = self.partial_path_registry.entry(minter).entry(partial_path_id_1).read();
            let p2 = self.partial_path_registry.entry(minter).entry(partial_path_id_2).read();
            let combined = gol_utilities_v2::combine_partial_path(p1, p2);
            self.partial_path_registry.entry(minter).entry(partial_path_id_1).write(combined);
            self
                .emit(
                    Event::PartialPathsCombined(
                        PartialPathsCombinedEvent {
                            owner: minter, path_id_1: partial_path_id_1, path_id_2: partial_path_id_2,
                        },
                    ),
                );
        }

        fn mint_path_from_partial_paths(
            ref self: ContractState,
            path_start: GridState,
            canonical: GridState,
            d4: u8,
            dr: u32,
            dc: u32,
            recipient: ContractAddress,
        ) {
            // Tiled finalization — v2's two-segment semantics verbatim (a PATH segment keyed by
            // the drawn start + a LOOP segment keyed by the loop entry, spanning the whole loop),
            // plus the one-transform orbit witness on the start.
            let start_rows = gol_grid_v2::unpack(@path_start);
            let start_id = gol_grid_v2::token_hash(@start_rows);
            let caller = get_caller_address();
            let main_path = self.partial_path_registry.entry(caller).entry(start_id).read();
            // Loop entrypoint = the step after the path's exitpoint.
            let main_exit_rows = gol_grid_v2::unpack(@main_path.exitpoint);
            let loop_entry = gol_grid_v2::step(@main_exit_rows);
            let loop_entry_id = gol_grid_v2::token_hash(@loop_entry);
            let loop_partial = self
                .partial_path_registry
                .entry(caller)
                .entry(loop_entry_id)
                .read();
            assert(loop_partial.trigger_id == loop_entry_id, 'Not the right loop');
            // The loop closes: stepping its exitpoint returns to its entrypoint.
            let loop_exit_rows = gol_grid_v2::unpack(@loop_partial.exitpoint);
            let loop_closed = gol_grid_v2::step(@loop_exit_rows);
            assert(
                gol_grid_v2::token_hash(@loop_closed) == loop_partial.entrypoint_id,
                'Loop does not loop',
            );
            // The path's loop segment is not the path itself.
            assert(main_path.exitpoint != loop_partial.exitpoint, 'Loop is the main path');
            let canon_rows = self.verify_canonical(@start_rows, @canonical, d4, dr, dc);
            let empty = gol_grid_v2::is_empty(@loop_entry);
            let loop_length = loop_partial.length;
            let life_state = if empty {
                LifeState::Dead
            } else if loop_length == 1 {
                LifeState::Frozen
            } else {
                LifeState::Alive
            };
            let path_data = PathFormData {
                life_state,
                sequence_length: main_path.length,
                start_state: gol_grid_v2::pack(@start_rows), // DRAWN start — display
                target_loop_id: gol_grid_v2::grid_hash(@loop_partial.smallest),
                target_period: loop_length,
                minted_at: 0,
                escrow: 0,
            };
            let wanderers = IGolWanderersV3Dispatcher {
                contract_address: self.gol_wanderers_nft.read(),
            };
            wanderers
                .mint(
                    recipient, caller, gol_grid_v2::token_id(@canon_rows), path_data, canonical,
                );
        }
    }
}
