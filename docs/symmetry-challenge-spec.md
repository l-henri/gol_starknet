# Symmetry-Copy Challenge-Burn — Technical Spec

> **Superseded in part (2026-07-06)** by `docs/v3-identity-spec.md`: v3 makes the symmetry-orbit
> canonical the token id, so **symmetry copies can no longer mint** and the loop-side challenge of
> this spec is not carried into v3. This mechanism remains **live on the v2 contracts** (deployed
> 2026-07-06), and its witness machinery (`apply_symmetry`, `(g, k)` proofs, mint nonce) is the
> foundation v3 builds on. The **path sub-path challenge survives unchanged** in v3 (the time
> direction can't be collapsed into an id).

**Status:** implemented & live on v2 Sepolia (2026-07-06); originally interview-derived 2026-07-03.
**Scope:** extend the challenge-burn mechanism so that translation / rotation / reflection copies of an
older creature are permissionlessly burnable — on **both** collections: loops (`GolLifeformsV2`) and
paths (`GolPathLifeformsV2`).
**Related:** `docs/path-creatures-spec.md` (the sub-path challenge this generalizes),
`docs/v2-grid-redesign.md` (GridState, bit convention §4.2, canonicalization §5).

---

## 1. Concept

Conway's Game of Life **commutes with the symmetries of the torus**: for any grid symmetry `g`,
`step(g(s)) = g(step(s))`. So if a creature exists, every transformed copy of it — same pattern,
shifted / rotated / mirrored — evolves identically. Discovering one member of a symmetry class means
you have discovered them all; minting a second member creates **no new art**.

**The symmetry class is the creature.** A copy is burnable the same way a forward sub-path is:
trivially derived, not a discovery.

### 1.1 The group

On the 41×41 square torus the symmetry group is the semidirect product of:

- **Translations**: `(dr, dc) ∈ [0,41)²` — 1,681 elements, `(r,c) → ((r+dr) mod 41, (c+dc) mod 41)`.
- **The dihedral group D4**: 8 elements — identity, rotations 90/180/270° (90° valid because the
  torus is square), horizontal / vertical mirror, and the two diagonal reflections.

Every symmetry decomposes as `g = translate(dr,dc) ∘ d4[i]` (dihedral first, then translate), so a
group element is encoded as the triple **`(d4: u8 ∈ [0,8), dr: u8, dc: u8)`** — 13,448 elements total.
Coordinate convention follows §4.2 of the v2 spec (row 0 = top, bit 0 = leftmost); the reference
`rot90` is clockwise: `(r,c) → (c, 40−r)`. **The exact d4 index table is consensus-critical** and must
match byte-for-byte between the contract, the SDK, and any indexer — single source of truth in
`gol_grid_v2`, with a round-trip test.

### 1.2 The unified burn rule

This subsumes the existing sub-path rule (`path-creatures-spec.md` §5) as the special case
`g = identity, k > 0`:

> Creature `A` may burn creature `B` (same collection) iff:
> 1. `A.mint_nonce < B.mint_nonce` (strictly older — see §3), and
> 2. the challenger exhibits a **witness** `(g, k)` with `k ≥ 0` such that
>    `token_id( g( step^k(state_A) ) ) == B.token_id`
>
> where `state_A` is A's identity preimage — the **start state** for paths, the **canonical (lex-min)
> state** for loops.

Case analysis:

| Witness | Paths | Loops |
|---|---|---|
| `g = id, k > 0` | existing sub-path burn (unchanged) | impossible — `step^k(canonical)` is a phase of the same cycle, same canonical, same token id: B could never have been minted |
| `g ≠ id, k = 0` | pure symmetry copy | phase-0 symmetry copy |
| `g ≠ id, k > 0` | stepped symmetry copy (would evade both single checks) | **phase witness**: B's canonical is `g` applied to *some phase* of A's cycle (lex-min does not commute with `g`), so `k ∈ [0, period)` selects the phase |

Verification compares **token-id hashes**, not stored states — the contract never needs B's grid on
hand, and A's preimage is supplied by the challenger and checked against A's token id (see §4).

Cheap pre-filter asserts (symmetry preserves both period and distance-to-loop):
- Loops: `A.sequence_length == B.sequence_length` (equal periods), `k < period`.
- Paths: `B.sequence_length == A.sequence_length − k` and `k < A.sequence_length`.
- The `target_loop_id` pre-filter from the sub-path rule **does not apply** when `g ≠ id`
  (B's terminal loop is the transformed one, a different id). It remains valid for `g = id`.

### 1.3 What stays legitimate

- **Backward super-paths of copies**: minting a predecessor of `g(A)` is exactly as hard as finding a
  predecessor of `A` — a genuine discovery. The rule cannot touch it: no older creature steps to it.
- **Self-symmetric creatures**: if `g(A) = A` for some `g`, the copy has the same token id and can
  never be minted twice. No special case needed.
- **Independent honest rediscovery** of a translated version of an existing creature **is burnable** —
  decided (2026-07-03): strict rule, **no same-owner or diptych exemption**. One symmetry class, one
  token. A mirrored *display* is a render preference; if wanted, offer flip/rotate as future
  `RenderParams` fields instead of a second NFT. (A same-owner exemption would also make a farmer's
  copies safe until sold.)

---

## 2. Decisions locked (interview, 2026-07-03)

| Area | Decision |
|---|---|
| Spec home | This file (new technical spec; path spec cross-referenced, not duplicated) |
| Loops machinery | **In-place upgrade** of `GolLifeformsV2` (it is Upgradeable): new storage maps + `challenge_burn` entrypoint; existing `LifeFormData` layout untouched; live Sepolia collection kept |
| Loop bounty | **Minted from nothing**: challenger receives freshly minted NUT = `B.sequence_length` (the contract already holds NUT `MINTER_ROLE` for the feed faucet). No retroactive escrow; the mint-fee sink stays a sink |
| Path bounty | Unchanged: B's per-token **escrow** pays the challenger |
| Ordering guard | **Global per-contract mint nonce** (monotonic counter stamped at mint) replaces `minted_at` block-timestamp as the direction guard — strict `<`; same-block mints get distinct nonces. `minted_at` stays for display only. **Supersedes** path-creatures-spec §1.2/§5 rule 2 |
| Grandfathering | **All pre-upgrade tokens = nonce 0**: tied with each other (mutually unburnable, strict `<` fails on ties) but able to burn any future copy. No admin backfill |
| Diptych case | Strict — no exemption (§1.3) |
| Mint-time warning | **Spec'd here (§6), shipped later** — v1 of the mechanism is contract-side only |

---

## 3. Mint nonce

- New storage per collection: `next_nonce: u64` (init 1 on upgrade) and `mint_nonce: Map<u256, u64>`.
- `mint()` stamps `mint_nonce[token_id] = next_nonce; next_nonce += 1`.
- Unwritten map slots read 0 → pre-upgrade tokens are nonce 0 automatically (the grandfather rule
  falls out of storage defaults; no migration).
- The burn rule uses **only** the nonce. This also fixes the latent tie in the existing sub-path
  guard (two same-block mints had equal `minted_at` and were mutually unburnable forever even when
  one was a farm of the other).
- **Invariant preserved:** vulnerability is still fixed at mint — every creature that could ever burn
  `B` has a smaller nonce, i.e. already exists when `B` is minted. No future mint threatens `B`.

---

## 4. Challenge entrypoints

One new entrypoint per collection (the path contract's existing `challenge_burn` is generalized, not
duplicated):

```cairo
fn challenge_burn(
    ref self: ContractState,
    a_token_id: u256,
    b_token_id: u256,
    a_state: GridState,   // A's identity preimage (start for paths, canonical for loops)
    d4: u8,               // witness g, dihedral part ∈ [0, 8)
    dr: u8, dc: u8,       // witness g, translation part ∈ [0, 41)
    k: u32,               // step offset (0 = pure symmetry copy)
)
```

Verification sequence:

1. `assert token_id(a_state) == a_token_id` — the supplied preimage is really A (states are not
   assumed to be in storage; loops' `current_state` moves as they are fed).
2. `assert mint_nonce[a] < mint_nonce[b]`; both tokens exist (not already burned).
3. Length pre-filters (§1.2).
4. Compute `e = step^k(a_state)` — **inline** when `k` fits a single-tx budget, else **tiled** via the
   existing per-caller partial-path registry (§4.2).
5. `assert token_id(apply_symmetry(d4, dr, dc, e)) == b_token_id`.
6. Burn `B`; pay the bounty (escrow transfer for paths; fresh NUT mint of `B.sequence_length` for
   loops); clear any registry entry used; emit `ChallengeBurned { a, b, challenger, d4, dr, dc, k }`.

### 4.1 `apply_symmetry` (new in `gol_grid_v2`)

- Translations: row re-indexing + per-row bit rotation — same toolbox as the stepper, ~one
  generation's worth of ops.
- 180° / horizontal / vertical mirrors: row-order reversal and/or SWAR per-row bit reversal — cheap.
- 90°/270°/diagonal (transpose family): a 41×41 bit transpose. Naive bit-by-bit is on the order of
  the *naive* stepper (~hundreds of M gas) — acceptable for a rare one-off policing tx that fits the
  1.2B cap; a Hacker's-Delight block transpose is an optional optimization, not a requirement.
- Property tests: `apply_symmetry` is a group action (composition table), equivariance
  `step(g(s)) == g(step(s))` fuzzed, and SDK↔contract d4-index agreement.

### 4.2 Tiled `k` (long loops / long paths)

Reuse the per-caller partial-path registry exactly as the sub-path challenge does
(path-creatures-spec §5.1): the challenger assembles a segment from `a_state` of length `k`
(for loops, walking the cycle — the canonical reappears only at closure, so `k < period` never trips
the trigger guard), then calls `challenge_burn`, which reads the caller's entry keyed by
`hash(a_state)`, asserts `length == k`, takes its `exitpoint` as `e`, and proceeds from step 5.
Entry is cleared after use. Implementation must match the plumbing already deployed for the path
contract's challenge (registry lives with the minters; keep whatever read/consume interface the
deployed `challenge_burn` uses).

---

## 5. Economics & adversarial analysis

- **Bounty = what B paid.** Paths: B's escrow (`B.sequence_length` NUT). Loops: freshly minted
  `B.sequence_length` NUT. Uniform mental model: burning a farm refunds the farm's mint price to the
  janitor.
- **Self-farming stays net-negative.** Loop copy: farmer sinks `L` NUT at mint, self-challenge mints
  `L` NUT back → NUT-neutral, gas-negative. Global NUT supply is unchanged on net (`L` sunk, `L`
  minted), so the mint-from-nothing bounty is not an inflation vector.
- **No false burns.** Step 1 pins A's identity; step 5 is a hard on-chain computation of the claimed
  relation. There is nothing to fake.
- **Nonce ties (0,0)**: grandfathered tokens coexist permanently — accepted (tiny Sepolia set).
- **Already-burned / re-entry**: assert both alive before verifying; burn before paying
  (checks-effects-interactions); the loop bounty is a NUT `mint` to the challenger, no external call
  back into the contract before state is settled.
- **Registry griefing**: unchanged from the path spec — entries are namespaced per caller and cleared
  after use.
- **Fed copies**: a burned loop may have been fed by third parties; their already-fauceted NUT is
  theirs, unaffected. (Interaction with future pet bonds — a pet ERC1155 of a burned creature —
  belongs to the pet spec: likely "bond becomes reapable immediately".)

---

## 6. SDK & frontend surface (spec'd now, ship later — decided 2026-07-03)

- **Orbit canonicalization (off-chain)**: `symmetryCanonical(state)` — lex-min over the 13,448
  transforms (microseconds off-chain). Indexers key every creature by it; a farm is detectable the
  moment it lands.
- **Mint-time warning**: before any mint tx, `/create` and the incubator check the drawn creature's
  orbit-canonical against known minted creatures and warn: *"This is a rotation/translation of
  living creature #X — minting it will make it burnable and you will lose the NUT."* Not a hard
  block (the chain is the arbiter), but the wallet-signing step must not be reachable without the
  warning having rendered.
- **`planChallenge(aState, bTokenId)`**: searches the orbit + step offsets for the witness, emits the
  (possibly tiled) tx sequence — mirror of `planChallengeBurn` in the path spec.
- **"Clean up" affordance**: when the SDK detects a mintable bounty (a burnable copy exists), surface
  it as a janitor action with the NUT reward shown.

---

## 7. Relation to proof-based minting (endgame)

Once local proving ships (SNIP-36 / dinner, enthusiast tier), mint-time **spatial canonicalization**
becomes possible: prove off-chain that the submitted state is the orbit-canonical representative and
verify on-chain — new mints are then copy-free *by construction*. This mechanism is the v1 of the
same policy and remains the enforcement net for everything minted before that, so nothing here is
throwaway. Do not block this spec on proving.

---

## 8. Implementation checklist

- [ ] `gol_grid_v2`: `apply_symmetry(d4, dr, dc, state)` + d4 index table + group-action /
      equivariance / round-trip tests.
- [ ] Both NFT contracts: `next_nonce` + `mint_nonce` storage, stamped in `mint()`.
- [ ] `GolLifeformsV2` (upgrade in place): `challenge_burn` (§4), bounty via NUT mint,
      `ChallengeBurned` event. New storage maps only — existing layout untouched.
- [ ] `GolPathLifeformsV2` (upgrade in place): generalize `challenge_burn` with the `(d4, dr, dc)`
      witness; switch the direction guard `minted_at` → `mint_nonce`; keep escrow payout.
- [ ] Tests: pure-symmetry burn (each of the 8 d4 elements × a translation), stepped-symmetry burn
      (`g≠id, k>0`), loop phase witness (`k` mid-cycle), tiled `k`, nonce-0 grandfather cases
      (0 vs 0 refused, 0 burns new copy), newer-cannot-burn-older, equal-length asserts,
      self-farm net-negative, burn-then-rechallenge reverts.
- [ ] SDK: `symmetryCanonical`, `planChallenge`, orbit check (mint warning wiring is a later ship).
- [ ] Deploy: declare + upgrade both contracts on Sepolia; record class hashes in
      `docs/v2-deployment.md`; revoke the leftover admin `MINTER_ROLE` on the path NFT while at it
      (cleanup item from the v2 deployment doc).
