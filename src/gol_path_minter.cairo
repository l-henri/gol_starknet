use super::interfaces::{IGolPathMinter};

#[starknet::contract]
mod GolPathMinter {
    use starknet::{ContractAddress, get_caller_address};
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use gol_starknet::interfaces::{IGolUtilitiesDispatcher,IGolUtilitiesDispatcherTrait, IGolLifeFormsDispatcher, IGolLifeFormsDispatcherTrait, LifeFormData};
    
    #[storage]
    struct Storage {
        gol_lifeforms_nft: ContractAddress,
    }

    // ERC721 Mixin
    #[abi(embed_v0)]
    impl GolPathMinter of super::IGolPathMinter<ContractState> {
        // Mint a token if and only if the submitted token id is in a loop, and if it is the smallest element in that loop.
        fn mint_path(ref self: ContractState, path_id: felt252, length_to_loop_entrypoint: usize, loop_entrypoint: felt252, loop_length: usize, recipient: ContractAddress) -> bool {
        let path_exists = true;
        let gol_utilities_contract = IGolUtilitiesDispatcher { contract_address: self.gol_lifeforms_nft.read() };
        // Compute path to loop entry point. The loop entry point is the last element in the array
        let path_sequence = gol_utilities_contract.iterate_life_several_times(path_id, length_to_loop_entrypoint);
        // Verify there is a single loop after this point
        let returned_tuple = gol_utilities_contract.is_single_loop_from_initial_state(*path_sequence[path_sequence.len()-1], loop_length);
        // Verify if we enter the loop from a non loop
        let (is_loop, _, loop_sequence) = returned_tuple;
        let second_to_last_element = *loop_sequence[loop_length-2];
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
    }
    
    // #[storage]
    // struct Storage {
    //     // #[substorage(v0)]
    //     // erc721: ERC721Component::Storage,
    //     // #[substorage(v0)]
    //     // src5: SRC5Component::Storage
    // }

    // #[event]
    // #[derive(Drop, starknet::Event)]
    // enum Event {
    //     #[flat]
    //     ERC721Event: ERC721Component::Event,
    //     #[flat]
    //     SRC5Event: SRC5Component::Event
    // }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        _gol_lifeforms_nft: ContractAddress
    ) {
        self.gol_lifeforms_nft.write(_gol_lifeforms_nft);
    }
}