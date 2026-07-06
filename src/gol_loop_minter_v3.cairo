//! v3 GolLoopMinter — witness-assisted loop minting for the orbit-canonical identity model
//! (docs/v3-identity-spec.md §4). The drawn state is verified as a clean loop exactly as v2 did
//! (walking the cycle), but the "must be time-smallest" gate is dropped: canonicality now lives in
//! the id. The claimed orbit canonical is verified as a family member with ONE transform, anchored
//! on the walk's time-lex-min: `apply_symmetry(g, step^k(time_smallest)) == canonical`.
//! Minimality of the canonical is the NFT contract's optimistic claim (prove_malformed defends it).

#[starknet::contract]
pub mod GolLoopMinterV3 {
    use starknet::{ContractAddress, get_caller_address};
    use starknet::storage::{
        StoragePointerReadAccess, StoragePointerWriteAccess, StoragePathEntry, Map,
    };
    use core::num::traits::Zero;
    use gol_starknet::gol_grid_v2::GridState;
    use gol_starknet::gol_grid_v2;
    use gol_starknet::gol_utilities_v2::PartialPathData;
    use gol_starknet::gol_utilities_v2;
    use gol_starknet::interfaces_v2::LifeFormData;
    use gol_starknet::interfaces_v3::{
        IGolLoopMinterV3, IGolLifeFormsV3Dispatcher, IGolLifeFormsV3DispatcherTrait,
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

    #[generate_trait]
    impl PrivateImpl of PrivateTrait {
        /// Verify the claimed orbit canonical is a family member anchored at `anchor` (a verified
        /// cycle member): `apply_symmetry(g, step^k(anchor)) == canonical`. Returns its rows.
        fn verify_canonical(
            self: @ContractState,
            anchor: @Array<u64>,
            canonical: @GridState,
            d4: u8,
            dr: u32,
            dc: u32,
            k: u32,
            period: usize,
        ) -> Array<u64> {
            assert(k.into() < period, 'k out of range');
            let mut rows = gol_utilities_v2::clone_rows(anchor);
            let mut i: u32 = 0;
            while i < k {
                rows = gol_grid_v2::step(@rows);
                i += 1;
            };
            let cand = gol_grid_v2::apply_symmetry(d4, dr.into(), dc.into(), @rows);
            let canon_rows = gol_grid_v2::unpack(canonical);
            assert(gol_grid_v2::eq(@cand, @canon_rows), 'bad canonical witness');
            canon_rows
        }

        fn do_mint(
            ref self: ContractState,
            drawn_rows: @Array<u64>,
            loop_length: usize,
            canon_rows: @Array<u64>,
            canonical: GridState,
            recipient: ContractAddress,
        ) {
            let empty = gol_grid_v2::is_empty(drawn_rows);
            let lifeform = LifeFormData {
                is_loop: true,
                is_still: loop_length == 1,
                is_alive: !empty,
                is_dead: empty,
                sequence_length: loop_length,
                current_state: gol_grid_v2::pack(drawn_rows), // DRAWN state — display
                age: 0,
            };
            let lifeforms = IGolLifeFormsV3Dispatcher {
                contract_address: self.gol_lifeforms_nft.read(),
            };
            lifeforms
                .mint(
                    recipient,
                    get_caller_address(),
                    gol_grid_v2::token_id(canon_rows),
                    lifeform,
                    canonical,
                );
        }
    }

    #[abi(embed_v0)]
    impl GolLoopMinter of IGolLoopMinterV3<ContractState> {
        fn mint_loop(
            ref self: ContractState,
            drawn: GridState,
            loop_length: usize,
            canonical: GridState,
            d4: u8,
            dr: u32,
            dc: u32,
            k: u32,
            recipient: ContractAddress,
        ) -> bool {
            assert(loop_length > 0, 'Loop as to be at least 1');
            let rows = gol_grid_v2::unpack(@drawn);
            // Walk the cycle: `drawn` must be a single loop of exactly loop_length. The walk also
            // yields the TIME-lex-min — the verified anchor for the orbit witness. (v2's
            // "drawn == smallest" gate is intentionally gone.)
            let (is_loop, time_smallest, _) = gol_utilities_v2::is_single_loop(@rows, loop_length);
            assert(is_loop, 'Not a loop');
            let canon_rows = self
                .verify_canonical(@time_smallest, @canonical, d4, dr, dc, k, loop_length);
            self.do_mint(@rows, loop_length, @canon_rows, canonical, recipient);
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
            ref self: ContractState,
            loop_state: GridState,
            canonical: GridState,
            d4: u8,
            dr: u32,
            dc: u32,
            k: u32,
            recipient: ContractAddress,
        ) {
            // Tiled verification, anchored (like v2) on the TIME-smallest state: the accumulated
            // segment keyed by hash(loop_state) must span the whole cycle from it.
            let rows = gol_grid_v2::unpack(@loop_state);
            let loop_id = gol_grid_v2::token_hash(@rows);
            let caller = get_caller_address();
            let main_path = self.partial_path_registry.entry(caller).entry(loop_id).read();
            assert(loop_id == main_path.trigger_id, 'Not the right loop');
            assert(main_path.length > 1, 'Not usable for short loops');
            assert(loop_id == gol_grid_v2::grid_hash(@main_path.smallest), 'Not the smallest element');
            let exit_rows = gol_grid_v2::unpack(@main_path.exitpoint);
            let closed = gol_grid_v2::step(@exit_rows);
            assert(gol_grid_v2::token_hash(@closed) == loop_id, 'Loop does not loop');
            let period = main_path.length;
            // The orbit witness's phase: prefer a pre-walked phase segment (registered from
            // step(loop_state) with length k and trigger = canonical — chunkable for large k);
            // fall back to stepping k inline (fine for small k; the tx gas cap is the budget).
            let canon_rows = if k == 0 {
                self.verify_canonical(@rows, @canonical, d4, dr, dc, 0, period)
            } else {
                let phase_key = gol_grid_v2::token_hash(@gol_grid_v2::step(@rows));
                let phase = self.partial_path_registry.entry(caller).entry(phase_key).read();
                let canonical_id = gol_grid_v2::grid_hash(@canonical);
                if phase.length == k.into() && phase.trigger_id == canonical_id {
                    // exitpoint = step^k(loop_state): start = step(loop_state), k-1 more steps.
                    let phase_rows = gol_grid_v2::unpack(@phase.exitpoint);
                    self.verify_canonical(@phase_rows, @canonical, d4, dr, dc, 0, period)
                } else {
                    self.verify_canonical(@rows, @canonical, d4, dr, dc, k, period)
                }
            };
            let empty = gol_grid_v2::is_empty(@rows);
            let lifeform = LifeFormData {
                is_loop: true,
                is_still: false,
                is_alive: !empty,
                is_dead: empty,
                sequence_length: period,
                // Tiled mints display the walk anchor (the drawn orientation isn't threaded
                // through the multi-tx flow) — an accepted limitation of the tiled path.
                current_state: gol_grid_v2::pack(@rows),
                age: 0,
            };
            let lifeforms = IGolLifeFormsV3Dispatcher {
                contract_address: self.gol_lifeforms_nft.read(),
            };
            lifeforms
                .mint(recipient, caller, gol_grid_v2::token_id(@canon_rows), lifeform, canonical);
        }
    }
}
