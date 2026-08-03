# v3 Identity — Orbit-Canonical Token Ids (Technical Spec)

**Status:** APPROVED (interview-derived, 2026-07-06; all §2/§3 decisions settled). Sequencing:
consolidate → build v3 → pets.
**Scope:** one identity system for creatures, on-chain and off: `token_id` becomes the Poseidon
hash of the **symmetry-orbit canonical** state. Symmetry copies stop being a policing problem and
become an id collision. Fresh v3 collections.
**Supersedes:** the *symmetry-copy* half of `symmetry-challenge-spec.md` for new mints (its
mechanism remains live on v2 and its witness machinery is reused here); the identity scheme of
`v2-grid-redesign.md` §5.
**Related:** `path-creatures-spec.md` (sub-path challenge — retained), `pet-mechanism-spec.md`
(pets target v3).

---

## 1. Concept

v2 has two notions of "same creature": the on-chain id (time-cycle canonical) and the off-chain
family key (symmetry-orbit canonical), reconciled after the fact by challenge-burns. v3 unifies
them: **the family key IS the token id.**

- A creature's **family** is its full symmetry class: the 13,448-element torus-symmetry orbit
  (translations × D4), and for loops additionally all phases of the cycle.
- `token_id = Poseidon(canonical)` where `canonical` is the lexicographically smallest member of
  the family (for paths: lex-min over the orbit of the start state; for loops: lex-min over
  orbit × phase).
- **Copy prevention replaces copy policing**: any two members of one family produce the same id,
  so a copy mint reverts on the ERC-721 uniqueness check like any duplicate. No bounty, no burn,
  no collector ever holding a burnable-because-copy token.
- The chain cannot *compute* the canonical (13,448 transforms — structurally off-chain, v2 spec
  §6.3). It doesn't need to: the minter **claims** it with a witness, the chain **verifies family
  membership exactly** (one transform) and takes only **minimality** on optimistic trust, defended
  by a cheap permanent fraud-proof (§5). The chain checks answers; it never searches.

## 2. Decisions locked (interview round 1, 2026-07-06)

| Area | Decision |
|---|---|
| Spec home | This file; supersedes-notes in the two affected specs |
| Fraud-proof stake | **Reuse the mint escrow**: the `sequence_length`-NUT mint charge becomes a per-token escrow on BOTH collections (paths already work this way; loops convert their sink into per-token escrow — unchallenged escrow is still the sink). Fraud-proof burns the token and pays its escrow to the prover |
| Fraud window | **Permanent** — a wrong id is wrong forever; matches the sub-path rule's vulnerability-fixed-at-mint philosophy. No timers |
| Deployment | **Fresh v3 collections, reseeded genesis**: new lifeforms + paths + minters, NUT reused; v2 stays live but frontend/SDK repoint; notable v2 creatures re-minted as a curated genesis (their v3 ids are the orbit canonicals). No grandfather tiers anywhere |

## 3. Follow-up decisions (Henri, 2026-07-06)

