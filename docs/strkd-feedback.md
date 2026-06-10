# strkd feedback (from heavy agent use, 2026-06-09/10)

Context: ran a full SNIP-36 benchmark through strkd — pair, create, fund, deploy, sign-only,
and submit:true invoke (incl. a 1.085e9-gas tx). Everything worked; the grant auto-approval is
great. Five precise improvements, roughly by impact:

1. **SNIP-36 proof-carrying invoke** (the one hard blocker). `wallet_addInvokeTransaction` can't
   sign/broadcast a verify tx — no `proof`/`proof_facts` params, no `proof_facts_hash` hash
   extension. Forced a drop to sncast. Full spec in `strkd-snip36-feature-request.md` (enrich the
   existing method; no new endpoint).

2. **Sign-only gives no fee help.** With submit:true the node auto-fills bounds, but **sign-only
   forces me to hand-compute `resource_bounds` for all three gas tracks**. That caused 3 avoidable
   failures: l1_gas amount too low (`5000 vs 32284 used`), then l1 *price* too low after an L1
   spike (`110e12 < 1.40e15 actual`). Fix: a `companion_estimateFee` (or `estimate_bounds:true`
   on addInvoke) that returns suggested bounds from the configured node even when I'll sign-only /
   broadcast elsewhere. (Make it opt-in — SNIP-36 virtual txs with private calldata must *not* be
   estimated online.)

3. **Sign-only should return a ready-to-broadcast tx.** Today it returns a partial
   `signed_transaction` ({calldata, nonce, sender_address, type, version}) plus `signature` and
   `resource_bounds` with **mixed int/string typing**. I had to hand-assemble `tip`,
   `paymaster_data`, `account_deployment_data`, both DA modes, and hex-normalize the bounds into a
   valid `INVOKE_TXN_V3`. Returning a complete, RPC-conformant signed tx object (canonical hex)
   would remove that and the class of bugs around it.

4. **Re-pairing strands prior accounts/funds.** A new pairing = new `client_id` with empty scope;
   it can't see or sweep accounts created under a previous pairing. I stranded STRK twice across
   port changes. Offer a stable client identity (or recovery/re-attach) so a re-paired agent keeps
   its accounts, or a sweep path back to the manager.

5. **Expose grant state.** Docs say "you can't tell from the API whether a grant is active." A
   `grant: {active, expires_at, scope}` field on `companion_getStatus` lets a client know whether
   to expect prompts (and batch around them) instead of discovering it via a 113 timeout.
