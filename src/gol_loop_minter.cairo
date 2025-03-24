#[starknet::contract]
mod GolLoopMinter {
    use starknet::{ContractAddress, get_caller_address};
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess, StoragePathEntry, Map};
    use crate::interfaces::{IGolLoopMinter, IGolUtilitiesDispatcher, IGolUtilitiesDispatcherTrait, IGolLifeFormsDispatcher, IGolLifeFormsDispatcherTrait, LifeFormData, PartialPathData};
    
    #[storage]
    struct Storage {
        pub gol_lifeforms_nft: ContractAddress,
        pub partial_path_registry: Map<ContractAddress,  Map<u256, PartialPathData>>,
    }

    #[derive(Drop, starknet::Event)]
    struct PartialPathCreatedEvent {
        owner: ContractAddress,
        path_start: u256,
        path_length: usize,
        trigger_state: u256
    }

    #[derive(Drop, starknet::Event)]
    struct PartialPathsCombinedEvent {
        owner: ContractAddress,
        path_id_1: u256,
        path_id_2: u256
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        PartialPathCreated: PartialPathCreatedEvent,
        PartialPathsCombined: PartialPathsCombinedEvent
    }

    // ERC721 Mixin
    #[abi(embed_v0)]
    impl GolLoopMinter of IGolLoopMinter<ContractState> {
        // Mint a token if and only if the submitted token id is in a loop, and if it is the smallest element in that loop.
        fn mint_loop(ref self: ContractState, loop_id: u256, loop_length: usize, recipient: ContractAddress) -> bool {
        assert(loop_length > 0, 'Loop as to be at least 1');
        let gol_utilities_contract = IGolUtilitiesDispatcher { contract_address: self.gol_lifeforms_nft.read() };
        let loop_exists = gol_utilities_contract.is_single_loop_and_entrypoint_is_smallest_from_initial_state(loop_id, loop_length);
        assert(loop_exists, 'Not a loop');
        if loop_exists {
            let gol_lifeforms = IGolLifeFormsDispatcher {contract_address: self.gol_lifeforms_nft.read()};
            let mut lifeform = LifeFormData {
                is_loop: true,
                is_still: false,
                is_alive: true,
                is_dead: false,
                sequence_length: loop_length.into(),
                current_state: loop_id, 
                age: 0
            };
            if (loop_id == 0) {
                lifeform.is_alive = false;
                lifeform.is_dead = true;
            }
            if (loop_length == 1) {
                lifeform.is_still = true;
            }
            // Get the caller's address
            let minter = get_caller_address();
            gol_lifeforms.mint(recipient, minter, loop_id, lifeform);
        
        }
        loop_exists
        }
        fn mint_loop_from_partial_paths(ref self: ContractState, loop_id: u256, recipient: ContractAddress) {
            // Retrieving main path 
            let main_path = self.partial_path_registry.entry(recipient).entry(loop_id).read();
            // Check that we're checking the right loop 
            // The combination of those two checks ensures that the partial path has been created 
            assert(loop_id == main_path.trigger_state, 'Not the right loop');
            assert(main_path.length > 1, 'Not usable for short loops');
            assert(loop_id == main_path.smallest_element, 'Not the smallest element');
            // Computing loop exit point
            let gol_utilities_contract = IGolUtilitiesDispatcher { contract_address: self.gol_lifeforms_nft.read() };
            let loop_exitpoint = gol_utilities_contract.iterate_life_once(main_path.exitpoint);
            
            assert(loop_exitpoint == loop_id, 'Loop does not loop');

            let gol_lifeforms = IGolLifeFormsDispatcher {contract_address: self.gol_lifeforms_nft.read()};
            let mut lifeform = LifeFormData {
                is_loop: true,
                is_still: false,
                is_alive: true,
                is_dead: false,
                sequence_length: main_path.length,
                current_state: loop_id, 
                age: 0
            };
            // Get the caller's address
            let minter = get_caller_address();
            gol_lifeforms.mint(recipient, minter, loop_id, lifeform);
            }
        fn mint_partial_path(ref self: ContractState, path_start: u256, path_length: usize, trigger_state: u256) {
            let gol_utilities_contract = IGolUtilitiesDispatcher { contract_address: self.gol_lifeforms_nft.read() };
            let partial_path = gol_utilities_contract.compute_partial_path(path_start, trigger_state, path_length);
            let minter = get_caller_address();            
            self.partial_path_registry.entry(minter).entry(path_start).write(partial_path);
            self.emit(Event::PartialPathCreated(PartialPathCreatedEvent { 
                owner: minter,
                path_start,
                path_length,
                trigger_state
            }));
        }
        fn combine_partial_path(ref self: ContractState, partial_path_id_1: u256, partial_path_id_2: u256) {
            let gol_utilities_contract = IGolUtilitiesDispatcher { contract_address: self.gol_lifeforms_nft.read() };
            let minter = get_caller_address(); 
            let partial_path_1 = self.partial_path_registry.entry(minter).entry(partial_path_id_1).read();
            let partial_path_2 = self.partial_path_registry.entry(minter).entry(partial_path_id_2).read();
            let combined_path = gol_utilities_contract.combine_partial_path(partial_path_1, partial_path_2);
            self.partial_path_registry.entry(minter).entry(partial_path_id_1).write(combined_path);
            self.emit(Event::PartialPathsCombined(PartialPathsCombinedEvent {
                owner: minter,
                path_id_1: partial_path_id_1,
                path_id_2: partial_path_id_2
            }));
        }
    }
    
    // #[storage]
    // struct Storage {
    //     // #[substorage(v0)]
    //     // erc721: ERC721Component::Storage,
    //     // #[substorage(v0)]
    //     // src5: SRC5Component::Storage
    // }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        _gol_lifeforms_nft: ContractAddress
    ) {
        self.gol_lifeforms_nft.write(_gol_lifeforms_nft);
        // let name = "GOL Lifeforms";
        // let symbol = "GOL";
        // let base_uri = "https://api.example.com/v1/";
        // let token_id = 1;

        // self.erc721.initializer(name, symbol, base_uri);
        // self.erc721.mint(recipient, token_id);
    }
}