| Area | Status |
|---|---|
| Sequencing | **CONFIRMED: consolidate → v3 → pets.** Commit/merge the outstanding branches + LOG backfill first, then v3, then pets against v3 |
| Genesis reseed | **DEFERRED ("don't yet")**: v3 launches without re-minting the v2 creatures (one smoke-test seed at deploy only, as v2 did — the frontend's renderer-template adoption needs a live token). v2 stays live, so a curated reseed remains possible any time later |
| Loops naming | "Digital Bacteria" / `BACT` (version markers dropped) — unchallenged |
| **Paths naming** | **DECIDED: "Digital Wanderers" / `WNDR`** (the Greek *planetes* — bodies that wander before finding their place). Loops: "Digital Bacteria" / `BACT` |
| **Ride-along ABI changes** | **DECIDED: both.** (a) Feeder address added to the feed event (exact top-breathers attribution, unambiguous once reapers also mint NUT); (b) `move_lifeform_forward_n_for(token, n, beneficiary)` so the pet contract can feed with the NUT landing on the petter (pet-mechanism-spec §4). No upgrade-timelock in v3 |

## 4. Identity & witness-assisted mint

### 4.1 Family canonical

- **Path**: `canonical = min over g ∈ G` of `g(start)`, `G` = the 13,448 torus symmetries
  (`gol_grid_v2::apply_symmetry` group; d4 table unchanged, consensus-critical).
- **Loop**: `canonical = min over (g, k)` of `g(step^k(entry))`, `k < period` — quotient over
  symmetry AND phase (else the same family mints once per phase-orbit combination).
- The SDK already computes this: `symmetry_canonical` returns `(canonical, d4, dr, dc)`; the loop
  variant takes the min across the cycle's phases (the fate-finder already has every phase in
  hand) and remembers `k`. **The returned witness is exactly the mint argument.**

### 4.2 Mint (both minters)

```
mint_loop(drawn: GridState, period, canonical: GridState, d4, dr, dc, k, recipient)
mint_path(drawn: GridState, length, loop_period, canonical: GridState, d4, dr, dc, recipient)
```

1. Verify the creature exactly as v2 does, **on the drawn state** (walk the cycle / path —
   unchanged cost; the drawn state must still be a valid loop-member / path-start; the v2
   "drawn must be time-cycle-smallest" assert is dropped — canonicality now lives in the id).
2. Verify the claimed canonical is in the family: loops
   `assert apply_symmetry(d4, dr, dc, step^k(drawn)) == canonical` (`k < period`; the cycle walk
   already passes through `step^k(drawn)`); paths
   `assert apply_symmetry(d4, dr, dc, drawn_start) == canonical`. **One transform — family
   membership is fully verified, not optimistic.**
   > **2026-08-03 implementation note:** the 2026-07-06 implementation deviated from this text —
   > it anchored k on the walk's TIME-lex-min and re-stepped k times after the walk (up to 2× the
   > period in steps). Code and SDK now match the spec as written: k is drawn-relative and
   > `step^k(drawn)` is captured during the walk. Deployed Sepolia/mainnet minters still have the
   > old semantics until redeployed; the SDK on this commit produces drawn-relative k, so it
   > REQUIRES a redeployed minter (`mint_loop` with k>0 against the old classes reverts).
   > Tiled mints (`mint_loop_from_partial_paths`) always anchored on the state handed in —
   > unchanged.
3. `token_id = Poseidon(canonical)`; ERC-721 mint reverts on collision → copies can't exist.
4. Store **both** states: `canonical` (identity preimage, fraud-proof base) and `drawn`
   (display state — the artist's chosen orientation and position are preserved; render params,
   metadata and the animation all use `drawn`).
5. Charge `sequence_length` NUT from the minter **as per-token escrow** (loops now identical to
   paths). Stamp the mint nonce (kept — the sub-path challenge still needs ordering).

### 4.3 What remains optimistic — minimality only

The chain has verified the id belongs to this creature's family. The single unverified claim is
that no lex-smaller family member exists. An honest SDK cannot get this wrong (0.75 ms exact
computation); a wrong claim is a bug or an adversary — and it can never block an honest mint
(the true canonical has a different id and mints normally; the malformed token is inert junk).

## 5. Fraud-proof (permanent, staked by the mint escrow)

```
prove_malformed(token_id, g' = (d4, dr, dc), k')
```

