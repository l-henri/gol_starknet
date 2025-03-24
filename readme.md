# Game of Immortal Lifeforms

A decentralized ecosystem of autonomous digital bacteria living on StarkNet, powered by Conway's Game of Life. These digital life forms persist through social coordination and economic incentives.

## Overview

This project implements digital bacteria as NFTs on StarkNet, where each life form follows Conway's Game of Life rules. The ecosystem is sustained through:
- Social coordination among participants
- Economic incentives via the NUT token
- On-chain puzzle solving for minting
- Autonomous evolution mechanics

## Documentation

### Core Concepts
- [Purpose](docs/purpose.md) - The vision and goals of the project
- [Terminology](terminology.md) - Key terms and concepts
- [Technical Overview](docs/technical-overview.md) - High-level system architecture

### Technical Documentation
- [Project Structure](docs/project-structure.md) - Complete system architecture and contract interactions
- [Loop Minter](docs/loop-minter.md) - Documentation for loop-type life form minting
- [Path Minter](docs/path-minter.md) - Documentation for path-type life form minting
- [Nutrient Token](docs/nutrient-token.md) - Documentation for the NUT token system

### User Guides
- [Usage Guide](docs/usage-guide.md) - How to interact with the system
- [Minting Guide](docs/usage-guide.md#minting) - How to mint new life forms
- [Evolution Guide](docs/usage-guide.md#evolution) - How to participate in evolution

## Quick Start

1. **Understanding Life Forms**
   - Read the [Purpose](docs/purpose.md) document to understand the vision
   - Review [Terminology](terminology.md) for key concepts

2. **Technical Setup**
   - Check the [Technical Overview](docs/technical-overview.md)
   - Follow the [Usage Guide](docs/usage-guide.md) for setup instructions

3. **Creating Life**
   - Learn about [Loop Minting](docs/loop-minter.md) and [Path Minting](docs/path-minter.md)
   - Understand the [NUT token system](docs/nutrient-token.md)
   - Follow the [Minting Guide](docs/usage-guide.md#minting)

## Development

### Prerequisites
- Cairo 1.0
- Starknet Foundry
- Node.js and npm

### Setup
```bash
# Install dependencies
scarb build

# Run tests
snforge test
```

### Contract Addresses

- Mainnet:
  - GOL Lifeforms: [TBD]
  - NUT Token: [TBD]
  - Loop Minter: [TBD]
  - Path Minter: [TBD]

- Testnet:
  - GOL Lifeforms: [TBD]
  - NUT Token: [TBD]
  - Loop Minter: [TBD]
  - Path Minter: [TBD]

## Contributing

We welcome contributions! Please check our [contribution guidelines](docs/CONTRIBUTING.md) before submitting PRs.

## License

This project is licensed under [LICENSE] - see the LICENSE file for details.
