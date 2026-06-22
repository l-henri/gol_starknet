//! v2 GolLoopMinter. Mints loop lifeforms. Calls the grid/utility libraries directly (no
//! cross-contract utility dispatch); the only external call is to the lifeforms NFT's `mint`.
//! All mint entrypoints are intentionally PUBLIC — the on-chain verification is the gate, and the
//! partial-path registry is namespaced per caller.

#[starknet::contract]
pub mod GolLoopMinterV2 {
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
        IGolLoopMinterV2, IGolLifeFormsV2Dispatcher, IGolLifeFormsV2DispatcherTrait, LifeFormData,
    };

    #[storage]
    struct Storage {
        pub gol_lifeforms_nft: ContractAddress,
        // minter -> token_hash(entrypoint) -> segment
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
    fn constructor(ref self: ContractState, gol_lifeforms_nft: ContractAddress) {
        assert!(!gol_lifeforms_nft.is_zero(), "lifeforms_zero");
        self.gol_lifeforms_nft.write(gol_lifeforms_nft);
    }

    #[abi(embed_v0)]
    impl GolLoopMinter of IGolLoopMinterV2<ContractState> {
        fn mint_loop(
            ref self: ContractState,
            loop_state: GridState,
            loop_length: usize,
            recipient: ContractAddress,
        ) -> bool {
            assert(loop_length > 0, 'Loop as to be at least 1');
            let rows = gol_grid_v2::unpack(@loop_state);
            // loop_state must be a single loop of loop_length AND its canonical (smallest) state.
            let ok = gol_utilities_v2::is_single_loop_and_entrypoint_is_smallest(@rows, loop_length);
            assert(ok, 'Not a loop');
            let empty = gol_grid_v2::is_empty(@rows);
            let lifeform = LifeFormData {
                is_loop: true,
                is_still: loop_length == 1,
                is_alive: !empty,
                is_dead: empty,
                sequence_length: loop_length,
                current_state: loop_state,
                age: 0,
            };
            let lifeforms = IGolLifeFormsV2Dispatcher {
                contract_address: self.gol_lifeforms_nft.read(),
            };
            lifeforms.mint(recipient, get_caller_address(), gol_grid_v2::token_id(@rows), lifeform);
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

        fn mint_loop_from_partial_paths(
            ref self: ContractState, loop_state: GridState, recipient: ContractAddress,
        ) {
            let rows = gol_grid_v2::unpack(@loop_state);
            let loop_id = gol_grid_v2::token_hash(@rows);
            let main_path = self.partial_path_registry.entry(recipient).entry(loop_id).read();
            // The segment was registered for this loop and is canonical.
            assert(loop_id == main_path.trigger_id, 'Not the right loop');
            assert(main_path.length > 1, 'Not usable for short loops');
            assert(loop_id == gol_grid_v2::grid_hash(@main_path.smallest), 'Not the smallest element');
            // Closure: stepping the exitpoint returns to the loop id.
            let exit_rows = gol_grid_v2::unpack(@main_path.exitpoint);
            let closed = gol_grid_v2::step(@exit_rows);
            assert(gol_grid_v2::token_hash(@closed) == loop_id, 'Loop does not loop');
            let empty = gol_grid_v2::is_empty(@rows);
            let lifeform = LifeFormData {
                is_loop: true,
                is_still: false,
                is_alive: !empty,
                is_dead: empty,
                sequence_length: main_path.length,
                current_state: loop_state,
                age: 0,
            };
            let lifeforms = IGolLifeFormsV2Dispatcher {
                contract_address: self.gol_lifeforms_nft.read(),
            };
            lifeforms.mint(recipient, get_caller_address(), loop_id.into(), lifeform);
        }
    }
}
