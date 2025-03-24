# Path Minter

## Overview

The Path Minter is a specialized contract responsible for minting path-type digital bacteria in the Game of Life ecosystem. A path is a pattern that evolves into a loop after a certain number of generations, representing the journey of a life form towards stability.

## Features

### Direct Path Minting
- **Function**: `mint_path(path_id: u256, length_to_loop_entrypoint: usize, loop_entrypoint: u256, loop_length: usize, recipient: ContractAddress) -> bool`
- **Purpose**: Mints a new path-type life form NFT
- **Requirements**:
  - Pattern must lead to a valid loop
  - Path length must be greater than 0
  - Loop entry point must be valid
- **Validation**:
  - Verifies path authenticity using GOL Utilities
  - Confirms loop existence at endpoint
  - Ensures path uniqueness

### Partial Path System

#### Creating Partial Paths
- **Function**: `mint_partial_path(path_start: u256, path_length: usize, trigger_state: u256)`
- **Purpose**: Creates a segment of a potential path
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
- **Function**: `mint_path_from_partial_paths(path_id: u256, recipient: ContractAddress)`
- **Purpose**: Creates a path NFT from previously registered partial paths
- **Validation**:
  - Verifies path leads to a loop
  - Checks path integrity
  - Validates ownership of partial paths

## Technical Details

### Path Validation
1. Pattern must evolve into a loop within specified generations
2. Path must not be part of the loop itself
3. Path must be unique (no other path leads to the same loop entry point)

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
- Cost based on path length
- Paid in NUT tokens
- Longer paths require more nutrients

### Incentives
- Encourages discovery of efficient paths
- Rewards path optimization
- Promotes ecosystem exploration

## Integration Points

### GOL Utilities
- Path validation
- State computation
- Loop detection

### GOL Lifeforms NFT
- NFT minting
- Life form data storage
- State management

### Nutrient Token
- Minting cost collection
- Economic balance
- Participation rewards

## Usage Examples

### Minting a Simple Path
```cairo
// Mint a path that leads to a blinker
let l_shape_id = 0x...; // Grid state for L-shape pattern
let blinker_id = 0x...; // Grid state for blinker
let success = path_minter.mint_path(l_shape_id, 1, blinker_id, 2, recipient);
```

### Building a Complex Path
```cairo
// Create first part of the path
path_minter.mint_partial_path(start_state, 2, target_state);

// Create second part
path_minter.mint_partial_path(mid_state, 3, target_state);

// Combine paths
path_minter.combine_partial_path(start_state, mid_state);

// Mint the complete path
path_minter.mint_path_from_partial_paths(start_state, recipient);
```

## Key Differences from Loop Minter

1. **Evolution Target**
   - Path Minter: Patterns evolve into loops
   - Loop Minter: Patterns are already loops

2. **Validation Focus**
   - Path Minter: Validates path to loop
   - Loop Minter: Validates loop properties

3. **State Requirements**
   - Path Minter: Initial state ≠ Final state
   - Loop Minter: Initial state = Final state

4. **Cost Structure**
   - Path Minter: Based on path length
   - Loop Minter: Based on loop period 