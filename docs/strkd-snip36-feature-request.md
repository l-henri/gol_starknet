# Feature request: SNIP-36 proof-carrying invoke in strkd

**For:** the strkd maintainer
**From:** GoL SNIP-36 benchmark work (Claude Code session, 2026-06-09)
**Status:** strkd is *not* failing — this is a missing capability, scoped to one leg of the flow.

---

## TL;DR

**Enrich the existing `wallet_addInvokeTransaction` — do not add a new endpoint.**
Add two optional params, `proof` and `proof_facts`. When present, strkd signs (and, on
`submit:true`, broadcasts) a SNIP-36 proof-carrying `INVOKE_TXN_V3`: the v3 transaction
hash gets the `proof_facts_hash` field appended, and the proof rides along on broadcast.
Absent → byte-for-byte today's behavior. Backward-compatible.

---

## What already works (no change needed)

Running the full SNIP-36 round-trip for a contract that proves Conway's Game-of-Life
generations off-chain, strkd handled **every step it supports**, all auto-approved under
the grant (only funding prompted, as designed):

| Step | strkd method | Result |
|---|---|---|
| Pair | `companion_requestPairing` | ✅ one approval |
| Create account | `companion_createAgentAccount` | ✅ no prompt |
| Fund | `companion_requestFunding` | ✅ prompted (correct) |
| Deploy | `companion_deployAccount` | ✅ no prompt |
| **Sign the virtual `prove_*` tx** | `wallet_addInvokeTransaction` (sign-only) | ✅ no prompt |

The virtual transaction (the one that gets proven off-chain) is a **plain v3 invoke** —
proof facts don't exist yet at sign time — so it needs nothing new. strkd signs it correctly.

## The one gap

The **on-chain verify transaction** is where I had to drop to `sncast`
(`--proof-file` / `--proof-facts-file`). A SNIP-36 verify tx is still an
`INVOKE_TXN_V3`, but it differs from a standard invoke in exactly two ways:

1. **Hash extension.** When proof facts are attached, the v3 transaction hash gains an
   appended `proof_facts_hash` field (see SNIP-36 spec below). The signature must cover
   this extended hash, so **`proof_facts` must be known at sign time**.
2. **Wire payload.** The broadcast must carry the `proof` (base64 stwo proof) and the
   `proof_facts` so the sequencer can verify and the contract can read them via
   `get_execution_info_v3_syscall().tx_info.proof_facts`.

`wallet_addInvokeTransaction` today has no `proof` / `proof_facts` params and signs the
standard (non-extended) hash, so it cannot produce a verify tx the sequencer will accept.

(Today's workaround submits the verify from a *different* account via sncast — only viable
because this particular `verify` has no `msg.sender` check. Many SNIP-36 verifiers will
bind to the caller, so "submit from the agent's own account" is the correct end state.)

## Why enrich, not a new endpoint

- A verify tx **is** a normal `INVOKE_TXN_V3`. Account scoping, `calls`, `nonce`,
  `resource_bounds`, and the sign-only/submit model are all identical to a plain invoke.
- The only deltas are one conditional hash field and two wire fields — a natural fit for
  **optional params that change behavior when present**.
- A new endpoint would duplicate the entire invoke surface to add two fields. More API,
  more drift, no benefit.

## Proposed API change

`wallet_addInvokeTransaction` gains two optional params:

```jsonc
{
  "account_address": "0x...",
  "calls": [ { "contract_address": "0x...", "entry_point_selector": "verify_...", "calldata": [ ... ] } ],
  "nonce": "0x...",
  "resource_bounds": { ... },
  "submit": true,

  // NEW (both optional):
  "proof":       "<base64 stwo proof string>",   // required only for broadcast (submit:true)
  "proof_facts": ["0x...", "0x...", ...]          // required to compute the extended hash
}
```

Behavior:

- **Neither present** → unchanged from today.
- **`proof_facts` present** → compute the v3 hash with the appended `proof_facts_hash`,
  then sign that hash.
  - **sign-only** (submit omitted/false): return `signed_transaction` + `signature` as
    today, and **echo `proof` / `proof_facts`** back so the caller can assemble the
    broadcast. (Signing strictly needs only `proof_facts`; `proof` may be omitted here.)
  - **`submit: true`**: broadcast to strkd's configured node via the SNIP-36 submission
    path, attaching `proof` + `proof_facts`. (`proof` is required in this mode.)

## Implementation notes

- **Hash construction.** `proof_facts_hash` is appended as the final field of the v3
  invoke hash preimage (after `calldata_hash`). Use the SNIP-36 spec as the source of
  truth for the exact preimage; do not hand-roll from this doc. Reference implementations
  that already do it correctly:
  - starknet.js proof-enabled fork: `account.execute(call, { proof, proofFacts })` /
    `getSignedTransaction`.
  - `sncast invoke --proof-file <f> --proof-facts-file <f>` (Starknet Foundry).
  - SNIP-36 spec: https://community.starknet.io/t/snip-36-in-protocol-proof-verification/116123
- **Broadcast target.** Submission needs a node that accepts SNIP-36 verify txs. Confirmed
  working: a Starknet **v0.10** node — `https://sepolia.nodes.starknet.org/rpc/v0_10`
  (spec 0.10.3) accepted the proof-carrying invoke. The standard
  `starknet_addInvokeTransaction` may not carry proof fields on older specs; verify strkd's
  broadcast method/path against a v0.10 node.
- **Payload size.** Proofs are large — ~0.4 MB for a small workload (15 GoL generations)
  and they scale with the proven computation. Ensure the JSON-RPC body size limit on the
  loopback service accommodates multi-MB requests.
- **Approval / grant.** No new approval semantics: this is still an own-account invoke
  (covered by the existing grant). The on-screen prompt could simply note "SNIP-36
  proof-carrying" and show the verify selector + contract.
- **Scoping unchanged.** Still restricted to the agent's own accounts.

## Acceptance test

End-to-end with no sncast, all through strkd:

1. `wallet_addInvokeTransaction` (sign-only) the virtual `prove_*` tx → prove off-chain
   (Dinner) → obtain `{ proof, proof_facts }`. *(works today)*
2. `wallet_addInvokeTransaction` with `proof` + `proof_facts`, `submit:true`, calling the
   on-chain `verify_*` from the **agent's own account** → tx accepted, contract state
   updated. *(the new capability)*

Reference values from the working round-trip (Sepolia):
- Bench contract: `0x0057ac40958e78244ba405fcbf4ba37e20af65c45ad8c305bf61d3d211a6eb99`
- `verify_move_forward` selector: `0x01d694d70719a271820c999b1dac13d83ef6efd63869fe927821d53adf6b1f74`
- Working verify tx (via sncast, n=15): `0x067131d875a57ac3dc3fc9f30b157ef9f89e5ef90aec7745312ccf14298c0857`