- Let `C` = the token's stored canonical. Compute `cand = apply_symmetry(g', step^{k'}(C))`
  (`k' = 0` for paths; `k' < period` for loops, tiled via the partial-path registry when long —
  same plumbing as every other challenge).
- `assert lt(cand, C)` — the challenger exhibited a strictly smaller family member, so the id was
  not minimal. (Family membership of `cand` is by construction: it was derived from `C`.)
- Burn the token; transfer its **escrow** to the prover; emit
  `IdFraudProven { token_id, prover, d4, dr, dc, k }`.
- Permissionless, permanent, and cheaper to verify than any v2 challenge (one transform + compare;
  no hash-hunting). Off-chain detection is `symmetry_canonical` — a bot spots a malformed id the
  moment it's minted, forever.

## 6. What v3 removes, and what it keeps

| Mechanism | v3 fate |
|---|---|
| Loop symmetry challenge-burn (shipped 2026-07-06 on v2) | **Not carried into v3 contracts** — copies can't mint. Stays live on v2 |
| Path sub-path challenge-burn with `(g, k)` witness | **Kept unchanged** — the time direction can't be collapsed into any id: `g(step^k(start))` is a different family. Nonce guard, escrow bounty, tiling all as shipped |
| Minimality fraud-proof | **New** (§5) |
| Mint-time copy warning (SDK) | Demoted from safety feature to UX nicety: a duplicate mint now *reverts cleanly*; the SDK precomputes the collision and explains it before the wallet opens |
| Mint nonce | Kept (sub-path ordering) |
| NUT economy | Unchanged: faucet on feeding, `sequence_length` charge on mint — now escrowed per-token on both collections; unchallenged escrow remains the intentional sink |

## 7. Contracts, SDK, frontend

- **Contracts:** `GolLifeformsV3`, `GolPathLifeformsV3`, two minters (fresh deploy; NUT reused;
  wiring as v2 + escrow accounting on loops + `prove_malformed` on both). Ride-alongs per §3 if
  confirmed. Token data gains the second `GridState` (7 felts) for `drawn`.
- **SDK:** loop-family canonical (min over phases × orbit, returning `(canonical, g, k)`); mint
  builders pass the witness; `prove_malformed` builder; `malformedScan` (orbit-canonicalize every
  minted id, flag mismatches). `find_witness`/`symmetry_canonical` ship already.
- **Frontend:** `/create` passes the witness transparently (user never sees it); duplicate
  discovery renders as "this creature already lives → visit it" (id precomputed locally);
  leaderboards unchanged (family ids make dedup automatic).
- **Genesis:** script re-mints the curated v2 creatures (owners per §3) with freshly computed
  orbit ids; recorded in `v2-deployment.md`'s successor section.

## 8. Endgame

When local proving ships, a SNIP-36 proof of minimality accompanies the mint and closes the
optimistic gap: the id goes from *defended* to *proven* **without changing the id** — orbits and
their canonicals are already the identity. Nothing in this spec is throwaway on that day; only
`prove_malformed` retires to a vestigial safety net for the pre-proof era.

## 9. Implementation checklist

- [ ] Confirm §3 provisional decisions with Henri.
- [ ] `gol_grid_v2` (shared lib): nothing new on-chain — `apply_symmetry`, `lt`, `step`, Poseidon
      all exist. Loop-family canonical is SDK-side only.
- [ ] `src/gol_lifeforms_v3.cairo` + `src/gol_path_lifeforms_v3.cairo`: dual-state storage,
      escrowed mint, `prove_malformed`, nonce, (§3 ride-alongs), path sub-path `challenge_burn`
      carried over.
- [ ] Minters v3: witness-assisted verification (§4.2); drop the time-cycle-smallest assert.
- [ ] Tests: witness mint happy paths (loop phase ≠ 0, path), copy mint reverts on collision,
      malformed mint + fraud-proof + escrow payout, fraud-proof rejects when canonical is minimal,
      drawn-state display preserved, sub-path challenge regression, loop escrow accounting.
- [ ] SDK + WASM: loop-family canonical, mint witnesses, `prove_malformed`, malformed scan.
- [ ] Frontend: mint flow, duplicate-UX, repoint addresses.
- [ ] Deploy fresh v3 + genesis reseed script; record in deployment doc; update all
      supersedes-notes and STATUS/LOG.
