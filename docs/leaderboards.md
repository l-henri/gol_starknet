# Leaderboards — idea catalogue

**Status:** brainstorm (2026-07-03). **Update 2026-07-06: the recommended first four boards are
BUILT** — `/leaderboards` in the app (longest loops, methuselahs, top breathers, discoveries of the
week), backed by client-side event scans (`EventScanDataSource::feed_rewards` /
`recent_*_mints_with_blocks` + WASM `topBreathers`/`recentMints`/`recentPathMints`). No contract
changes were needed, as predicted. The rest of this page remains the backlog for curation; a real
indexer becomes worthwhile when event volume outgrows client-side scans.
**Premise:** high scores are the proven hook (field-tested by the project's most demanding user).
Boards also double as the immortality engine: when *age* and *care* are scores, feeding becomes
the game, not just the mint prerequisite.

## The one structural fact

**Almost no board needs a contract change.** Every creature's full grid state is on-chain, and Life
is deterministic — so any pattern-derived metric (amplitude, population, speed, …) is a pure
function an indexer computes off-chain from mint data. The real deliverable behind this whole page
is the **indexer** (already a Phase-4 roadmap item; the event-scan-from-block-0 enumeration needs
replacing anyway). Contract deltas worth considering are listed at the bottom — there are only two,
both optional.

## Creature boards — loops

| Board | Definition | Source |
|---|---|---|
| **Longest loop** ★ | period (`sequence_length`) | on-chain field |
| **Oldest loop (mint)** ★ | earliest minted, still alive | mint event block / `mint_nonce` |
| **Eldest (most lived)** | highest `age` (generations actually breathed) | on-chain field |
| **Biggest amplitude** ★ | max − min live-cell population across the cycle | computed: step the cycle off-chain |
| **Peak population** | largest live-cell count reached in the cycle | computed |
| **Most turbulent** | avg births+deaths per generation over the cycle (visual churn) | computed |
| **Complexity per cell** | period ÷ min population (long loops from few cells) | computed |
| **Fastest ship** | cycles containing a *translated* copy of an earlier phase are spaceships on the torus; rank by cells-traveled per generation | computed — falls out of the `apply_symmetry` work in the symmetry spec |
| **Most attractive** | most minted paths landing on this loop (`target_loop_id` count) — the loop's basin as measured by discoveries | on-chain field, counted |
| **Most loved** | distinct feeders over lifetime / most generations gifted by non-owners | feed attribution (see deltas) |
| **Longest coma broken** | biggest gap between two feeds, revived | event timestamps |

## Creature boards — paths

| Board | Definition | Source |
|---|---|---|
| **Longest path** ★ | distance to loop (`sequence_length`) | on-chain field |
| **Methuselah score** | path length ÷ starting live cells (classic Life longevity metric — longest life from the smallest seed) | computed from `start_state` |
| **Diehard** | longest path ending in *death* (empty grid) — the most spectacular collapse | `life_state == Dead` + length |
| **Deepest freeze** | longest path ending in a still life | `life_state == Frozen` + length |

## People boards

| Board | Definition | Source |
|---|---|---|
| **Top breathers** | total generations fed (equivalently, NUT fauceted) | NUT mint transfers / feed events |
| **Top discoverers** | creatures minted (split loops / paths; maybe weight by length) | mint events |
| **Janitors** | challenge bounties claimed (symmetry + sub-path burns) | `ChallengeBurned` events (new mechanism) |
| **Caretakers** | pet streaks kept, creatures kept alive the longest | future pet ERC1155 events |
| **Discovery of the week** | best new find in a rolling window (length × recency) — the kid-facing board: winnable by a newcomer every week, unlike all-time boards | mint events |

## Garden boards (global, and very on-brand)

| Board | Definition | Source |
|---|---|---|
| **Total gas burned** | cumulative gas spent breathing life — *the* metric for an art piece whose outcome is "burning gas and creating art"; per-creature and global | tx receipts via indexer |
| **Generations breathed, ecosystem-wide** | a single global odometer | feed events |
| **Population census** | living / frozen / dead counts over time | mint + state data |

★ = the four Henri named.

## Contract deltas (both optional)

1. **Feeder attribution in the feed event.** `MoveForward` doesn't carry the caller; the indexer can
   already attribute via the tx sender or the NUT `Transfer(0 → feeder)` in the same tx, so this is
   a convenience, not a blocker. If the contracts get upgraded for the symmetry mechanism anyway,
   adding `feeder: ContractAddress` to the event is a one-line ride-along.
2. **`mint_nonce`** — already being added by `symmetry-challenge-spec.md`; gives exact mint ordering
   without block-timestamp ties. Nothing else on this page touches a contract.

Everything else — amplitude, populations, ships, methuselah ratios, basins — is indexer compute over
states that are already on-chain. **Recommendation:** treat "leaderboards" as the indexer project's
first product, and start with four boards that reward *different* behaviors so no single strategy
dominates: one discovery board (longest loop), one path board (methuselah or longest path), one care
board (top breathers), one weekly board (discovery of the week).
