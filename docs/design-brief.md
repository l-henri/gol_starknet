# Design Brief — Petting & the Full Scope of the Experience

*For the designer working on the website overhaul. Companion to [`purpose.md`](purpose.md),
which you already have — read that first for the vision and voice. This brief adds the two
things it doesn't cover: **why petting exists and how it feels**, and **the complete map of
what a visitor can actually do on the site.***

This is a **WIP art piece, not a product**. The outcome is *burning gas to make art*, not
growth or revenue. Nothing here is a funnel; there is no conversion to optimize. Please design
for reverence and aliveness, not engagement metrics.

---

## 1. The mental model in one sentence

A visitor does two kinds of thing here: they **bring life into being** (discover a pattern and
set it free on-chain) and they **keep life going** (breathe into creatures so they move forward
forever). Petting is the emotional heart of that second verb.

Two collections exist:

- **Digital Bacteria (loops)** — creatures that have found a repeating cycle. They are *alive*
  and can live forever as long as someone keeps pushing them. **These are the ones you pet.**
- **Digital Wanderers (paths)** — a captured moment of a pattern still travelling toward its
  fate. They're static snapshots, not living loops — **not fed, not petted.** They're portraits,
  not pets. Keep this distinction legible in the design; the care surface applies only to the
  living Bacteria.

---

## 2. Petting — what it is, how it works, why it came to be

### Why it exists (design this feeling, not the mechanism)

The core idea of the piece (see `purpose.md`) is that these creatures are immortal *only as long
as someone keeps pushing them forward*. Minting alone made that a one-time act — you set a
creature free and walk away, and "someone, anyone" is supposed to keep it alive. That's abstract
and nobody feels responsible for it.

**Petting turns "someone keeps it alive" into "*I* am the keeper of this one."** It converts a
single act of creation into an ongoing relationship — immortality as a *practice* rather than a
purchase. That relationship is what actually sustains life over time. Everything about petting
should feel like tending something living that depends on you: quiet, tactile, a little tender,
with real stakes.

### How it works (the user's experience of it)

- **Petting is a single ceremonial breath.** One pet = moving a creature forward by exactly one
  generation. It's the intimate, deliberate version of "breathe life" — one breath, given with
  attention.
- **Your first pet opens a bond.** You become a named caretaker of that creature. The bond is a
  token you hold; a creature's caretakers are its little pack.
- **The bond has a hunger clock — 7 days.** Every time you pet, the clock resets. This is a
  tamagotchi: the design should always make "time until this creature is hungry / at risk"
  *visible and felt* (e.g. "3 days left"). Loss-aversion is the engine — the fear of letting your
  creature lapse is what brings people back.
- **Neglect is punished by the reaper.** Stop petting for 7 days and your bond becomes *reapable*:
  anyone (in practice, a bot making its rounds) can claim it for a tiny reward. You don't lose the
  *creature* — it lives on if others tend it — you lose *your standing as its keeper*. The reaper
  is a real presence in the world (dark, but soft — "the reaper passes"), not a punishment popup.
- **Bonds are transferable — this is "daycare."** Going away? Hand your bond to a friend to
  pet-sit; they keep the creature alive (and earn the little reward for each breath), then hand it
  back with whatever time is left on the clock. Exactly like passing someone your tamagotchi.
  There's a warm social story here worth surfacing in the design.

### The economy, in plain terms (so nothing reads as "yield")

There's a token, **NUT**. Breathing/petting earns a little NUT; reaping a neglected bond pays a
little NUT. **This is intentionally a free faucet — proof-of-participation, not profit.** No
user money is ever at risk, and there is nothing to "win." NUT is the gentle nudge that keeps
creatures moving, not a reward to farm. Please **do not** let the design drift toward
points/rewards/yield/mining language or casino-cash-out energy.

### The anti-model — say this out loud in the design room

