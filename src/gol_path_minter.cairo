use super::interfaces::{IGolPathMinter};

#[starknet::contract]
mod GolPathMinter {
    use starknet::ContractAddress;
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
        let (is_loop, _, second_to_last_element) = returned_tuple;
        assert(is_loop, 'Not entering a loop');
        assert(second_to_last_element != *path_sequence[path_sequence.len()-2], 'Incorrect loop entrypoint');
        // if loop_exists {
        //     let gol_lifeforms = IGolLifeFormsDispatcher {contract_address: self.gol_lifeforms_nft.read()};
        //     let mut lifeform = LifeFormData {
        //         is_loop: true,
        //         is_still: false,
        //         is_alive: true,
        //         is_dead: false,
        //         sequence_length: loop_length.into(),
        //         current_state: loop_id
        //     };
        //     if (loop_id == 0) {
        //         lifeform.is_alive = false;
        //         lifeform.is_dead = true;
        //     }
        //     if (loop_length == 1) {
        //         lifeform.is_still = true;
        //     }
        //     gol_lifeforms.mint(recipient, loop_id, lifeform);
        
        // }
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
        // let name = "GOL Lifeforms";
        // let symbol = "GOL";
        // let base_uri = "https://api.example.com/v1/";
        // let token_id = 1;

        // self.erc721.initializer(name, symbol, base_uri);
        // self.erc721.mint(recipient, token_id);
    }
}