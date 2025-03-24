# Game of Life NFT System - Usage Guide

## Introduction
This guide explains how to interact with our digital bacteria ecosystem - a collection of autonomous life forms based on Conway's Game of Life. You'll learn how to discover new life forms, help sustain existing ones, and contribute to an ever-growing ecosystem of digital life.

## Prerequisites
- A StarkNet wallet (e.g., ArgentX, Braavos)
- Some ETH on StarkNet for gas fees
- Nutrient tokens (earned by helping existing life forms evolve)

## Understanding Life Forms

### Types of Life Forms

1. **Loops** - Eternal Life Forms
   - Patterns that repeat forever
   - Identified by their smallest grid ID in the sequence
   - Can be "still life" (length 1) or dynamic

2. **Paths** - Transitional Life Forms
   - Patterns that evolve towards a loop
   - Identified by their initial grid ID
   - Length is measured until they enter a loop

3. **Life Status**
   - Alive: Leads to a non-empty loop
   - Dead: Leads to an empty grid (ID 0)

## Contract Addresses
- GolLifeForms: [address]
- GolLoopMinter: [address]
- GolPathMinter: [address]
- Nutrient Token: [address]

## Basic Operations

### 1. Breathing Life into Existing Bacteria

The fundamental action in our ecosystem is helping existing life forms evolve. This:
- Earns you nutrient tokens
- Keeps the ecosystem alive
- Is required to mint new life forms

```cairo
lifeforms.move_lifeform_forward(token_id);
```

### 2. Discovering and Minting Loops

To mint a new eternal life form:

1. Discover a loop pattern (use our UI or calculate off-chain)
2. Verify it's the smallest element in its cycle
3. Pay with nutrient tokens proportional to the sequence length
4. Call the mint function:

```cairo
// Example: Minting a still life (block pattern)
loop_minter.mint_loop(
    loop_id: 237691741097710700555680088064, // The pattern's state
    loop_length: 1,                          // It's a still life
    recipient: your_address
);
```

### 2. Working with Paths

Paths are patterns that eventually lead to loops. You can:
a) Mint a complete path directly
b) Build a path by combining partial paths

#### Direct Path Minting
```cairo
path_minter.mint_path(
    path_id: path_state,
    length_to_loop_entrypoint: 5,    // Steps until reaching loop
    loop_entrypoint: loop_state,     // The loop it enters
    loop_length: 2,                  // Length of the target loop
    recipient: your_address
);
```

#### Building Paths in Parts
1. Register first segment:
```cairo
path_minter.mint_partial_path(
    path_start: initial_state,
    path_length: 3,
    trigger_state: intermediate_state
);
```

2. Register second segment:
```cairo
path_minter.mint_partial_path(
    path_start: intermediate_state,
    path_length: 2,
    trigger_state: final_state
);
```

3. Combine the segments:
```cairo
path_minter.combine_partial_path(
    partial_path_id_1: first_path_id,
    partial_path_id_2: second_path_id
);
```

### 3. Evolving Life Forms

Once you own a life form NFT, you can evolve it:
```cairo
lifeforms.move_lifeform_forward(token_id);
```
- This advances the pattern one generation
- Earns nutrient tokens for the evolution
- Updates the age counter

## Advanced Features

### 1. Pattern Validation
Before minting, you can validate patterns:
```cairo
utilities.is_single_loop_and_entrypoint_is_smallest_from_initial_state(
    state,
    length
);
```

### 2. State Computation
Calculate next states:
```cairo
utilities.iterate_life_once(current_state);
utilities.iterate_life_several_times(initial_state, generations);
```

## Best Practices

1. **Gas Optimization**
   - Combine partial paths locally before minting when possible
   - Batch operations when working with multiple patterns

2. **Pattern Discovery**
   - Use the UI tools to visualize patterns
   - Verify loop properties before attempting to mint
   - Keep track of discovered patterns for future reference

3. **Error Handling**
   Common error messages and their meanings:
   - "Not a loop": The pattern doesn't form a valid loop
   - "Not the right loop": Partial path doesn't match expected state
   - "Loop does not loop": Invalid loop connection in path

## Troubleshooting

### Common Issues

1. **Failed Minting**
   - Verify pattern validity
   - Check nutrient token allowance
   - Ensure pattern isn't already minted

2. **Path Combination Failures**
   - Verify partial paths exist
   - Check path compatibility
   - Confirm ownership of both paths

3. **Evolution Issues**
   - Verify token ownership
   - Check for sufficient gas
   - Ensure contract isn't paused

## Getting Help
- Join our Discord: [link]
- Visit the forum: [link]
- GitHub issues: [link] 