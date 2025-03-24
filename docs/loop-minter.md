# Loop Minter

## Overview

The Loop Minter is a specialized contract responsible for minting loop-type digital bacteria in the Game of Life ecosystem. A loop is a pattern that returns to its initial state after a certain number of generations, creating a cyclical behavior.

## Features

### Direct Loop Minting
- **Function**: `mint_loop(loop_id: u256, loop_length: usize, recipient: ContractAddress) -> bool`
- **Purpose**: Mints a new loop-type life form NFT
- **Requirements**:
  - Pattern must be a valid loop (returns to initial state)
  - Initial state must be the smallest in the loop sequence
  - Loop length must be greater than 0
- **Validation**:
  - Verifies loop authenticity using GOL Utilities
  - Checks that entry point is optimal
  - Ensures pattern stability

### Partial Path System

#### Creating Partial Paths
- **Function**: `mint_partial_path(path_start: u256, path_length: usize, trigger_state: u256)`
- **Purpose**: Creates a segment of a potential loop
- **Storage**: Paths stored in `partial_path_registry`
- **Events**: Emits `PartialPathCreatedEvent`

#### Combining Paths
- **Function**: `combine_partial_path(partial_path_id_1: u256, partial_path_id_2: u256)`
- **Purpose**: Merges two compatible partial paths
- **Requirements**:
  - Paths must be combinable (exit point of first matches entry point of second)
  - Paths must share the same trigger state
- **Events**: Emits `PartialPathsCombinedEvent`

#### Minting from Partial Paths
- **Function**: `mint_loop_from_partial_paths(loop_id: u256, recipient: ContractAddress)`
- **Purpose**: Creates a loop NFT from previously registered partial paths
- **Validation**:
  - Verifies complete loop formation
  - Checks loop integrity
  - Validates ownership of partial paths

## Technical Details

### Loop Validation
1. Pattern must complete a cycle within specified generations
2. Initial state must be the smallest value in the cycle
3. No intermediate state can be smaller than the initial state

### Storage Structure
```cairo
struct Storage {
    pub gol_lifeforms_nft: ContractAddress,
    pub partial_path_registry: Map<ContractAddress, Map<u256, PartialPathData>>,
}
```

### Partial Path Data
```cairo
struct PartialPathData {
    pub entrypoint: u256,
    pub exitpoint: u256,
    pub length: usize,
    pub trigger_state: u256,
    pub smallest_element: u256
}
```

## Economic Model

### Minting Costs
- Cost based on loop length
- Paid in NUT tokens
- Longer loops require more nutrients

### Incentives
- Encourages discovery of minimal loops
- Rewards efficient path combinations
- Promotes ecosystem diversity

## Integration Points

### GOL Utilities
- Loop validation
- State computation
- Path verification

### GOL Lifeforms NFT
- NFT minting
- Life form data storage
- State management

### Nutrient Token
- Minting cost collection
- Economic balance
- Participation rewards

## Usage Examples

### Minting a Simple Loop
```cairo
// Mint a period-2 blinker
let blinker_id = 0x...; // Grid state for vertical blinker
let success = loop_minter.mint_loop(blinker_id, 2, recipient);
```

### Building a Complex Loop
```cairo
// Create first part of the loop
loop_minter.mint_partial_path(start_state, 3, target_state);

// Create second part
loop_minter.mint_partial_path(mid_state, 2, target_state);

// Combine paths
loop_minter.combine_partial_path(start_state, mid_state);

// Mint the complete loop
loop_minter.mint_loop_from_partial_paths(start_state, recipient);
``` 