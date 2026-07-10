# Pet Bonds (ERC1155 Caretakers) — Technical Spec

> **Changed 2026-07-10 — daycare removed from the UI.** Henri asked to drop the "daycare"
> hand-off (transfer a bond to a friend to pet-sit) from `/pets` and `/life/[id]`. The
> transferable-bond *capability* remains on-chain (`transfer_bond` / `transferBondCall` are
> untouched), but no surface in the app exposes it: no "hand to daycare", no "Sitting for a
> friend" / "Out at daycare" lists. A caretaker either holds a bond (pets to keep the clock
> fresh) or lets it lapse (the reaper's rounds). If daycare returns, re-expose those flows here.

**Status:** draft (interview-derived, 2026-07-03). Implementation queued after the symmetry
mechanism and leaderboards.
**Scope:** a caretaker layer over living creatures — pet bonds as a transferable ERC1155, petting =
feeding, lapse → permissionless reaping. This is the recurring-care loop that makes immortality an
ongoing practice rather than a one-time mint.
**Related:** `docs/symmetry-challenge-spec.md` (burn interactions), `docs/leaderboards.md`
(caretaker boards), `docs/audience-research.md` (Cellula's "charging" loop as scale precedent).

---

## 1. Concept

Users either **breed** creatures (discover + mint, existing flow) or **pet** them. Petting a
creature:

1. **feeds it** — a pet IS `move_lifeform_forward` by exactly **1 generation** (the ceremonial
   single breath; earns the caller 1 NUT like any feed), and
2. **holds a bond** — the caller's ERC1155 caretaker bond for that creature (minted on first pet),
   whose **7-day clock** refreshes with each pet.

Stop petting for 7 days and the bond becomes **reapable**: anyone may burn it for a **1 NUT**
reward minted from nothing. Your garden is the set of creatures you're keeping alive; neglect is
visible, permissionless, and slightly profitable to clean up — the same lazy-enforcement
philosophy as the challenge-burn.

## 2. Decisions locked (interviews, 2026-07-03)

| Area | Decision |
|---|---|
| Petting = feeding | Yes — 1 generation per pet (ceremonial), earns the standard 1 NUT faucet |
| Lapse window | **7 days** without a pet → bond reapable |
| Reaper | Permissionless; reward **1 NUT flat**, minted from nothing (tunable constant) |
| Transferability | **Transferable** — enables "daycare": hand your bond to a sitter while on holiday |
| Orphaned bonds (creature challenge-burned) | **Lapse naturally** — feeding a burned token reverts, so the bond can't be renewed and ages out through the normal window; zero extra code |
| Token standard | ERC1155, `token_id` = creature id (a creature's holders = its caretaker pack) |

## 3. The transferable-bond clock (design resolution — flag on review)

ERC1155 units of one id are fungible, so per-unit state is impossible. The clock therefore lives
per **(creature, holder)**, with two rules that keep transferability from breaking the tamagotchi
pressure:

- **Max one bond per holder per creature.** Transfers into an address already holding that id
  revert. (A second bond on the same creature means nothing anyway.)
- **Transfer carries the clock unchanged**: `last_pet[creature][to] = last_pet[creature][from]`,
  then the sender's entry is cleared. A transfer is **not** a pet — self-transferring between your
  own wallets buys zero time.

Daycare under these rules: Alice transfers her bond to Bob before vacation (Bob inherits her
remaining time), Bob's pets refresh it (Bob is also feeding — he earns the NUT for those breaths),
Bob transfers it back; Alice resumes with whatever time Bob left on the clock. Works exactly like
handing over a tamagotchi.

## 4. Data model & entrypoints (new contract `GolPetBonds`)

```cairo
// storage
bonds: ERC1155 component (token_id = creature token_id, amount always 1 per holder)
last_pet: Map<(u256 /*creature*/, ContractAddress /*holder*/), u64 /*timestamp*/>
lifeforms: ContractAddress            // GolLifeformsV2 (loops; paths are static, not feedable)
nutrient: ContractAddress             // for the reaper mint (needs MINTER_ROLE on NUT)

const LAPSE_SECONDS: u64 = 604800;    // 7 days
const REAP_REWARD: u256 = 1_000000000000000000; // 1 NUT, tunable
```

- **`pet(creature_id)`** — calls `lifeforms.move_lifeform_forward(creature_id)` (reverts if the
  creature doesn't exist / was burned — this is what makes orphaned bonds lapse naturally); mints
  the caller's bond if they don't hold one; sets `last_pet[creature][caller] = now`. The 1 NUT feed
  faucet is paid by the lifeforms contract as for any feed. *(Wiring note: if `move_lifeform_forward`
  credits NUT to its immediate caller, the pet contract must forward it — or the lifeforms contract
  gains a `feed_for(creature, beneficiary)` variant. Decide at implementation; the NUT must land on
  the petter.)*
- **`reap(creature_id, holder)`** — requires `holder`'s bond exists and
  `now − last_pet[creature][holder] > LAPSE_SECONDS`; burns the bond, clears the clock entry, mints
  `REAP_REWARD` NUT to the caller. Permissionless.
- **ERC1155 transfer hook** — enforce §3: recipient must not already hold the id; move the clock
  entry with the unit; amount must be exactly 1.
- **Events**: `Petted { creature, holder, generation }`, `Reaped { creature, holder, reaper }` —
  these plus transfers are all the indexer needs for caretaker/streak leaderboards (no on-chain
  streak counters; streaks are indexer-derived, and sitters get credit for the days they actually
  petted).

## 5. Economics & adversarial notes

- **NUT flow:** petting earns 1 NUT/pet (existing faucet — a pet is a feed); reaping mints 1 NUT
  from nothing. Both are proof-of-participation consistent with the economy design; no user
  principal at risk anywhere in the mechanism.
- **Self-reap:** reaping your own lapsed bond is allowed and harmless (you just lose the bond you
  neglected and collect the 1 NUT anyone else would have).
- **Bond-churn farming:** pet → wait 7 days → reap yourself → re-pet mints a fresh bond. Yield is
  1 NUT per 7 days per creature plus 1 NUT per pet — strictly worse than just feeding in a loop,
  which mints 1 NUT *per generation* with no waiting. No incentive distortion.
- **Reaper front-running:** two reapers race for the same lapsed bond; first tx wins, second
  reverts on the existence check. Fine.
- **Clock-dodging via transfer:** closed by §3 (timestamp carries; no reset on transfer or on
  re-receipt).
- **Paths are not pettable** — paths are static snapshots (path-creatures-spec §9); the pet
  contract points only at the loop lifeforms.

## 6. Frontend surface (later phase)

- **Garden = your bonds**: profile page lists petted creatures with their clocks ("3 days until
  hungry") — loss-aversion made visible.
- **Pet action** on `/life/[id]`: the single ceremonial breath with the inhale animation (this is
  where the original redesign's ritual returns), plus "bond: N days left".
- **Daycare**: a simple bond-transfer affordance ("ask a friend to pet-sit").
- **Reaper feed**: lapsed bonds surfaced as claimable 1-NUT cleanups (same janitor pattern as
  challenge bounties).

## 7. Implementation checklist

- [ ] `src/gol_pet_bonds.cairo` — ERC1155 + clock map + `pet` / `reap` + transfer hook + events.
- [ ] Resolve the NUT-beneficiary wiring (`feed_for` variant vs forwarding) — see §4.
- [ ] Grant the pet contract nothing on lifeforms (feeding is permissionless) but `MINTER_ROLE` on
      NUT for the reap reward.
- [ ] Tests: pet mints bond + feeds + refreshes clock; reap before/after lapse; transfer carries
      clock + rejects duplicate holder; self-transfer buys no time; orphaned bond (burned creature)
      lapses and reaps; NUT lands on the petter; reap reward minted to reaper.
- [ ] SDK: `pet`, `reap`, bond readers, lapsed-bond scanner; WASM bindings.
- [ ] Deploy to Sepolia; record in `docs/v2-deployment.md`.
