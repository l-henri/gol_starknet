use crate::interfaces::{IGolPathMinter};

#[starknet::contract]
mod GolPathMinter {
    use starknet::{ContractAddress, get_caller_address};
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess, StoragePathEntry, Map};
    use crate::interfaces::{IGolUtilitiesDispatcher,IGolUtilitiesDispatcherTrait, IGolLifeFormsDispatcher, IGolLifeFormsDispatcherTrait, LifeFormData, PartialPathData};
    
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
    impl GolPathMinter of super::IGolPathMinter<ContractState> {
        // Mint a token if and only if the submitted token id leads to a loop, but is not in a loop himself
        fn mint_path(ref self: ContractState, path_id: u256, length_to_loop_entrypoint: usize, loop_entrypoint: u256, loop_length: usize, recipient: ContractAddress) -> bool {
            assert(length_to_loop_entrypoint > 0, 'No path smaller than 1');
            let path_exists = true;
            let gol_utilities_contract = IGolUtilitiesDispatcher { contract_address: self.gol_lifeforms_nft.read() };
            // Compute path to loop entry point. The loop entry point is the last element in the array
            let path_sequence = gol_utilities_contract.iterate_life_several_times(path_id, length_to_loop_entrypoint);
            // Verify there is a single loop after this point
            let returned_tuple = gol_utilities_contract.is_single_loop_from_initial_state(*path_sequence[path_sequence.len()-1], loop_length);
            // Verify if we enter the loop from a non loop
            let (is_loop, _, loop_sequence) = returned_tuple;
            let second_to_last_element = *loop_sequence[loop_length-1];
            assert(is_loop, 'Not entering a loop');
            assert(second_to_last_element != *path_sequence[path_sequence.len()-2], 'Incorrect loop entrypoint');
            let gol_lifeforms = IGolLifeFormsDispatcher {contract_address: self.gol_lifeforms_nft.read()};
            let mut lifeform = LifeFormData {
                is_loop: false,
                is_still: false,
                is_alive: true,
                is_dead: false,
                sequence_length: length_to_loop_entrypoint.into(),
                current_state: path_id,
                age: 0
            };
            if (loop_entrypoint == 0)
            {
                lifeform.is_alive = false;
                lifeform.is_dead = true;
            }
            // Get the minter's address
            let minter = get_caller_address();
            gol_lifeforms.mint(recipient, minter, path_id, lifeform);
        
            path_exists
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
         // Mint a token if and only if the submitted token id leads to a loop, but is not in a loop himself
         fn mint_path_from_partial_paths(ref self: ContractState, path_id: u256, recipient: ContractAddress) {
            // Retrieving main path 
            let main_path = self.partial_path_registry.entry(recipient).entry(path_id).read();
            // Computing loop entry point
            let gol_utilities_contract = IGolUtilitiesDispatcher { contract_address: self.gol_lifeforms_nft.read() };
            let loop_entrypoint = gol_utilities_contract.iterate_life_once(main_path.exitpoint);
            // Retrieving loop partial path data
            let loop_partial_path = self.partial_path_registry.entry(recipient).entry(loop_entrypoint).read();
            assert(loop_partial_path.trigger_state == loop_entrypoint, 'Not the right loop');
            // Checking that the loop indeed loops
            let loop_exitpoint =  gol_utilities_contract.iterate_life_once(loop_partial_path.exitpoint);
            assert(loop_exitpoint == loop_partial_path.entrypoint, 'Loop does not loop');
            assert(main_path.exitpoint != loop_partial_path.exitpoint, 'Loop is the main path');
            // Recording path
            let gol_lifeforms = IGolLifeFormsDispatcher {contract_address: self.gol_lifeforms_nft.read()};
            let mut lifeform = LifeFormData {
                is_loop: false,
                is_still: false,
                is_alive: true,
                is_dead: false,
                sequence_length: main_path.length,
                current_state: path_id,
                age: 0
            };
            if (loop_entrypoint == 0)
            {
                lifeform.is_alive = false;
                lifeform.is_dead = true;
            }
            // Get the minter's address
            let minter = get_caller_address();
            gol_lifeforms.mint(recipient, minter, path_id, lifeform);
        
        }

    }
    

    #[constructor]
    fn constructor(
        ref self: ContractState,
        _gol_lifeforms_nft: ContractAddress
    ) {
        self.gol_lifeforms_nft.write(_gol_lifeforms_nft);
    }
}