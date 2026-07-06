# Website Copy Review — full pass

**Date:** 2026-07-06 · **Scope:** every user-facing string (≈230 FR/EN pairs across 13 files) ·
**Status:** findings + proposed lexicon; awaiting Henri's calls on the four decisions in §5 before
the rewrite pass.

## 1. Verdict

The copy is *good scaffolding with flashes of the right voice* — the petri-dish moments ("scanning
the chain for life…", "waiting to be discovered", the pet copy) land exactly where the design doc
pointed. But it is not the best we can do, for three systemic reasons: the site never says its own
best word (Wanderer), minting — the emotional peak — speaks fluent blockchain instead of the
world's language, and the vocabulary is a patchwork (four different verbs for minting, two words
for death, tu and vous in the same site).

## 2. The big finding: the Wanderers never wander

v3 named the path collection **"Digital Wanderers" / WNDR** — it's what wallets and marketplaces
display. The site says **"path / chemin" in ~25 places** and "Wanderer" in zero. Beyond the
inconsistency, *path* is the weakest word on the site: it's the mathematician's term, cold and
directionless, while "Wanderer" carries the entire romance of the thing — a creature that travels,
then finds its place (or doesn't).

**Recommendation:** adopt **Wanderer / Errante** as the creature's name everywhere user-facing
("une errante" sits beautifully next to "une créature" in French). Keep "path/chemin" only where
the *mathematical* fact is meant — the trait line "distance to its loop". Examples:

| Now | Proposed |
|---|---|
| "Spawn this path" / "Faire naître le chemin" | "Set the wanderer free" / "Libérer l'errante" |
| "A path is a frozen snapshot: it can't be fed." | "A wanderer is a moment of travel, caught: it can't be fed. Its rarity is the length of its journey." |
| "Path already born → meet it" | "This wanderer already lives → meet it" |
| "Methuselahs (paths)" | "Methuselahs (wanderers)" / "Mathusalems (errantes)" |
| "Dead · fades to nothing" (life-state) | keep — this line is already good |

## 3. Second finding: the machinery speaks at the moment of birth

The design doc's values were *Alive, Contemplative, Honest*. Honesty means not hiding that
transactions happen — but the current copy hands the microphone to the machinery at the peak
moments:

- "Spawning… (tx pending)" — the most magical instant on the site, phrased like a CI log.
- "Verifying… (3/5)" — accurate, but it's the chain proving a creature is *alive*; say so.
- "Reading the chain…" ×6 — the garden pages already found better ("scanning the chain for
  life…"); the newer pages (leaderboards, pets) regressed to the utility phrasing.
- "· 4 txs" on the primary CTA — jargon. The user's lived experience is **signatures**:
  "· 2 NUT · 4 signatures" is both friendlier and more honest about what they'll do.
- "warming up the engine…" (/create) vs "warming up the petri dish…" (garden) — the engine leaks
  a mechanical metaphor into the lab. One world: the dish.

Proposed reframings (mechanics stay visible — tx links, step counts — but wrapped in the voice):

| Now | Proposed |
|---|---|
| "Spawning… (tx pending)" / "Naissance… (tx en attente)" | "Being born… (the chain is writing)" / "Naissance… (la chaîne écrit)" |
| "Verifying… (3/5)" | "Proving it lives… (3/5)" / "On prouve qu'elle vit… (3/5)" |
| "Reading the chain…" | "scanning the chain for life…" / "on scrute la chaîne…" (reuse the garden's line) |
| "Wallet showing nothing? Re-request step 3/5" | keep the honesty, add warmth: "Your wallet fell asleep — knock again (step 3/5)" / "Votre portefeuille s'est assoupi — frappez encore (étape 3/5)" |
| "Could not read the chain" | "the petri dish is offline —" (already exists elsewhere) |

## 4. The lexicon (one word per concept, both languages)

The canonical vocabulary. Anything user-facing picks from this table; "path", "spawn", "mint",
"txs" retire from UI copy (they live on in code and docs).

| Concept | EN | FR | Notes |
|---|---|---|---|
| The site/world | the garden · the petri dish | le jardin · la boîte de Pétri | interchangeable; dish = machinery moments |
| A creature (loop) | creature | créature | "lifeform" only in on-chain metadata; EN currently wobbles creature/lifeform |
| A path creature | **wanderer** | **errante** | the collection's real name |
| Minting | **set free** / born | **libérer** / née | purpose.md's own verb ("I want to try and set them free"); kills spawn/mint/faire-naître/libérer quadruple. FR keeps "naître" for the *state* (née, naissances en cours) |
| Feeding | feed · breathe life | nourrir · donner du souffle | as now |
| One pet | a pet = one breath | une caresse = un souffle | as now — the pet copy is the site's best |
| Bond decay | wilts | fane | as now |
| Reaping | reap | récolter | see decision §5.3 |
| Death (loop) | gone out | **éteinte** | unify: "Éteinte" (format.ts) wins over "Mort" (path page) — extinguished, not killed |
| Money | **$NUT** | **$NUT** | currently mixed NUT/$NUT; pick $NUT everywhere prices appear |
| Tx count | **signatures** | **signatures** | "4 signatures", not "4 txs" |
| Progress noun | steps → **breaths?** no — keep "étape/step" | | steps is fine; don't over-poeticize resumable state |

## 5. Four decisions only Henri can make

1. **Tu or vous?** The site currently mixes: "**sois** le premier" (leaderboards) vs "**soyez** le
   premier" (garden), "nourrissez-la", "Connectez-vous". Mixed is the only wrong answer. `vous` is
   the safe gallery register; `tu` would commit the whole site to the playful, kid-at-the-controls
   energy the /create slot machine already has. My lean: **tu** — this is an art piece whose most
   engaged user is eight, and French `tu` + poetic copy reads as intimate, not sloppy. But it's a
   register decision for the author.
2. **The French Wanderer:** *errante* (my pick — feminine, poetic, "l'errante"), *vagabonde*
   (warmer, more storybook), or keep *chemin* (status quo, coldest).
3. **The reaper's register:** EN currently "The reaper's rounds" (gently dark) vs FR "À récolter"
   (flat agricultural). Align dark (**"the reaper's rounds" / "la tournée du faucheur"**) or align
   gentle (**"the harvest" / "la récolte"**). The mechanic is a little grim; I lean dark-but-soft:
   reaper/faucheur, with "récolter" kept as the verb.
4. **EN mint verb:** "set free" (my strong recommendation — it's purpose.md's own language and the
   bestiary already uses it) vs keeping "spawn" (video-game register; clashes with the art frame,
   though it does fit the slot machine).

## 6. Smaller items (fix in the same pass)

- **"Grands souffleurs"** — souffleur is also a theatre prompter/glassblower in French. The
  glassblower echo is arguably lovely for an art piece; alternatives: "Donneurs de souffle".
  Henri's ear decides.
- **"Bookmarks" (EN, incubator)** is browser-speak; FR "Gardées" is in-world. EN → "Kept" /
  "Keepsakes".
- **Empty states are good** ("Nothing new this week — your move." is great) — extend the same
  energy to: "No wards yet — adopt a creature from the garden." ✓ already good; "Nothing in
  progress." → "No births in progress." (match FR "Aucune naissance en cours").
- **Error voice:** "You declined the signature." is fine; "This step is too heavy — the wallet
  under-estimated the gas." is good honest-plain. Keep the error register plain — errors are the
  one place the utility voice belongs.
- **Case discipline:** hints/status in lowercase whisper ("your bond: 3 days before it wilts."),
  buttons in Sentence case. Mostly true already; normalize the stragglers ("Lecture de la
  chaîne…" → lowercase).
- **/create has no invitation.** The most-visited page opens with a section label and a slot
  machine. One line under the header sets the frame: "Draw a seed. Watch its destiny." /
  "Dessine une graine. Regarde sa destinée." (register per decision 1).
- **Footer** "A Starknet experiment · creatures live on Sepolia testnet" — honest and right; keep.
- **aria-labels** exist and are bilingual ✓ — extend to the new pets/leaderboards rows in the pass.

## 7. Execution

One copy-pass commit implementing §2–§4 + §6 across all 13 files once §5 is decided —
roughly 80 of the 230 strings change. No layout or logic changes.
