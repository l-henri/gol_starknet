# GoL SDK — decisions log

> One entry per architectural choice that excludes a meaningful alternative — not micro-decisions.
> Format borrowed from the sibling SNIP-36 project (`../strip-account/project/decisions.md`):
> date · one-line title · **Decision** · **Alternatives considered** (named, with why-not) ·
> **Reason** (incl. second-order consequences). Append-only once committed; supersede with a new
> dated entry rather than editing history. The spec these implement is [sdk-plan.md](sdk-plan.md).

---

## 2026-06-17 — The SDK is written in Rust, not TypeScript (one SDK for web + a future TUI)

**Decision:** Build the SDK as a **Rust** crate (`crates/gol-sdk`) on starknet-rs. The web frontend
consumes it compiled to **WASM** (via a thin `gol-sdk-wasm` / `wasm-pack` npm package); a native
**TUI** later consumes the same crate directly.

**Alternatives considered:** (1) a TypeScript SDK — easiest for the web app (native starknet.js +
`get-starknet`, no WASM, no signing shim), but it *cannot* reasonably feed a Rust TUI (you'd embed
a JS runtime), so a TUI would mean a second SDK; (2) two SDKs (TS for web, Rust for TUI) — no shared
logic, double the maintenance and the chance of drift; (3) Rust core + WASM (chosen).

**Reason:** The product may grow a TUI, and a single Rust crate serves *both* the web app (WASM) and
a native TUI from one codebase — the only single-SDK option, since the reverse (a Rust TUI on a TS
SDK) has no paved path. The sibling `../hexposed-sdk` is a working Rust precedent for the exact
Reader/Submitter/Prover seams. **Consequences we accept:** (a) the web frontend keeps a thin JS
layer for wallet signing — browser wallets (`get-starknet`) are reachable only from JS, so the WASM
build does reads + call-building + proofs and the *signature* happens in JS; (b) the frontend build
gains a `wasm-pack` step; (c) WASM friction (fetch transport, `wasm-bindgen-futures`, felt/U256
marshaling). The chain logic — the part worth sharing with the TUI — is fully in Rust.

---

## 2026-06-17 — Cargo workspace crate; web via a wasm-pack npm package

**Decision:** Ship the core as a Cargo workspace member `crates/gol-sdk`, with `crates/gol-sdk-wasm`
producing the npm package the Next.js app imports. Cargo coexists with `Scarb.toml` (Cairo).

**Alternatives considered:** (1) a standalone repo for the SDK — clean boundary, but splits the ABI
source (the Cairo `target/dev` artifacts) from the SDK and complicates codegen sync; (2) publish to
crates.io / npm from day one — premature; `file:`/workspace links suffice until there's an external
consumer.

**Reason:** Keeping the crate in this repo means cainome codegen reads `target/dev/*.contract_class.json`
directly and CI can fail on ABI drift. A separate wasm wrapper crate keeps the WASM-only concerns
(wasm-bindgen, fetch transport) out of the core and lets the TUI link the core natively.

---

## 2026-06-17 — starknet-rs as the Starknet library, pinned to a protocol-aligned version

**Decision:** Use starknet-rs (`starknet`, `starknet-types-core` for `Felt`), pinned to a version
that targets the current protocol; Cargo resolves the version.

**Alternatives considered:** (1) hand-roll RPC + signing — the sibling did partial hand-rolling for
privacy, but GoL has no such constraint and starknet-rs covers provider/account/signers; (2) the
older `starknet-rs` API surface — avoid; track the maintained line.

**Reason:** starknet-rs is the maintained Rust SDK with provider, accounts, signers, and the type
core. **Lesson carried from the declare saga (generalized):** the class / compiled-class hash
algorithm must match the network's protocol version — the TS frontend's pinned starknet.js v7.6.4
computed the wrong hashes (STATUS.md). The Rust analog is to pin a starknet-rs version aligned with
the deployed protocol and verify the hashes it produces against the network.

---

