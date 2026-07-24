# Documentation

This directory is the home for all project documentation. Start here to find
what you need, and read the [conventions](#contributing-to-the-docs) before
adding or editing anything.

## How the docs are organized

Docs are grouped by what you're trying to do. One topic per file.

| Category | Files | Read it when you want to… |
|----------|-------|---------------------------|
| **Concept** | [purpose.md](purpose.md), [overview.md](overview.md) | Understand the vision: digital bacteria that live forever on-chain |
| **Design** | [design-brief.md](design-brief.md) | Brief for the website design overhaul: why petting exists, how it feels, and the full scope of what users do |
| **Contracts** | [technical-overview.md](technical-overview.md), [project-structure.md](project-structure.md), [loop-minter.md](loop-minter.md), [path-minter.md](path-minter.md), [nutrient-token.md](nutrient-token.md) | Understand the Cairo smart contracts and how they fit together |
| **v2 & mechanisms** | [v2-grid-redesign.md](v2-grid-redesign.md), [v2-deployment.md](v2-deployment.md), [path-creatures-spec.md](path-creatures-spec.md), [symmetry-challenge-spec.md](symmetry-challenge-spec.md), [partial-paths-mint-ux.md](partial-paths-mint-ux.md), [sierra-gas-metering-discrepancy.md](sierra-gas-metering-discrepancy.md) | Understand the 41×41 v2 system, its deployments, burn mechanisms, and gas realities |
| **v3 (live)** | [v3-identity-spec.md](v3-identity-spec.md), [v3-deployment.md](v3-deployment.md) | The orbit-canonical identity model: one id system, copies prevented at mint — live on Sepolia |
| **Product ideas** | [leaderboards.md](leaderboards.md), [audience-research.md](audience-research.md), [pet-mechanism-spec.md](pet-mechanism-spec.md), [copy-review.md](copy-review.md) | Leaderboard catalogue, audience research, pet-bond spec, and the website copy review |
| **Frontend** | [frontend.md](frontend.md) | Understand or extend the Next.js web app and its Starknet integration |
| **Integration** | [nft-metadata-rendering.md](nft-metadata-rendering.md) | Display a lifeform from a third-party surface (wallet, explorer, marketplace) — how to read the on-chain metadata and render the static image and untrusted HTML animation safely |
| **Development** | [development.md](development.md) | Build, test, deploy, run CI, bump dependencies |
| **Usage** | [usage-guide.md](usage-guide.md) | Learn how an end user interacts with the deployed system |
| **Project management** | [project-management/](project-management/) | See what's done, what's left, and how work is tracked |

### Quick navigation

- **"How do I run the tests / build?"** → [development.md](development.md)
- **"How does the web app talk to the chain?"** → [frontend.md](frontend.md)
- **"How do I safely display a lifeform in my own wallet/app?"** → [nft-metadata-rendering.md](nft-metadata-rendering.md)
- **"What's the state of the project / what should I work on next?"** → [project-management/STATUS.md](project-management/STATUS.md) and [project-management/ROADMAP.md](project-management/ROADMAP.md)
- **"How do I pick up where the last person left off?"** → [project-management/README.md](project-management/README.md)
- **"What do these terms (loop, path, sequence) mean?"** → [overview.md](overview.md#key-terminology)

## Contributing to the docs

These rules keep the documentation navigable. Follow them when you add or change docs.

1. **One topic per file.** If a file is growing two distinct subjects, split it.
2. **Pick the right home.** New docs go in the category that matches the table above.
   Concept/contract/frontend/dev/usage live in `docs/`; anything about *running the
   project* (status, plan, history) lives in `docs/project-management/`.
3. **File names are kebab-case** and describe the topic (`path-minter.md`, not `paths2.md`).
4. **Update this index.** When you add a doc, add a row to the table above (or the
   relevant project-management index). A doc that isn't linked here effectively
   doesn't exist.
5. **Cross-link with relative links** (`[loop minter](loop-minter.md)`), not absolute paths.
6. **Reference code as `path:line`** (e.g. `src/gol_utilities.cairo:95`) so it's clickable
   and traceable. The code is the source of truth; docs explain *intent and shape*, not
   every line.
7. **Keep docs in sync with code.** If you change behavior, update the doc in the same PR.
   The "which doc to touch" map lives in [development.md](development.md#keeping-docs-in-sync).
8. **Don't duplicate — link.** If two docs need the same explanation, write it once and
   link to it.
9. **Mark uncertainty.** If something is provisional or unverified, say so inline
   (e.g. "⚠️ not yet verified against a live deployment") rather than implying it's done.

If you're documenting a *decision* or *progress* rather than how something works, that
belongs in the project-management log — see [project-management/README.md](project-management/README.md).
