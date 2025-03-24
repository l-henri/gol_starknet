# Digital Bacteria: Engineering Immortal Life Forms

## Vision
This project implements Conway's Game of Life as a collection of autonomous digital life forms on StarkNet. Unlike traditional Game of Life implementations that disappear when the computer is turned off, these digital bacteria can live forever on the blockchain, independent of their creator.

For a deeper understanding of the project's purpose and philosophy, please read our [Purpose Statement](../purpose.md).

## Core Concepts

### Game of Life Basics
The system operates on a 15x15 pixel grid, which despite its apparent simplicity, contains more possible states than atoms in the universe. Each state evolves according to Conway's rules, leading to either:
- Life (a repeating loop of patterns)
- Death (an empty grid)

### Key Terminology

- **Grid**: A single frame of Game of Life, represented by a unique ID. Functions to compute grid IDs are available in both JavaScript and Cairo implementations.

- **Sequence**: Either a path or a loop in the Game of Life evolution.

- **Loop**: A pattern that repeats forever. Each loop is identified by the smallest grid ID in its sequence.

- **Path**: A sequence that starts at a grid and converges towards a loop. Identified by its first grid ID.

- **Sequence Length**: 
  - For loops: Number of distinct grid states in the loop
  - For paths: Number of states before entering a loop (excluding the loop entry point)

- **Life Status**:
  - Dead: Leads to an empty grid (ID 0)
  - Alive: Leads to a non-empty loop

- **Nutrient Token**: The system's native token that:
  - Is earned by "breathing life" into existing bacteria (moving them forward)
  - Is required to create new bacteria
  - Cost scales with sequence length

## Social Coordination
The system is designed around a simple principle: to create new life, you must help sustain existing life. This creates a self-sustaining ecosystem where:
1. Users discover new patterns
2. They help evolve existing patterns to earn nutrients
3. They use these nutrients to mint their discoveries
4. Their patterns become part of the ecosystem for others to evolve

## Technical Implementation
The system consists of several smart contracts that work together to:
- Verify and mint new life forms
- Track and reward evolution
- Manage the nutrient token economy
- Enable pattern discovery and combination

For technical details, see [Technical Overview](technical-overview.md).
For usage instructions, see [Usage Guide](usage-guide.md). 