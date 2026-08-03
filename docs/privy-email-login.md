# Email login (Privy) + sponsored gas (AVNU paymaster)

**Status: LIVE-VERIFIED 2026-08-03 (local dev against mainnet)** — Henri completed the full
flow with real Privy + AVNU credentials: email OTP → wallet creation → sponsored account
deploy → breathe (Privy-signed, AVNU-sponsored, NUT landed). Still unverified: the
sponsorship-cap refusal in a real client flow (proxy-level refusal tested by hand), mints,
and FEED_CAP under the paymaster path. The email door stays dormant on any deployment
until the env vars below are set — production needs them added in Vercel.

## What it is

A second door into the garden, next to the injected-wallet connect: **continue with email**.
The visitor gets a real Starknet account (ArgentX v0.5.0 class) whose key lives in Privy's
infrastructure; signing is a server round-trip, gas rides the AVNU paymaster (SNIP-29
outside-execution), and the account deploys itself — sponsored — on first login. No extension,
no seed phrase, no STRK.

Design decisions (Henri, 2026-08-03): mainnet directly; sponsor **everything** (deploy +
breaths + offerings + mints) behind a **per-account cap**; email promoted over wallet connect
in the chooser; injected wallets keep paying their own gas.

## Architecture

```
browser                                server (Next.js API routes)         third parties
───────                                ───────────────────────────         ─────────────
Privy email OTP  ──────────────────────────────────────────────────────►  Privy auth
  │ access token
  ├─► POST /api/privy/wallet  ── verify token, find-or-create ─────────►  Privy wallet API
  │      { walletId, publicKey }        (chain_type: "starknet",
  │                                      owner: the verified user)
  ├─ starkzap onboard (accountPreset argentXV050, deploy if_needed)
  │      │ tx hash to sign
  │      └─► POST /api/privy/sign ── verify token + WALLET OWNERSHIP ──►  Privy rawSign
  │             { signature }            (the security boundary)
  └─ SNIP-29 paymaster JSON-RPC
         └─► POST /api/paymaster ── nonce-based sponsorship cap ───────►  AVNU paymaster
                                        (x-paymaster-api-key attached        (mainnet:
                                         server-side)                    starknet.paymaster.avnu.fi)
```

- **Client**: `src/lib/privyAuth.tsx` (Privy auth island — `PrivyProvider` wraps only a
  bridge component, not the app; dynamic-imported so the SDK ships only when configured),
  `src/lib/privyWallet.ts` (starkzap onboarding; lazy chunk), `src/lib/wallet.tsx` (dual
  backend behind the same `WalletCtx` — every existing `connect()`/`execute()` call site
  works unchanged; a chooser modal offers the two doors, email promoted).
- **Server**: `src/lib/privyServer.ts` + `app/api/privy/{wallet,sign}` +
  `app/api/paymaster`. The sign route **must** check the wallet belongs to the verified
  user — an open raw-sign proxy would sign for anyone.
- **Sponsorship cap without a database**: an account's **nonce is its lifetime tx count**,
  read from the chain in the paymaster proxy. `nonce >= SPONSORED_TX_CAP` → sponsorship
  refused with a clear message (the account is a normal ArgentX account; funding it with
  STRK lets the keeper continue at their own expense). Deployments (nonce 0) always pass.
- **RPC specs**: starkzap embeds starknet.js 9 (RPC 0.9) — the `/api/rpc` proxy gained
  `?spec=v9` beside the existing default (v0.10, WASM SDK) and `?spec=compat` (v0.8,
  starknet.js 7).
- **Optional peers**: starkzap/Privy lazily import bridge/Solana/farcaster deps we don't
  install; `next.config.ts` IgnorePlugins them (their own loaders throw friendly errors if
  those paths are ever hit).

## Setup (to go live)

1. **Privy** (dashboard.privy.io): create an app, enable **Email** login. Collect: App ID →
   `NEXT_PUBLIC_PRIVY_APP_ID` and App secret → `PRIVY_APP_SECRET`. That's all — access
   tokens are verified against the app's public JWKS endpoint automatically
   (`PRIVY_VERIFICATION_KEY` is an optional override that saves the cached JWKS fetch; the
   key lives on the dashboard's Settings page if ever wanted). Starknet wallets are Tier-2
   (raw sign) — no extra dashboard config needed; wallets are created server-side owned by
   the user.
2. **AVNU** (portal): create a paymaster account, fund it with credits, get an API key →
   `PAYMASTER_API_KEY`. Sponsored mode is refused without it.
3. Set the vars in `.env.local` / Vercel (see `ui/game-of-life/.env.local.example`), redeploy.
   With `NEXT_PUBLIC_PRIVY_APP_ID` unset the email door simply doesn't exist — connect
   behaves exactly as before.
4. Tune `SPONSORED_TX_CAP` (default 25 tx per account, lifetime).

## Verification state

- `next build` ✅ (types + lint). **Live-verified 2026-08-03** (local dev, mainnet, real
  credentials): email OTP → wallet find-or-create → sponsored account deploy → breathe
  (raw-sign 200 + sponsored execute; NUT + generation counter landed in the UI). The cap
  refusal was exercised at the proxy level by hand (temporary cap 5 vs a nonce-10 account)
  but not through a real client hitting its limit. Two hard-won integration lessons live in
  the LOG (2026-08-03 (2)): Privy wallets must be APP-MANAGED (`external_id` mapping), not
  user-OWNED — owner key-quorums demand a third-party-JWT authorization flow; and starkzap's
  optional peers must be ALIASED to a stub, not IgnorePlugin'd (ignored modules throw at
  load, killing the root import). Upstream fix PR:
  https://github.com/keep-starknet-strange/starkzap/pull/136 — drop `optional-peer-stub.cjs`
  when a release containing it ships.
- **Perceived latency**: an email breathe ≈ paymaster build + Privy raw-sign round-trip
  (~1.5 s) + sponsored execute — noticeably slower than a wallet popup path; acceptable,
  optimizable later (parallel build/sign, token caching).
- **Gas-cap caveat**: feed/mint sizing (`gasCaps.ts`) was measured for direct account
  execution; the paymaster path goes through SNIP-9 outside-execution on an ArgentX v0.5.0
  account (Sierra ≥ 1.7 → modern tier expected). Re-measure a real sponsored feed before
  trusting FEED_CAP for email keepers.
- **Cost caveat**: every email keeper's act spends AVNU credits — watch the portal balance;
  the cap bounds per-account exposure, not total.

## Known trade-offs

- The keeper's key is held by Privy (custodial-ish) — at odds with "independent of you" for
  collectors, which is why the injected-wallet door stays first-class.
- starkzap is young (v3.0.0, keep-starknet-strange) and pins starknet.js 9 with an avnu-sdk
  peer warning; it's isolated to the email lazy chunk.
- Mint costs NUT the new keeper doesn't have — unchanged economics; email keepers earn NUT
  by breathing first, exactly like wallet users.
