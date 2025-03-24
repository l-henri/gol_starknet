# Game of Life NFT System - Technical Documentation

## Overview
This system implements digital bacteria - autonomous life forms based on Conway's Game of Life - as NFTs on StarkNet. Unlike traditional implementations, these life forms can persist indefinitely on the blockchain through social coordination and economic incentives.

Each life form exists on a 15x15 grid, which despite its apparent simplicity, offers more possible states than atoms in the universe. These states evolve according to Conway's rules, ultimately leading to either eternal life (loops) or death (empty grid).

For a deeper understanding of the project's vision and purpose, see our [Purpose Statement](../purpose.md).

## Core Components

### 1. GolLifeForms Contract
The main NFT contract that represents Game of Life patterns as ERC721 tokens.

**Key Features:**
- ERC721-compliant NFT implementation
- Role-based access control for minting
- Integration with nutrient token system
- Ability to evolve life forms through generations

### 2. GolLoopMinter Contract
Handles the minting of loop patterns in the Game of Life.

**Key Functions:**
```cairo
fn mint_loop(ref self: ContractState, loop_id: u256, loop_length: usize, recipient: ContractAddress) -> bool
```
- **Purpose**: Mints an NFT representing a loop pattern in Game of Life
- **Parameters**:
  - `loop_id`: The state ID of the loop
  - `loop_length`: Number of generations in the loop
  - `recipient`: Address to receive the NFT
- **Returns**: Boolean indicating success
- **Validation**: Ensures the pattern is a valid loop and is the smallest element in that loop

```cairo
fn mint_partial_path(ref self: ContractState, path_start: u256, path_length: usize, trigger_state: u256)
```
- **Purpose**: Creates a partial path record for later combination
- **Parameters**:
  - `path_start`: Starting state of the path
  - `path_length`: Length of the path
  - `trigger_state`: Target state to reach
- **Events**: Emits `PartialPathCreatedEvent`

```cairo
fn combine_partial_path(ref self: ContractState, partial_path_id_1: u256, partial_path_id_2: u256)
```
- **Purpose**: Combines two partial paths into a longer path
- **Parameters**:
  - `partial_path_id_1`: ID of first partial path
  - `partial_path_id_2`: ID of second partial path
- **Events**: Emits `PartialPathsCombinedEvent`

### 3. GolPathMinter Contract
Handles the minting of path patterns that lead to loops.

**Key Functions:**
```cairo
fn mint_path(ref self: ContractState, path_id: u256, length_to_loop_entrypoint: usize, loop_entrypoint: u256, loop_length: usize, recipient: ContractAddress) -> bool
```
- **Purpose**: Mints an NFT representing a path that leads to a loop
- **Parameters**:
  - `path_id`: The state ID of the path
  - `length_to_loop_entrypoint`: Number of generations until reaching loop
  - `loop_entrypoint`: State ID where the loop begins
  - `loop_length`: Length of the loop
  - `recipient`: Address to receive the NFT
- **Returns**: Boolean indicating success
- **Validation**: Ensures the path leads to a valid loop

### 4. Events System

**PartialPathCreatedEvent:**
```cairo
struct PartialPathCreatedEvent {
    owner: ContractAddress,
    path_start: u256,
    path_length: usize,
    trigger_state: u256
}
```
- Emitted when a new partial path is registered
- Tracks creation of path segments for later combination

**PartialPathsCombinedEvent:**
```cairo
struct PartialPathsCombinedEvent {
    owner: ContractAddress,
    path_id_1: u256,
    path_id_2: u256
}
```
- Emitted when two partial paths are combined
- Helps track path construction history

## Data Structures

### LifeFormData
```cairo
struct LifeFormData {
    is_loop: bool,
    is_still: bool,
    is_alive: bool,
    is_dead: bool,
    sequence_length: usize,
    current_state: u256,
    age: u32
}
```
- Core data structure representing a Game of Life pattern
- Tracks pattern type, state, and evolution metrics

## Key Design Features

1. **Permissionless Minting**
   - Anyone can mint NFTs if they discover valid patterns
   - No restrictions on minting beyond pattern validity

2. **Pattern Verification**
   - Robust verification of loop and path validity
   - Ensures only legitimate Game of Life patterns can be minted

3. **Partial Path System**
   - Allows discovery and registration of path segments
   - Supports combining segments to find longer paths

4. **Event Tracking**
   - Events for partial path operations enable off-chain tracking
   - Helps build history of pattern discovery

## Integration Points

1. **Nutrient Token**
   - ERC20 token integrated with the system
   - Used for minting costs and rewards

2. **Game of Life Utilities**
   - Core logic for Game of Life evolution
   - Pattern validation and state computation 