The largest on-chain Game of Life project (Cellula) proved this exact recurring-care loop scales
to hundreds of thousands of users — **but only because it financialized it as "virtual proof of
work" mining.** Its audience was mercenary and evaporated when the yield did. **That is precisely
what this piece is not.** We're borrowing the *recurring-care rhythm* (come back, tend your
creatures) and explicitly rejecting the *framing* (get paid, extract, compete for money). The
tell that the design is right: it should feel like keeping a garden alive, not running a farm.

---

## 3. Full scope — everywhere a visitor goes, and what they do there

The verb inventory, then the surfaces.

| Verb | What it is |
|---|---|
| **Discover / create** | Draw a seed pattern, watch its destiny play out, and **set it free** (mint it on-chain) |
| **Breathe life** | Push any creature forward — proof-of-participation; earns a little NUT. Casual, anonymous, no commitment |
| **Pet** | The committed version of breathing — one ceremonial breath that opens/refreshes a **caretaker bond** with its 7-day clock |
| **Care / daycare** | Tend the creatures you're keeping alive; hand a bond to a friend to pet-sit |
| **Reap** | Claim a neglected (lapsed) bond — the janitor act, mostly done by bots |
| **Witness the records** | Browse the leaderboards — the garden's hall of fame |

### The surfaces (pages)

1. **The Garden (home).** The living gallery — creatures that are currently alive, breathing and
   animating on the grid. The first impression of the whole piece: a petri dish full of life. This
   is where wonder happens; it should feel *inhabited*.

2. **Create (`/create`).** Draw a seed on the grid, run it, and watch where it's headed — does it
   die out, or find a loop and live? Then **set it free** on-chain. This is the discovery/"slot
   machine of life" moment — playful, a bit addictive, suitable for a curious kid (one of the real
   primary users is an 8-year-old). Joy and surprise are the target emotions here.

3. **Incubator (`/incubator`).** A workbench for births in progress. Big creatures take several
   signatures to mint, so this is where a mint-in-progress lives until it's done, alongside
   patterns you've **bookmarked/saved** to come back to. Think "eggs not yet hatched."

4. **Creature detail (`/life/[id]`).** One creature, up close: watch it live, see its history and
   traits, and either **breathe life** into it or **pet** it (take on or refresh your bond, with
   "bond: N days left" shown). **This is the ritual surface** — the single inhale/breath animation
   belongs here. It's the most intimate screen in the piece.

5. **Wards (`/pets`).** Your caretaker home: the creatures *you* are keeping alive, each with its
   hunger clock ("3 days until hungry") — loss-aversion made visible. Also where the **reaper's
   rounds** show up (lapsed bonds), and where **daycare** (handing a bond to a friend) lives. The
   emotional register: a windowsill of things you're responsible for.

6. **Leaderboards (`/leaderboards`).** The garden's records — e.g. longest-lived / longest
   transients (methuselahs), most devoted caretakers, and so on. For the cellular-automata
   community this doubles as a *discovery census* (their culture already keeps pattern
   leaderboards). Celebratory and communal, not competitive-for-money.

---

## 4. Tone & pitfalls for the redesign

- **Reverent and alive, not gamified.** This is closer to a nature documentary or a tended garden
  than a game with a scoreboard. Aliveness, patience, tenderness, a little awe.
- **Death is real but gentle.** Creatures go out; the reaper passes. Handle it with dignity, not
  cheer and not dread. ("Gone out" is the established word for death.)
- **Never make NUT look like money.** No yield, no APR, no "earn," no cash-out. It's a nudge, not
  a prize.
- **Keep the two collections distinct** — living Bacteria (pettable) vs. static Wanderers
  (portraits). Don't offer a pet/feed affordance on a Wanderer.
- **Lexicon already in use** (please stay consistent): *set free* (mint), *breathe life* (feed),
  *pet*, *bond / ward*, *the reaper*, *gone out* (death), *petri dish*, *Digital Bacteria*,
  *Digital Wanderers*.
- **The site is English-only right now.** (A French version existed and was paused for a wording
  revision; don't design around a live language switcher.)

For the underlying mechanics in full detail if you ever need them, the source of truth is
[`pet-mechanism-spec.md`](pet-mechanism-spec.md) — but you should be able to design the whole
experience from this brief.