## 2026-06-17 — Three dependency-injected trait seams: Reader / Submitter / Prover

**Decision:** Compose the client over three swappable traits — `Reader` (incl. a `DataSource` for
ownership), `Submitter` (sign + broadcast), `Prover` (proving) — as `Box<dyn _>`, matching the
sibling's `Reader`/`Submitter`/`Prover`.

**Alternatives considered:** (1) a monolithic client with reads + a baked submit path + hardcoded
prover — fewer concepts, but every backend swap (indexer, strkd, local key, paymaster, hosted
prover) becomes a client rewrite; (2) generics `Client<P,S,R>` like the sibling — zero-cost but
verbose and awkward across the WASM boundary.

**Reason:** The sibling proved this exact decomposition: its frontend runs remote prover + RPC
reader, its backend local prover + indexer reader, no client rewrite. `Box<dyn _>` keeps the WASM
boundary clean and lets consumers swap impls at runtime. Elevating **submission** to a seam is what
lets web (JS wallet), native (strkd / local key), and a future paymaster all coexist. Consequence:
the SNIP-36 verify submission folds into the normal submit path (`SubmitOpts.proof`).

---

## 2026-06-17 — Web signing stays in JS; the WASM SDK builds calls but does not sign

**Decision:** On the web (WASM), the SDK exposes reads + call-building + proofs; the JS frontend
signs and broadcasts via the injected wallet (`get-starknet` → `account.execute(calls)`). No Rust
`Submitter` runs in the browser.

**Alternatives considered:** (1) marshal a JS-callback signer into Rust (a `Submitter` that calls
back into JS via `js_sys::Function`) — possible, but adds a fragile boundary for no benefit, since
the wallet UX already lives in JS; (2) hold a key in WASM — forbidden by policy and pointless for a
browser wallet flow.

**Reason:** Browser wallets are JS-only; the cleanest split is "Rust builds the calls, JS signs
them." This keeps the WASM surface small (no signer marshaling) and the key in the wallet. The
native TUI uses `LocalKeySubmitter`/`StrkdSubmitter` and needs no JS — so the same call-builders
feed both, and only the *submission* differs per consumer.

---

## 2026-06-17 — Writes are call-builders returning `Call`s; submission is a separate seam

**Decision:** Each write method builds and returns composable `Call`(s) (mint flows return
`[approve, mint]`). Nothing is signed/sent until a `Submitter` takes them.

**Alternatives considered:** (1) execute directly inside the write method — simplest call site, but
hides the calls, blocks multicall composition, and can't sign externally; (2) two parallel layers
(`build_*` + `*_and_wait`) — more surface than needed.

**Reason:** Returning `Call`s composes (multicall, paymaster) and is what makes the JS-signs-on-web
split work — the WASM binding just hands the calls to the wallet. The native submitters cover the
"just send it" case.

---

## 2026-06-17 — Types generated from the ABI via cainome, with fixture-tested domain decoders

**Decision:** Generate Rust call/return bindings from the compiled ABIs with **cainome** (a
`build.rs` step). Layer thin, **fixture-tested** decoders for the domain structs (`LifeformData`,
`MoveMessage`).

**Alternatives considered:** (1) hand-write selectors + decoders, as `../hexposed-sdk` does —
justified there by a small, stable, privacy-sensitive interface, but GoL's surface (ERC721 + ERC20 +
AccessControl + engine views) would rot under manual sync; (2) cainome-only with no domain layer —
loses ergonomic shapes and the explicit, testable decode step.

**Reason:** cainome is the Rust analog of abi-wan-kanabi and makes an un-synced contract change a
compile error. The sibling's lesson — explicit, versioned decoders surface layout changes as failing
tests, not silent misreads — is worth keeping for the structs that matter.

---

## 2026-06-17 — Reads go through a pluggable DataSource (event-scan now, indexer later)

**Decision:** Define a `DataSource` trait; ship an `EventScanDataSource` now and drop in an
`IndexerDataSource` for Phase 4 with no API change.

