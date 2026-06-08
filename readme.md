# Game of Immortal Lifeforms

A decentralized ecosystem of autonomous digital bacteria living on Starknet, powered by
Conway's Game of Life. Each life form follows Conway's rules on a 15×15 grid and persists
on-chain — independent of its creator — sustained by social coordination and the NUT token.

- **Discover** a pattern and run it to find its fate: a repeating **loop** (life) or an empty
  grid (death).
- **Mint** discovered loops and paths as NFTs.
- **Breathe life** into existing lifeforms to move them forward and earn NUT, which is what
  lets you mint new ones.

See [docs/purpose.md](docs/purpose.md) for the full vision.

## Repository layout

```
src/                 Cairo smart contracts (NFT, NUT token, minters, GoL engine)
tests/               snforge integration tests
scripts/             deploy scripts (starknet.js)
ui/game-of-life/     the Next.js web app (the frontend)
js/                  standalone JavaScript reference implementation
docs/                all documentation (start at docs/README.md)
```

## Quick start

**Contracts**
```bash
scarb build
snforge test
```

**Web app**
```bash
cd ui/game-of-life
npm install
cp .env.local.example .env.local   # fill in addresses after deploying
npm run dev                         # http://localhost:3000
```

Full build/test/deploy instructions: [docs/development.md](docs/development.md).

## Documentation

All docs live in [`docs/`](docs/). **Start at [docs/README.md](docs/README.md)** — it's the
index and tells you where to find everything. The short version:

- **Concept:** [purpose.md](docs/purpose.md), [overview.md](docs/overview.md)
- **Contracts:** [technical-overview.md](docs/technical-overview.md),
  [project-structure.md](docs/project-structure.md),
  [loop-minter.md](docs/loop-minter.md), [path-minter.md](docs/path-minter.md),
  [nutrient-token.md](docs/nutrient-token.md)
- **Frontend:** [frontend.md](docs/frontend.md)
- **Development** (build/test/deploy/CI): [development.md](docs/development.md)
- **Usage** (interacting with the deployed system): [usage-guide.md](docs/usage-guide.md)
- **Terminology:** see [overview.md](docs/overview.md#key-terminology)

## Project status & management

The development of this project is tracked in
[**docs/project-management/**](docs/project-management/):

- [STATUS.md](docs/project-management/STATUS.md) — where things stand right now
- [ROADMAP.md](docs/project-management/ROADMAP.md) — the phased plan and backlog
- [LOG.md](docs/project-management/LOG.md) — the work history
- [README.md](docs/project-management/README.md) — **the process**: how to log progress and
  how to pick up work where it was left off

If you're returning to this project or taking it over, read
[docs/project-management/README.md](docs/project-management/README.md) first and follow its
resume checklist.

## Contributing

- **Code:** follow the workflow (branching, Definition of Done, commit conventions) in
  [docs/project-management/README.md](docs/project-management/README.md).
- **Docs:** follow the organization rules in
  [docs/README.md](docs/README.md#contributing-to-the-docs) so the documentation stays
  navigable.

## Contract addresses

Not yet deployed. Addresses are produced by `scripts/deploy_full.ts` and recorded in
[STATUS.md](docs/project-management/STATUS.md) once a deployment exists.

## License

Not yet specified. ⚠️ Add a `LICENSE` file before any public release — verify the choice
independently.
