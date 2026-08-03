//! v2 GolPathMinter. Mints path lifeforms (a state that *leads into* a loop but isn't in it).
//! Same library-call architecture as the loop minter. All mint entrypoints are intentionally
//! PUBLIC; the partial-path registry is namespaced per caller.

#[starknet::contract]
pub mod GolPathMinterV2 {
    use starknet::{ContractAddress, get_caller_address};
    use starknet::storage::{
        StoragePointerReadAccess, StoragePointerWriteAccess, StoragePathEntry, Map,
    };
    use core::num::traits::Zero;
    use gol_starknet::gol_grid_v2::{GridState};
    use gol_starknet::gol_grid_v2;
    use gol_starknet::gol_utilities_v2::PartialPathData;
    use gol_starknet::gol_utilities_v2;
    use gol_starknet::interfaces_v2::{
        IGolPathMinterV2, IGolPathLifeFormsV2Dispatcher, IGolPathLifeFormsV2DispatcherTrait,
        PathFormData, LifeState,
    };

    #[storage]
    struct Storage {
        pub gol_path_lifeforms_nft: ContractAddress,
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
    fn constructor(ref self: ContractState, gol_path_lifeforms_nft: ContractAddress) {
        assert!(!gol_path_lifeforms_nft.is_zero(), "lifeforms_zero");
        self.gol_path_lifeforms_nft.write(gol_path_lifeforms_nft);
    }

    #[abi(embed_v0)]
    impl GolPathMinter of IGolPathMinterV2<ContractState> {
        fn mint_path(
            ref self: ContractState,
            path_start: GridState,
            length_to_loop_entrypoint: usize,
            loop_length: usize,
            recipient: ContractAddress,
        ) -> bool {
            assert(length_to_loop_entrypoint > 0, 'No path smaller than 1');
            let path_rows = gol_grid_v2::unpack(@path_start);
            // Step to the loop entrypoint, keeping the path's predecessor of it.
            let (path_prev, loop_entry) = gol_utilities_v2::step_to(
                @path_rows, length_to_loop_entrypoint,
            );
            // loop_entry must begin a single loop of loop_length; get the loop's own predecessor.
            // (is_single_loop panics if loop_entry isn't a clean loop of that length.)
            let (is_loop, smallest, loop_prev, _) = gol_utilities_v2::is_single_loop(
                @loop_entry, loop_length, 0,
            );
            assert(is_loop, 'Not entering a loop');
            // The path must ENTER the loop from outside: its predecessor of loop_entry differs from
            // the loop's internal predecessor (otherwise path_start is already in the loop).
            assert(!gol_grid_v2::eq(@loop_prev, @path_prev), 'Incorrect loop entrypoint');
            let empty = gol_grid_v2::is_empty(@loop_entry);
            // Three-way life state: dead (empty) / frozen (still life, period 1) / alive (period>1).
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
                start_state: gol_grid_v2::pack(@path_rows), // audit #1: store canonical, not raw
                target_loop_id: gol_grid_v2::token_hash(@smallest),
                target_period: loop_length,
                minted_at: 0, // stamped by the NFT at mint
                escrow: 0, // stamped by the NFT at mint
            };
            let lifeforms = IGolPathLifeFormsV2Dispatcher {
                contract_address: self.gol_path_lifeforms_nft.read(),
            };
            lifeforms
                .mint(recipient, get_caller_address(), gol_grid_v2::token_id(@path_rows), path_data);
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
            ref self: ContractState, path_start: GridState, recipient: ContractAddress,
        ) {
            let path_rows = gol_grid_v2::unpack(@path_start);
            let path_id = gol_grid_v2::token_hash(@path_rows);
            // Audit #4: read segments under the CALLER (where they were written), not recipient.
            let caller = get_caller_address();
            let main_path = self.partial_path_registry.entry(caller).entry(path_id).read();
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
                start_state: gol_grid_v2::pack(@path_rows), // audit #1: store canonical, not raw
                target_loop_id: gol_grid_v2::grid_hash(@loop_partial.smallest),
                target_period: loop_length,
                minted_at: 0, // stamped by the NFT at mint
                escrow: 0, // stamped by the NFT at mint
            };
            let lifeforms = IGolPathLifeFormsV2Dispatcher {
                contract_address: self.gol_path_lifeforms_nft.read(),
            };
            lifeforms.mint(recipient, caller, path_id.into(), path_data);
        }
    }
}
