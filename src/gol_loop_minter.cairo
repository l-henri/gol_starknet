use super::interfaces::{IGolLoopMinter};

#[starknet::contract]
mod GolLoopMinter {
    use starknet::ContractAddress;
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    // use super::interfaces::{IGolUtilities};
    use gol_starknet::interfaces::{IGolUtilitiesDispatcher,IGolUtilitiesDispatcherTrait, IGolLifeFormsDispatcher, IGolLifeFormsDispatcherTrait};
    // use gol_starknet::interfaces::{IGolUtilities, IGolLifeFormsDispatcher, IGolLifeFormsDispatcherTrait};
    
    #[storage]
    struct Storage {
        game_of_life_functions_contract: ContractAddress,
        gol_lifeforms_nft: ContractAddress,
    }

    // ERC721 Mixin
    #[abi(embed_v0)]
    impl GolLoopMinter of super::IGolLoopMinter<ContractState> {
        // Mint a token if and only if the submitted token id is in a loop, and if it is the smallest element in that loop.
        fn mint_loop(ref self: ContractState, loop_id: felt252, loop_length: usize, recipient: ContractAddress) -> bool {

        let gol_utilities_contract = IGolUtilitiesDispatcher { contract_address: self.game_of_life_functions_contract.read() };
        let loop_exists = gol_utilities_contract.validate_loop_from_initial_state(loop_id, loop_length);
        if loop_exists {
            let gol_lifeforms = IGolLifeFormsDispatcher {contract_address: self.gol_lifeforms_nft.read()};
            gol_lifeforms.mint(recipient, loop_id);
        
        }
        loop_exists
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
        game_of_life_functions_address: ContractAddress
    ) {
        // self.game_of_life_functions_contract.write(game_of_life_functions_address);
        // let name = "GOL Lifeforms";
        // let symbol = "GOL";
        // let base_uri = "https://api.example.com/v1/";
        // let token_id = 1;

        // self.erc721.initializer(name, symbol, base_uri);
        // self.erc721.mint(recipient, token_id);
    }
}