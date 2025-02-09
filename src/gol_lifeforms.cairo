use super::interfaces::{IGolLifeForms };
use super::gol_utilities::{GolUtilitiesComponent };

#[starknet::contract]
mod GolLifeforms {
    use super::GolUtilitiesComponent;
    use openzeppelin::introspection::src5::SRC5Component;
    use openzeppelin::token::erc721::{ERC721Component, ERC721HooksEmptyImpl};
    use openzeppelin::access::accesscontrol::AccessControlComponent;
    use openzeppelin::access::accesscontrol::DEFAULT_ADMIN_ROLE;
    use openzeppelin::upgrades::UpgradeableComponent;
    use openzeppelin::upgrades::interface::IUpgradeable;
    use starknet::ClassHash;
    use starknet::{ContractAddress, get_caller_address};
    use starknet::storage::{Map, StorageMapReadAccess, StorageMapWriteAccess};
    use gol_starknet::interfaces::{ LifeFormData };
    use core::array::ArrayTrait;
    const grid_size:u32 = 15;   

    component!(path: ERC721Component, storage: erc721, event: ERC721Event);
    component!(path: SRC5Component, storage: src5, event: SRC5Event);
    component!(path: AccessControlComponent, storage: accesscontrol, event: AccessControlEvent);
    component!(path: UpgradeableComponent, storage: upgradeable, event: UpgradeableEvent);
    component!(path: GolUtilitiesComponent, storage: golutilities, event: GolUtilitiesEvent);

    const MINTER_ROLE: felt252 = selector!("MINTER_ROLE");

    // ERC721 Mixin
    #[abi(embed_v0)]
    impl ERC721MixinImpl = ERC721Component::ERC721MixinImpl<ContractState>;
    impl ERC721InternalImpl = ERC721Component::InternalImpl<ContractState>;
     // AccessControl
    #[abi(embed_v0)]
    impl AccessControlImpl = AccessControlComponent::AccessControlImpl<ContractState>;
    impl AccessControlInternalImpl = AccessControlComponent::InternalImpl<ContractState>;
    // Upgradeable
    impl UpgradeableInternalImpl = UpgradeableComponent::InternalImpl<ContractState>;

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
        pub lifeform_data: Map<felt252, LifeFormData>
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
    }

    #[constructor]
    fn constructor(
        ref self: ContractState,
        // recipient: ContractAddress,
        // creator: ContractAddress
    ) {
        let name = "GOL Lifeforms";
        let symbol = "GOL";
        let base_uri = "<!DOCTYPE html><html><body>Hello World</body></html>";
        let token_id = 1;

        self.erc721.initializer(name, symbol, base_uri);
        self.erc721.mint(get_caller_address(), token_id);
        // AccessControl-related initialization
        self.accesscontrol.initializer();
        // self.accesscontrol._grant_role(MINTER_ROLE, recipient);
        // self.accesscontrol._grant_role(DEFAULT_ADMIN_ROLE, creator);
    }

    #[abi(embed_v0)]
    impl GolLifeFormsImpl of super::IGolLifeForms<ContractState> {
        fn mint(ref self: ContractState, recipient: ContractAddress, token_id: felt252, lifeform_data: LifeFormData) {
            self.accesscontrol.assert_only_role(MINTER_ROLE);
            self.erc721.mint(recipient, token_id.into());
            self.lifeform_data.write(token_id, lifeform_data);
        }
        fn get_lifeform_data(ref self: ContractState, token_id: felt252) -> LifeFormData{
            self.lifeform_data.read(token_id)
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
}