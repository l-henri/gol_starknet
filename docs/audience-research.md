# Audience & Distribution Research

**Status:** research synthesis, 2026-07-03. Sources: deep-research pass (20 sources, 97 extracted
claims, 25 adversarially verified → **19 confirmed / 3 refuted / 3 unverified**). Claims marked
⚠️ came from the extraction phase but did not go through verification — treat as leads, not facts.
**Question:** who is the audience for this art piece, and how do we maximize reach and usage?

---

## 1. Positioning recommendation

**Position it as what it is: a fully on-chain, participatory generative artwork — algorithm-as-art
in the Autoglyphs lineage, where the collector's job is not just owning but *keeping things alive*.**
No financial promise, low cost, small numbers, long horizon.

### Primary audience — fully-on-chain generative art collectors & creators

The niche is small post-2021 but it is *exactly* this project's buyer, and the project has natively
what the leaders of the genre treat as their crown jewel:

- Art Blocks spent **four years retrofitting** full on-chain reconstruction (90% of projects
  reconstructable from chain data as of late 2024) and markets it as a core collector value:
  *"You own more than just a token — you have everything needed to generate and experience your
  artwork."* (confirmed, artblocks.io). This project has that property by construction.
- Autoglyphs — the genre's origin — launched as a tiny, cheap, art-first, charity-proceeds drop
  (512 pieces, ~$35) with no financial promise and became one of the most valued on-chain
  collections (confirmed, curated.xyz). **Constraint and sincerity aged well; hype didn't.**
- fxhash demonstrated that an art-over-speculation, low-fee, open-participation culture builds a
  real collector community — explicitly *"the organic antidote to the top-down, hypercommercialized
  NFT platforms"* — and that low entry cost is itself a collector-acquisition mechanism (confirmed,
  rightclicksave.com, cryptobriefing.com).

### Secondary audience — cellular-automata / Life enthusiasts

Tiny and deep: ConwayLife.com has **~1,936 members and 223k+ posts** ⚠️, and its two biggest
subforums are pattern discovery and classification — literally this project's core mechanic. These
people are the *artists* of the piece: the ones who will find the long transients, methuselahs, and
ships that fill the leaderboards. Catagolue (their pattern census) is culturally a leaderboard
project already. **Approach as math/discovery content, not as an NFT drop — this community is
historically crypto-averse; lead with "a 41×41 torus census with an immortality mechanism" and let
the chain be the substrate, not the pitch.** Channels: ConwayLife forums + Discord + LifeWiki;
Wolfram Institute Community Discord (the named CA hangout) ⚠️.

### Tertiary / wildcard — creative coders, kids & education

The p5.js / OpenProcessing world (~100k self-reported creative coders; generative art is a
first-class category there — confirmed) is a natural top-of-funnel: the `/create` editor is already
a no-wallet browser toy. And the project's one real user datum — an 8-year-old who loves drawing
creatures and chasing high scores — points here. **Blocked for now by wallet/gas friction** (users
pay their own gas by design), so treat as a later tier: grow it when session keys / smoother
onboarding exist. Starknet's native account abstraction is a genuine asset for this eventually ⚠️.

### Anti-positioning (what not to be)

**Cellula is the proof and the warning** ⚠️ (largest on-chain GoL project: 1.5M+ BitLife mints,
210k+ active users within ~4 months on BNB Chain): it financialized GoL as "virtual proof of work"
mining. It proves GoL mechanics scale — *when wrapped in yield* — and that that audience is
mercenary and evaporates with the yield. That's the opposite of this piece. Two transferable
lessons anyway: (1) its "charging" mechanic — users repeatedly paying small fees to keep creatures
active — is a paid analog of breathing/petting and shows the recurring-care loop works on-chain at
scale; (2) it bootstrapped distribution through its chain's institutional channels (Binance Labs
incubation), the analog of Starknet's grant/ecosystem programs.

Also refuted by verification, so don't build the pitch on them: the "art-NFT market is 1/100th of
2021" and "~20k addressable art collectors" headline numbers (0-3 votes both), and "Sol LeWitt
framing is how collectors legitimize on-chain generative art" (1-2). The *confirmed* version of the
downturn: Art Blocks volume −95% / sales −88% from the 2021 peak; several curator platforms dead
(Foundation −99.8%, MakersPlace/KnownOrigin closed). **Plan for a small, durable audience; volume
is not the success metric — an art piece needs believers, not traders.**