**Alternatives considered:** (1) event-scan only, hardcoded — simplest now, forces an API change
when the indexer lands; (2) require an indexer from the start — cleanest API but blocks on building
the indexer first.

**Reason:** Matches the roadmap's Phase 4 indexer without an API break; the sibling already ships
both an RPC reader and a Starkscan/indexer-backed reader behind one trait. The event-scan impl also
fixes a real bug: track the ERC721 `Transfer` event (authoritative ownership), not just
`NewLifeForm` (mint only), which misses transfers.

---

## 2026-06-17 — Off-chain GoL pattern discovery stays in the app; SDK exposes only on-chain views

**Decision:** The SDK does not bundle a Rust reimplementation of the simulation / loop-path
discovery (today's `gameOfLife.ts`). It exposes the contract's on-chain engine *view* functions
(`iterate_*`, `is_single_loop_*`, `compute/combine_partial_path`, pack/unpack) as typed reads.

**Alternatives considered:** (1) port discovery into the SDK core — reusable across consumers, but a
sizable pure-logic surface everyone would carry; (2) a separate engine module — still SDK-maintained
surface.

**Reason:** The contract is the source of truth for stepping; the SDK exposes those views so a
consumer can validate a candidate id on-chain before paying to mint. The off-chain *search* is an
app concern and evolves independently.

---

## 2026-06-17 — Multi-network address book shipped in the SDK, with a caller override

**Decision:** Ship known deployments keyed by `Network` (Sepolia now, Mainnet when live); callers
pass a network or override addresses/RPC for local/custom deploys.

**Alternatives considered:** (1) caller passes everything, no baked addresses — most flexible,
matches `../hexposed-sdk`, but duplicates addresses per consumer; (2) keep today's env-driven
single-network model — weak for the imminent mainnet.

**Reason:** The sibling ships *no* address book because its contracts are per-round and redeployed
(a factory tracks the current round). GoL's deployments are stable singletons per network, so baking
the book is a net convenience, and the override preserves the custom-deploy path.

---

## 2026-06-17 — SNIP-36 included as a `Prover` CLIENT only; SDK never runs the prover

**Decision:** Include the move-forward-N flow as a transport-agnostic `Prover` trait plus an
`HttpProofProvider` matching the SNIP-36 server contract; the SDK orchestrates (build virtual tx →
prove → verify) but never runs a prover. Experimental, gated.

**Alternatives considered:** (1) basic actions only, defer proving — smallest, but drops the
project's headline capability; (2) full server-side prove orchestration in the SDK — heaviest, and
the prover needs ~18 GB RAM + native binaries (impossible in WASM anyway); (3) hardcode the local
`dinner` companion — fastest now but ties the SDK to one tool.

**Reason:** A `Prover` trait lets `dinner`, the reference server, or a future hosted prover plug in,
while signing stays external and the heavy prover stays out of process — the local-vs-remote split
the sibling uses. **Dependency:** `prove_move_forward_n`/`verify_move_forward` exist only on the
benchmark `GolBench`, not production `GolLifeforms`; product-ready only once the NFT gains an
equivalent verify entrypoint. The flow must assert `facts[8]` equals the recomputed message hash
*before* paying gas (fail-fast), per the sibling's defensive pattern.

---

## 2026-06-17 — One `GolError` enum with a handful of categories (thiserror)

**Decision:** A single `GolError` with variants `Config | Input | Encoding | Read | Submission |
Proving`, via `thiserror`. SNIP-36 server reasons live in the `Proving` string.

**Alternatives considered:** (1) many fine-grained error types — discoverable but proliferates;
(2) surface raw provider/prover errors — leaks transport details, nothing stable to match on.

**Reason:** Mirrors the sibling's 5-variant `SdkError`: callers match a category, not dozens of
codes. Consequence: reads that simply "miss" return `Ok(None)` (e.g. an unminted token), reserving
errors for genuine faults.
