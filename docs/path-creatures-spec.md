# Path Creatures — Technical Spec

**Status:** draft for review (interview-derived, 2026-07-01). Human review required before implementation.

> **Superseded in part (2026-07-03)** by `docs/symmetry-challenge-spec.md`: (1) the challenge-burn
> rule is generalized to a witness `(g, k)` covering translation/rotation/reflection copies — the
> sub-path rule below is the special case `g = identity`; (2) the **mint-timestamp direction guard
> (§1.2, §5 rule 2) is replaced by a per-contract mint nonce** (strict `<`; fixes the same-block tie);
> `minted_at` becomes display-only; (3) the `target_loop_id` pre-filter (§5 rule 3) only applies when
> `g = identity`.
**Scope:** a new mintable creature type — *paths* (transients that lead into a loop) — on a **separate NFT contract**, with a burn-based anti-farming mechanism.
**Related:** `docs/partial-paths-mint-ux.md` (loop minting + partial-path tiling), `docs/sierra-gas-metering-discrepancy.md` (on-chain stepping gas), `docs/v2-grid-redesign.md` (GridState).

---

## 1. Concept

A **loop** creature is a state already inside its cycle (identity = the loop's canonical smallest state). A **path** creature is a state that is *not yet* in a loop but deterministically **leads into one**. Stepping a path forward eventually enters a cycle (or dies).

- **Sequence length** = *distance to the loop* = number of generations from the path's start until it first enters the terminal loop. If `start` enters the loop at generation 5, its length is 5. (This is already the `sequence_length` field on `LifeFormData` and the `length_to_loop_entrypoint` arg of `mint_path`.)
- **Life state** (three-way):
  - **alive** — converges to a *dynamic* loop (period > 1).
  - **frozen** — converges to a *still life* (period-1, non-empty).
  - **dead** — converges to the *empty* grid.
- **Value model:** *rarity of the ephemeral.* Longer paths are rarer and more prized — because going **backward** (finding a predecessor state) is hard (reverse search / Garden-of-Eden territory), whereas going **forward** is trivial deterministic stepping.

### 1.1 Identity — `token_id = hash(start state)`

A path's identity is the Poseidon hash of its **start state** (`gol_grid_v2::token_id(path_start)`), exactly as `GolPathMinterV2` already does. Consequences:

- `N` and its predecessor `N-1` are **distinct NFTs** (different start states). Overlapping trajectories coexist.
- Two unrelated branches that happen to reach the same loop are **distinct** creatures.
- The only illegitimate case is a **forward sub-path**: minting `N+k` (a forward iterate of an already-minted, older `N`) creates no new discovery — it's farming. This is handled reactively (§5), not at mint time.

### 1.2 The two directions, and why the timestamp resolves them

| Relationship | Example | Ruling | Why |
|---|---|---|---|
| **Forward sub-path** | `N` exists; someone mints `N+k` | `N+k` is **burnable** | Trivially derived; not a discovery. |
| **Backward super-path** | `N` exists; someone mints `N-1` | `N-1` is a **valid new (rarer) creature**; cannot take `N` | Hard to find; genuinely new. Longer ⇒ rarer. |

The **mint timestamp** is the direction guard: *path A may burn path B iff (A leads to B) **and** (A.minted_at < B.minted_at).*

- Mint `N`, later `N+k` → `N` (older, leads to `N+k`) burns it. ✓ anti-farm.
- Mint `N`, later `N-1` → `N-1` leads to `N` but is **newer**, so it cannot burn `N`. And `N` never reaches `N-1` going forward, so `N` cannot burn `N-1`. They coexist. ✓

**Key invariant — vulnerability is fixed at mint.** A path `B` can only be burned by an *older* path that leads to it; every such path already exists when `B` is minted. No future mint can threaten `B`. (This is why an escrow challenge-window would be sound — though we choose a permanent sink instead, §6.)

---

## 2. What already exists vs. the deltas

The v2 codebase already has most of the minting scaffolding. This feature is mostly **additive deltas**, not a greenfield build.

**Already present**
- `src/gol_path_minter_v2.cairo` — `GolPathMinterV2` with `mint_path`, `mint_partial_path`, `combine_partial_path`, `mint_path_from_partial_paths` (partial-path tiling identical to the loop minter). Verifies `path_start` steps `length_to_loop_entrypoint` into a single loop of `loop_length`, entered from outside.
- `src/interfaces_v2.cairo` — `LifeFormData { is_loop, is_still, is_alive, is_dead, sequence_length, current_state, age }`, `RenderParams`, `IGolPathMinterV2`.
- `src/gol_lifeforms_v2.cairo` — `mint()` (MINTER_ROLE) **already charges `sequence_length` NUT** via `transfer_from(minter → NFT contract)` and accumulates it with **no withdrawal** (a de-facto sink). `set_render_params` / `get_render_params` (appearance). `move_lifeform_forward[_n]`.
- `src/gol_grid_v2.cairo` — `step`, `step_to`, `token_hash`, `token_id`, `pack`/`unpack`, `eq`, `is_empty`.
- `src/gol_utilities_v2.cairo` — `is_single_loop`, `step_to`, `compute_partial_path`, `combine_partial_path`, `PartialPathData`.
- SDK: `crates/gol-sdk/src/{engine.rs, grid.rs, writes.rs}` mirror the above off-chain.

**Deltas this feature introduces**
1. **Separate NFT contract** `GolPathLifeFormsV2` (paths currently mint into the shared `gol_lifeforms_v2`). Repoint `GolPathMinterV2` to it.
2. **Three-way life state** — `mint_path` / `mint_path_from_partial_paths` currently hard-code `is_still: false`. Detect the still-life (frozen) case (`loop_length == 1 && !is_empty(loop_entry)`).
3. **Mint timestamp** — store `minted_at = get_block_timestamp()` per path (the direction guard for §5). `LifeFormData.age` is generation age, not this.
4. **Per-token NUT escrow accounting** — so a burn can pay the challenger the burned path's escrowed NUT. Today NUT is co-mingled in the NFT contract with no per-token record.
5. **Burn / challenge entrypoint** (permissionless, bounty-paying) — §5.
6. **Higher tiling ceiling for paths** — `MAX_TX_PATH` (e.g. 16) vs loops' 8, since long transients are the point.
7. **`target_loop_id`** stored as a trait (canonical id of the loop/still/empty the path settles into) — lineage + fast challenge pre-filter.
8. **SDK + frontend** surface for path discovery, minting, and challenging.

---

## 3. Architecture

```
                        approve(sequence_length NUT)
   user ──────────────────────────────────────────────► GolNutrientToken (ERC20, faucet)
     │
     │ mint_path / partial-path sequence
     ▼
  GolPathMinterV2 ──(MINTER_ROLE mint)──► GolPathLifeFormsV2 (NEW, ERC721)
     │  verifies start→loop, classifies             │  stores PathFormData + minted_at + escrow
     │  life-state, computes target_loop_id         │  charges+escrows sequence_length NUT
     │                                               │  challenge_burn(...)  ← permissionless
     └───────────────── partial_path_registry (per-caller, tiling)
```

- **`GolPathLifeFormsV2`** — a distinct ERC-721. Same shape/role as `GolLifeFormsV2` (MINTER_ROLE, NUT charge on mint, render params, `move_*`), plus: `minted_at`, `target_loop_id`, per-token `escrow`, and `challenge_burn`. Loops stay on `GolLifeFormsV2`; paths live here.
- **`GolPathMinterV2`** — mostly as-is; constructor repointed to the path NFT; life-state + `target_loop_id` + timestamp threaded through; tiling ceiling raised.
- **`GolNutrientToken`** — unchanged. NUT is a faucet (earned by feeding loops forward); paths *spend* it.

Token-id namespaces don't collide meaningfully: a path's `token_id = hash(path_start)` and a path start is by definition **not** in a loop, so it can never equal a loop's canonical id — and they're separate ERC-721s regardless.

---

## 4. Data model

New per-token record on `GolPathLifeFormsV2` (extends the existing `LifeFormData` idea):

```cairo
struct PathFormData {
    life_state: LifeState,        // Alive | Frozen | Dead  (enum; replaces the 3 bools)
    sequence_length: usize,       // distance to loop (>=1)
    start_state: GridState,       // the path's start (identity preimage)
    target_loop_id: felt252,      // token_hash of the terminal: loop canonical / still state / 0 for empty
    target_period: usize,         // loop_length (1 for frozen; 0 for dead)
    minted_at: u64,               // get_block_timestamp() — the direction guard
    escrow: u256,                 // sequence_length * 1e18 NUT held for this token (bounty on burn)
}
// Paths are static snapshots — NOT feedable, no `age`, earn no NUT (§9).
```

- `token_id = gol_grid_v2::token_id(start_state)`.
- Render params reuse the existing `RenderParams` + `set_render_params` mechanism (appearance editable by owner, same as loops).
- `LifeState` as an enum is cleaner than four bools; keep a compat view if the SDK/metadata expects the bool shape.

---

## 5. Anti-farming: the challenge-burn mechanism

**Rule.** Path `A` may burn path `B` iff:
1. `A` and `B` are both minted paths on this contract,
2. `A.minted_at < B.minted_at` (older),
3. `A.target_loop_id == B.target_loop_id` (same terminal — cheap pre-filter),
4. `A.sequence_length > B.sequence_length`, and
5. stepping `A.start_state` forward `k = A.sequence_length − B.sequence_length` generations yields `B.start_state`.

On success: **burn `B`** (ERC-721 `_burn`) and **transfer `B.escrow` NUT to the challenger** (`get_caller_address()`). Permissionless.

### 5.1 Proving (5) — reuse partial-path tiling

Condition (5) is `step^k(A.start) == B.start`, which is `k` on-chain steps — the same Sierra-gas cost curve as minting (see the gas doc). For large `k`, the challenger tiles it exactly like a mint:

- The challenger builds a partial path from `A.start_state` with trigger `B.start_state` via the existing `mint_partial_path` / `combine_partial_path` registry (namespaced per caller), then calls `challenge_burn(a_id, b_id)`.
- `challenge_burn` reads the caller's assembled partial path keyed by `hash(A.start)`, asserts its `exitpoint == B.start_state` and its `length == k`, then applies rules 1–4 and burns.
- Short `k` can be verified inline in `challenge_burn` (step `k` times directly) without the registry — the contract picks the inline path when `k` is under a single-tx budget.

### 5.2 Why it's safe (adversarial analysis)

- **Can't burn a legit standalone path.** Burning `B` requires an actual older `A` that steps to `B`. If none was minted before `B`, `B` is permanently safe (the vulnerability-fixed-at-mint invariant, §1.2).
- **No griefing via fake claims.** Rule (5) is a hard on-chain computation; you can't fake a trajectory.
- **Self-farming the bounty is a loss.** `A`'s owner minting `B` then self-challenging pays `B.length` NUT escrow and recovers it minus gas ⇒ net negative. No exploit.
- **Bounty is proportional.** `B` (a sub-path) has `B.length < A.length`, so its escrow (`B.length` NUT) is the bounty — small paths yield small bounties, which is fine.
- **Timestamp direction guard** prevents a late predecessor from claiming an established path (rule 2).

---

## 6. Economic model

- **Mint cost = `sequence_length` NUT**, escrowed per-token at mint (`escrow = sequence_length * 1e18`). This is already what `GolLifeFormsV2.mint` charges; the delta is per-token accounting on the path contract.
- **Escrow is a permanent sink** for unchallenged paths (never released). NUT is faucet-minted (earned by feeding loops), so no user principal is trapped; the sink is a mild deflationary counter to the faucet.
- **Bounty = the burned path's escrow**, paid to the challenger. Farmers literally fund their own cleanup.
- NUT flow overall: **faucet** (feed loops, +1/gen) → **spent** on path mints (escrowed) → **sunk** (unchallenged) or **redistributed** to challengers (burned).

---

## 7. Minting flow

Two paths (pun intended), mirroring loop minting:

1. **Single-shot** `mint_path(path_start, length_to_loop_entrypoint, loop_length, recipient)` — for short transients. Verification (already implemented, extend for life-state + timestamp + escrow accounting):
   - `length_to_loop_entrypoint > 0` (a length-0 "path" is a loop; reject).
   - `step_to(path_start, length)` → `(path_prev, loop_entry)`.
   - `is_single_loop(loop_entry, loop_length)` → `(is_loop, smallest, loop_prev)`; assert `is_loop`.
   - assert `loop_prev != path_prev` (enters from **outside**, else start is already in the loop).
   - **classify:** `empty = is_empty(loop_entry)`; `frozen = (loop_length == 1 && !empty)`; `alive = (loop_length > 1)`; `dead = empty`.
   - `target_loop_id = token_hash(smallest)` (or `0` for dead); `target_period = loop_length` (0 for dead).
   - `minted_at = get_block_timestamp()`; escrow `sequence_length` NUT.
   - `mint(recipient, caller, token_id(path_start), PathFormData{...})`.

2. **Partial-path tiled** `mint_partial_path` / `combine_partial_path` / `mint_path_from_partial_paths` — for long transients, up to `MAX_TX_PATH` (≈16) transactions. Already implemented; extend the final step for the same classification/timestamp/escrow.

**Gas:** every step of verification is Sierra-gas-metered; per-wallet caps (`gasCaps.ts`) and the ≤`MAX_TX_PATH` tiling apply. A legacy-metered wallet verifies far fewer steps per tx than a modern (Sierra ≥ 1.7.0) one — see the gas doc. The frontend should size path-mint chunks from the connected account's tier, exactly as loop minting now does.

---

## 8. SDK & frontend surface

**SDK (`gol-sdk` + `gol-sdk-wasm`)**
- Reads: `pathLifeform(token_id)`, `ownedPaths(address)`, `recentPaths(limit)` (mirror the loop readers against the new contract).
- Classify off-chain: extend `engine` to return `(life_state, sequence_length, target_loop_id, target_period)` for a given start (it already finds loops/steps).
- `planPathMint(start, length, loop_length, recipient, chunk, single_shot_max, max_tx)` — mirror `plan_loop_mint`, with `MAX_TX_PATH`.
- `planChallengeBurn(a_start, b_start)` — tile the `A→B` proof and emit the `challenge_burn` call sequence.

**Frontend (`ui/game-of-life`)**
- `/create`: when a drawing's fate is a *path* (settles but the start isn't in the loop), offer "spawn as path" with its length + life-state + NUT cost, reusing the per-wallet cap sizing and multi-tx UX.
- `/life/[id]` (path variant, on the new contract): show **distance to loop** (sequence length), **life state** (alive/frozen/dead), **target loop** (link to the loop if it's minted), editable appearance.
- `/incubator`: paths appear alongside loops (bookmarks + in-progress); the NUT-affordability gate and already-minted detection added this session apply unchanged.
- **Challenge UX (optional, later):** a way to flag/burn a sub-path and claim the bounty — could be a "clean up" affordance surfaced when the SDK detects a mintee is a sub-path of an existing older path.

---

## 9. Resolved decisions (were open)

- **Paths are NOT feedable — RESOLVED (2026-07-01).** Paths are **static snapshots**: no `move_lifeform_forward[_n]` on the path contract, no `age`, and paths earn **no** NUT. The faucet stays loop-only. Feeding would shrink a path's length and change what it is, so it's disallowed. (Removes the `age` field from `PathFormData`.)
- **`MAX_TX_PATH` = 16 — RESOLVED.** Double the loop ceiling (paths are the rare, long finds). Re-validate against *measured* gas before mainnet (not `estimateFee`; see gas doc). Frontend still sizes chunks per-wallet by Sierra tier.
- **Challenge tiling storage — RESOLVED: reuse the per-caller `partial_path_registry`.** A challenge builds a partial path keyed by `hash(A.start)` with trigger `B.start`. Collision risk is negligible (A is *already minted*, so its start isn't being freshly minted by the same caller), and `challenge_burn` **clears the entry after use**. No separate registry.
- **Bounty floor — RESOLVED: none.** Bounty = the burned path's escrow (`B.length` NUT). No minimum-length or minimum-bounty floor: the escrow=length cost is itself the anti-dust (spamming sub-paths costs NUT), and a lesser sub-path never dilutes the longer path's rarity. Tiny sub-paths may persist unchallenged — acceptable. Keep only the existing `length ≥ 1` requirement (length 0 = a loop, minted elsewhere).
- **Metadata — RESOLVED: path-aware traits required.** Extend metadata (a path branch in `gol_metadata_v2`, or a `gol_path_metadata_v2`) to expose **distance-to-loop** (sequence_length), **life-state** (alive/frozen/dead), and **target loop** in the token URI / SVG traits.

## 10. Implementation checklist

- [ ] `src/gol_path_lifeforms_v2.cairo` — new ERC-721: `PathFormData` storage, MINTER_ROLE `mint` (charge + per-token `escrow`, `minted_at`), `get_path_data`, `set_render_params`/`get_render_params`, `challenge_burn`, `_burn` + escrow payout. Optionally `move_*` (see §9).
- [ ] `src/interfaces_v2.cairo` — `LifeState` enum, `PathFormData`, `IGolPathLifeFormsV2` (incl. `challenge_burn`), extend `IGolPathMinterV2` if needed.
- [ ] `src/gol_path_minter_v2.cairo` — repoint constructor to the path NFT; three-way life-state classification; compute + pass `target_loop_id`/`target_period`; keep tiling, raise ceiling.
- [ ] `tests/` — sub-path burn (older→newer) succeeds + pays bounty; newer predecessor cannot burn older; standalone path unburnable; frozen/dead classification; tiled mint + tiled challenge; escrow accounting; self-challenge is net-negative.
- [ ] SDK: path readers, classifier, `planPathMint`, `planChallengeBurn`; WASM bindings.
- [ ] Frontend: `/create` path spawn, `/life` path view, `/incubator` integration; per-wallet cap sizing reused.
- [ ] Deploy the new contract to Sepolia; record address + class hash (see `gol-v2-deployment` memory).
```
