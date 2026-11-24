# Contributing

## Set up

Install the tool versions this repository pins, then turn on the commit hook once per clone:

- Scarb and Starknet Foundry: `.tool-versions`
- Rust: `rust-toolchain.toml` (rustup installs it on first use)
- Node: `ui/game-of-life/.nvmrc`

```sh
git config core.hooksPath .githooks
```

## Check your change

```sh
./scripts/check.sh          # format, lint, build, web lint and type check, then tests
./scripts/check.sh --fast   # the same without tests; this is what the commit hook runs
```

CI runs `./scripts/check.sh` on every pull request. A change is ready when it passes.

`scripts/check.sh` is the one place the checks are defined. The Cairo linter and Clippy run
through `scripts/ratchet.py`: the findings the code already had are recorded in `.ratchet/`, a new
finding fails the check, and fixing an old one means shrinking the record (the failure message
gives the command). The record only gets smaller.

## Where things go

- Cairo contracts: `src/`, with suites in `tests/`
- Rust SDK: `crates/gol-sdk` and `crates/gol-sdk-wasm`
- Web app: `ui/game-of-life`
- Experiments that are not part of the product: `spike/`

## Pull requests

Keep each pull request to one purpose. Say what changed, why, and which checks you ran.
Follow the documentation rules in `AGENTS.md`: a change is not done until the log and status
pages reflect it.
