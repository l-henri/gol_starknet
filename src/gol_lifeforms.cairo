use super::interfaces::{IGolLifeForms };
use super::gol_utilities::{GolUtilitiesComponent };

#[starknet::contract]
mod GolLifeforms {
    use super::GolUtilitiesComponent;
    use openzeppelin::introspection::src5::SRC5Component;
    use openzeppelin::token::erc721::{ERC721Component, ERC721HooksEmptyImpl};
    use openzeppelin::interfaces::erc721::{IERC721Metadata, IERC721MetadataCamelOnly};
    use openzeppelin::interfaces::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};
    use gol_starknet::gol_metadata;
    use openzeppelin::access::accesscontrol::AccessControlComponent;
    use openzeppelin::access::accesscontrol::DEFAULT_ADMIN_ROLE;
    use openzeppelin::upgrades::UpgradeableComponent;
    use openzeppelin::interfaces::upgrades::IUpgradeable;
    use starknet::ClassHash;
    use starknet::{ContractAddress, get_caller_address, get_contract_address};
    use starknet::storage::{Map, StorageMapReadAccess, StorageMapWriteAccess};
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use gol_starknet::interfaces::{ LifeFormData, IGolNutrientTokenDispatcher, IGolNutrientTokenDispatcherTrait};
    use core::array::ArrayTrait;

    component!(path: ERC721Component, storage: erc721, event: ERC721Event);
    component!(path: SRC5Component, storage: src5, event: SRC5Event);
    component!(path: AccessControlComponent, storage: accesscontrol, event: AccessControlEvent);
    component!(path: UpgradeableComponent, storage: upgradeable, event: UpgradeableEvent);
    component!(path: GolUtilitiesComponent, storage: golutilities, event: GolUtilitiesEvent);

    const MINTER_ROLE: felt252 = selector!("MINTER_ROLE");

    // ERC721 core + SRC5. token_uri/tokenURI are overridden below (see ERC721MetadataImpl)
    // so lifeforms render on-chain, so we embed the pieces individually instead of the Mixin.
    #[abi(embed_v0)]
    impl ERC721Impl = ERC721Component::ERC721Impl<ContractState>;
    #[abi(embed_v0)]
    impl ERC721CamelOnlyImpl = ERC721Component::ERC721CamelOnlyImpl<ContractState>;
    #[abi(embed_v0)]
    impl SRC5Impl = SRC5Component::SRC5Impl<ContractState>;
    impl ERC721InternalImpl = ERC721Component::InternalImpl<ContractState>;
     // AccessControl
    #[abi(embed_v0)]
    impl AccessControlImpl = AccessControlComponent::AccessControlImpl<ContractState>;
    impl AccessControlInternalImpl = AccessControlComponent::InternalImpl<ContractState>;
    // Upgradeable
    impl UpgradeableInternalImpl = UpgradeableComponent::InternalImpl<ContractState>;
    // Gol utilities
    #[abi(embed_v0)]
    impl GolUtilitiesImpl = GolUtilitiesComponent::GolUtilitiesImpl<ContractState>;

    // Custom ERC721 metadata: token_uri renders the lifeform's current state as an on-chain SVG.
    #[abi(embed_v0)]
    impl ERC721MetadataImpl of IERC721Metadata<ContractState> {
        fn name(self: @ContractState) -> ByteArray {
            self.erc721.ERC721_name.read()
        }
        fn symbol(self: @ContractState) -> ByteArray {
            self.erc721.ERC721_symbol.read()
        }
        fn token_uri(self: @ContractState, token_id: u256) -> ByteArray {
            gol_metadata::token_uri(token_id, self.lifeform_data.read(token_id))
        }
    }
    #[abi(embed_v0)]
    impl ERC721MetadataCamelImpl of IERC721MetadataCamelOnly<ContractState> {
        fn tokenURI(self: @ContractState, tokenId: u256) -> ByteArray {
            gol_metadata::token_uri(tokenId, self.lifeform_data.read(tokenId))
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
        #[substorage(v0)]
        golutilities: GolUtilitiesComponent::Storage,
        pub lifeform_data: Map<u256, LifeFormData>,
        pub total_supply: u256,
        pub nutrient_token_contract: ContractAddress
    }
    #[derive(Drop, starknet::Event)]
    struct NewLifeFormEvent {
        owner: ContractAddress, 
        token_id: u256, 
        lifeform_data: LifeFormData
    }
    #[derive(Drop, starknet::Event)]
    struct NewMoveEvent {
        token_id: u256, 
        age: u32
    }
    #[derive(Drop, starknet::Event)]
    struct NutrientContractUpdatedEvent {
        nutrient_contract_address: ContractAddress, 
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
        #[flat]
        GolUtilitiesEvent: GolUtilitiesComponent::Event,
        NewLifeForm: NewLifeFormEvent,
        NewMove: NewMoveEvent,
        NutrientContractUpdated: NutrientContractUpdatedEvent
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        creator: ContractAddress,
    ) {
        let name = "Digital bacterias";
        let symbol = "BACT";
        // token_uri is rendered on-chain (see gol_metadata), so no base URI is needed.
        let base_uri = "";
        // let token_id = 0;

        self.erc721.initializer(name, symbol, base_uri);
        // self.erc721.mint(creator, token_id);
        // AccessControl-related initialization
        self.accesscontrol.initializer();
        // self.accesscontrol._grant_role(MINTER_ROLE, recipient);
        self.accesscontrol._grant_role(DEFAULT_ADMIN_ROLE, creator);
    }

    #[abi(embed_v0)]
    impl GolLifeFormsImpl of super::IGolLifeForms<ContractState> {
        fn mint(ref self: ContractState, recipient: ContractAddress, minter: ContractAddress, token_id: u256, lifeform_data: LifeFormData) {
            // Checking wether caller can mint
            self.accesscontrol.assert_only_role(MINTER_ROLE);
            self.erc721.mint(recipient, token_id);
            let sequence_length =  lifeform_data.sequence_length;
            // Writing lifeform data
            self.lifeform_data.write(token_id, lifeform_data);
            self.emit(Event::NewLifeForm(NewLifeFormEvent{owner: recipient, token_id, lifeform_data}));
            // Increasing total supply
            self.total_supply.write(self.total_supply.read() + 1);
            // Get this contract's address
            let this_contract = get_contract_address();
            // Create a dispatcher to interact with the ERC20 token
            let mut nutrient_token = IERC20Dispatcher{ contract_address: self.nutrient_token_contract.read() };
            // Charge the minter with the relevant price
            nutrient_token.transfer_from(minter, this_contract, sequence_length.into() * 1000000000000000000);

        }
        fn get_lifeform_data( self: @ContractState, token_id: u256) -> LifeFormData{
            self.lifeform_data.read(token_id)
        }
        fn move_lifeform_forward(ref self: ContractState, token_id: u256){
            // NUT is earned by advancing a real, minted lifeform — not phantom/unminted ids.
            // (Earning NUT is meant to be free-but-effortful on-chain movement; advancing a
            // token that doesn't exist is not movement, so it doesn't earn.)
            assert(self.erc721.exists(token_id), 'Lifeform not minted');
            let mut lifeform_data = self.lifeform_data.read(token_id);
            lifeform_data.current_state = self.golutilities.iterate_life_once(lifeform_data.current_state);
            lifeform_data.age += 1;
            self.lifeform_data.write(token_id, lifeform_data);
            self.emit(Event::NewMove(NewMoveEvent{token_id, age: lifeform_data.age }));
            // Get the caller's address
            let caller = get_caller_address();
            // Create a dispatcher to interact with the Nutrient token
            let mut nutrient_token = IGolNutrientTokenDispatcher{ contract_address: self.nutrient_token_contract.read() };
            // Mint nutrient token for sender
            nutrient_token.mint(caller, 1 * 1000000000000000000);
        }
        
    }
    #[abi(embed_v0)]
    impl UpgradeableImpl of IUpgradeable<ContractState> {
        fn upgrade(ref self: ContractState, new_class_hash: ClassHash) {
            // This function can only be called by the DEFAULT_ADMIN_ROLE
            self.accesscontrol.assert_only_role(DEFAULT_ADMIN_ROLE);

            // Replace the class hash upgrading the contract
            self.upgradeable.upgrade(new_class_hash);
        }
    }

    #[external(v0)]
    fn update_nutrient_contract_address(ref self: ContractState, nutrient_contract_address: ContractAddress) {
        self.accesscontrol.assert_only_role(DEFAULT_ADMIN_ROLE);
        self.nutrient_token_contract.write(nutrient_contract_address);
        self.emit(Event::NutrientContractUpdated(NutrientContractUpdatedEvent{nutrient_contract_address}));
    }
}