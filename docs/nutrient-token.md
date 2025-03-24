# Nutrient Token (NUT)

## Overview

The Nutrient Token (NUT) is an ERC20 token that represents the economic foundation of the Game of Life ecosystem. It serves as both a cost mechanism for creating new life forms and a reward system for participating in the ecosystem's evolution.

## Features

### Token Standard
- Implements ERC20 standard
- Name: "Bacteria nutrient"
- Symbol: "NUT"
- Decimals: 18 (1 NUT = 10^18 base units)

### Access Control
- Uses OpenZeppelin's AccessControl
- Defines MINTER_ROLE for authorized minting
- DEFAULT_ADMIN_ROLE for contract management
- Upgradeable contract design

## Core Functions

### Token Management
```cairo
fn mint(ref self: ContractState, recipient: ContractAddress, amount: u256)
```
- Restricted to MINTER_ROLE
- Creates new tokens
- Used for ecosystem rewards

### Contract Administration
```cairo
fn upgrade(ref self: ContractState, new_class_hash: ClassHash)
```
- Restricted to DEFAULT_ADMIN_ROLE
- Enables contract upgrades
- Maintains system flexibility

## Economic Model

### Token Distribution

1. **Initial Supply**
   - Created during contract deployment
   - Distributed to creator address
   - Forms initial ecosystem liquidity

2. **Minting Mechanics**
   - New tokens minted as rewards
   - Controlled inflation rate
   - Tied to ecosystem activity

### Cost Structure

1. **Life Form Creation**
   - Loop cost = loop_length * BASE_COST
   - Path cost = path_length * BASE_COST
   - BASE_COST = 1 NUT (10^18 units)

2. **Evolution Rewards**
   - 1 NUT per evolution step
   - Rewards active participation
   - Encourages ecosystem maintenance

## Integration Points

### GOL Lifeforms Contract
- Collects minting costs
- Distributes evolution rewards
- Manages token flow

### Minter Contracts
- Calculate minting costs
- Verify token availability
- Process token transfers

## Technical Implementation

### Storage Structure
```cairo
struct Storage {
    #[substorage(v0)]
    erc20: ERC20Component::Storage,
    #[substorage(v0)]
    accesscontrol: AccessControlComponent::Storage,
    #[substorage(v0)]
    upgradeable: UpgradeableComponent::Storage,
    #[substorage(v0)]
    src5: SRC5Component::Storage,
}
```

### Events
```cairo
#[event]
enum Event {
    #[flat]
    ERC20Event: ERC20Component::Event,
    #[flat]
    AccessControlEvent: AccessControlComponent::Event,
    #[flat]
    UpgradeableEvent: UpgradeableComponent::Event,
    #[flat]
    SRC5Event: SRC5Component::Event,
}
```

## Usage Examples

### Contract Initialization
```cairo
#[constructor]
fn constructor(
    ref self: ContractState,
    initial_supply: u256,
    creator: ContractAddress
) {
    let name = "Bacteria nutrient";
    let symbol = "NUT";

    self.erc20.initializer(name, symbol);
    self.erc20.mint(creator, initial_supply);
    self.accesscontrol.initializer();
    self.accesscontrol._grant_role(DEFAULT_ADMIN_ROLE, creator);
}
```

### Minting Rewards
```cairo
// Reward user for evolving a life form
nutrient_token.mint(user_address, 1000000000000000000); // 1 NUT
```

## Economic Considerations

### Token Velocity
- Minting costs create token sinks
- Evolution rewards provide token sources
- Balance maintains ecosystem health

### Value Proposition
1. **Utility Value**
   - Required for creating life forms
   - Needed for ecosystem participation

2. **Scarcity Mechanics**
   - Limited by minting controls
   - Tied to actual ecosystem usage

3. **Growth Model**
   - Organic expansion through activity
   - Self-regulating through cost/reward balance

## Security Features

### Access Control
- Role-based permissions
- Admin functions protected
- Minting restricted

### Upgradability
- Contract can be upgraded
- Preserves token balances
- Allows system evolution

### Standards Compliance
- ERC20 compatible
- SRC5 introspection
- OpenZeppelin security 