---

## 2. The chain question

Evidence cuts both ways, and lands on: **stay on Starknet, market chain-agnostically.**

- fxhash caught on entirely *off* Ethereum (Tezos) because low fees + the right ethos beat chain
  size (confirmed) — then later bridged to Ethereum because artists got better prices and
  visibility there (confirmed). Liquidity and visibility do concentrate on Ethereum eventually.
- But the fxhash creative director's stated position matches this project's needs: *"The chain
  doesn't matter. It's the art that matters"* (confirmed) — the generative-art audience is reachable
  cross-chain via content, not via being on their chain.
- Starknet gives this project things Ethereum can't: cheap compute-heavy transactions (the whole
  breathe mechanic), native account abstraction for future onboarding ⚠️, a fully-onchain builder
  scene (Dojo coalition — Cartridge, Realms, Briq, Topology ⚠️) that is the natural local ally
  community, and **Seed Grants: up to $25k STRK, non-dilutive, requiring an MVP + community
  involvement — criteria the project already plausibly meets** (confirmed, starknet.io).
  (Henri: SNF employment → check the conflict-of-interest angle internally before applying.)

---

## 3. Channel list (in priority order)

| Channel | Audience | Play |
|---|---|---|
| **Genart X/Twitter + Right Click Save orbit** | on-chain art collectors | The manifesto (purpose.md is 80% written) as an essay; art-world distribution is essay-driven. Show the living garden, not the mint button |
| **ConwayLife forums / Discord / LifeWiki** | CA enthusiasts | Present as discovery census + leaderboards ("longest transient on a 41×41 torus"); crypto soft-pedaled; seed with a genesis bestiary of canonical patterns and their stories |
| **Starknet ecosystem** (Seed Grant, Dojo/Cartridge communities, SNF channels) | builders, chain-natives | Grant = funding *and* distribution; the fully-onchain-game crowd shares the "everything on-chain" value |
| **Wolfram Institute Community Discord** ⚠️ | CA/math-art | Same census framing; smaller, adjacent |
| **OpenProcessing / p5.js scene** | ~100k creative coders | No-wallet embeddable toy: draw → watch fate → leaderboard; wallet only appears when someone wants to *keep* one |
| **Kids/education** | the 8yo persona | Later tier — needs sponsored/gasless UX first; weekly "discovery of the week" board is the hook |

## 4. Lessons from comparables (one line each)

- **Autoglyphs:** cheap + capped + sincere + zero promises = the position that aged best in the
  entire genre. Confirmed.
- **Art Blocks:** full on-chain permanence is a marquee collector feature (they retrofitted it for
  four years); but don't build for their 2021 market — it's −95%. Confirmed.
- **fxhash:** low cost + open participation + art-over-speculation culture builds a durable
  community on a minor chain; visibility eventually pulls toward Ethereum — have an answer for that
  day (bridged showcase, not necessarily bridged contracts). Confirmed.
- **Cellula:** GoL scales when financialized — and that's precisely the audience this piece doesn't
  want; borrow its recurring-care economics and ecosystem-channel bootstrap, not its framing. ⚠️
- **Verified market reality:** the art-NFT contraction is real and severe at the platform level;
  a small, engaged, participating audience is the honest target. Confirmed (specific magnitudes),
  headline extrapolations refuted.

## 5. Concrete next plays

1. **Starknet Seed Grant application** (MVP live; non-dilutive; doubles as ecosystem distribution).
   Check SNF conflict-of-interest first.
2. **Genesis bestiary content drop** — mint the canonical patterns that fit 41×41 (pulsar,
   pentadecathlon, gliders-as-ships once symmetry detection lands) with their Life-lore stories;
   it's simultaneously CA-community content and genart-collector content.
3. **The essay** — purpose.md reworked for the Right Click Save / genart-essay register: digital
   bacteria, Sandbeest lineage, "burning gas and creating art."
4. **No-wallet share loop** — make /create + fate + leaderboard shareable with zero wallet;
   the wallet appears only at "keep this one alive."
5. **Leaderboards before outreach** — every audience above (CA census culture, high-score kids,
   collectors wanting status) consumes the same feature. Ship boards, then talk.
