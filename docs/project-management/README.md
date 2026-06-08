# Project management

This directory is how we run the development of the project: what's done, what's next, and a
written trail so anyone (including a future you, or an AI agent) can pick up the work without
guesswork. **Read this file before starting work.**

## The three artifacts

| File | What it is | Update cadence |
|------|------------|----------------|
| [ROADMAP.md](ROADMAP.md) | The plan — phases and the backlog of known work | When scope/priorities change |
| [STATUS.md](STATUS.md) | A snapshot of *right now* — done / in progress / blocked | Every work session |
| [LOG.md](LOG.md) | Append-only history — one entry per work session | Every work session (append, never rewrite) |

Rule of thumb: **ROADMAP is the future, STATUS is the present, LOG is the past.** If you're
unsure where something goes — a forward-looking decision is ROADMAP, "where things stand" is
STATUS, "what I did and why" is LOG.

## The phase model

Work is organized into phases (detail in [ROADMAP.md](ROADMAP.md)):

- **Phase 0** — modernize: unblock build, current toolchain, green tests, CI.
- **Phase 1** — one frontend wired to the chain (wallet, mint, evolve, reads).
- **Phase 2** — on-chain `tokenURI` so NFTs render.
- **Phase 3** — redesign the token economy + security review.
- **Phase 4** — indexer/gallery, testnet → mainnet.

Phases are sequential but not rigid; the backlog in ROADMAP holds cross-cutting items.

## Starting a work session — the resume checklist

Do this every time you pick up the project:

1. Read **[STATUS.md](STATUS.md)** (where things stand) and the **top entry of [LOG.md](LOG.md)**
   (what happened last and what was planned next).
2. Skim **[ROADMAP.md](ROADMAP.md)** for the current phase and backlog.
3. Orient in git:
   ```bash
   git status            # clean? on which branch?
   git log --oneline -10 # recent work
   git branch            # is there an in-flight feature branch?
   ```
4. Verify the baseline still builds before changing anything:
   ```bash
   scarb build && snforge test
   (cd ui/game-of-life && npm install && npm run build)
   ```
5. Pick the next item from STATUS ("next up") or ROADMAP, and start.

## Doing the work

- **Branch, don't commit to `main`.** Name branches `kind/short-topic`
  (`feat/onchain-svg`, `fix/loop-detection`, `chore/bump-oz`).
- **Definition of Done** for any unit of work:
  - contracts build (`scarb build`) and tests pass (`snforge test`);
  - the frontend builds (`npm run build`) if you touched it;
  - docs updated in the same change (see the sync map in
    [development.md](../development.md#keeping-docs-in-sync));
  - STATUS + LOG updated (below).
- **Commits:** imperative subject line; body explains *why*, not just what; end with the
  co-author trailer the repo uses:
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```
- **Verification is part of the work.** State what you actually ran. If something is only
  build-verified and not runtime-verified, say so in STATUS and LOG — don't imply more.

## Ending a work session — before you stop

1. **Append a LOG entry** (newest at the top) using the template in [LOG.md](LOG.md).
2. **Update [STATUS.md](STATUS.md):** move finished items to Done, refresh "in progress",
   update "blocked", and set a clear **Next up**.
3. **Update [ROADMAP.md](ROADMAP.md)** only if scope or priorities changed (check off
   completed phase items; add newly-discovered backlog items).
4. Leave the tree in a known state: everything committed, or clearly noted as WIP in the LOG.

## Recording decisions and blockers

- **Decisions** (e.g. "chose OZ 3.0 stable over the v4 RC because the registry only publishes
  3.0") go in the LOG entry for that session, and the *consequence* goes in STATUS/ROADMAP.
- **Blocked work** goes in STATUS under "Blocked", with **who/what unblocks it**. Example:
  the Sepolia deploy is blocked on the maintainer's funded account — an agent cannot do it.

## Keeping it navigable

This is documentation too — follow the doc conventions in [../README.md](../README.md#contributing-to-the-docs).
Don't let STATUS and LOG drift: STATUS is rewritten to stay short and current; LOG only grows.
