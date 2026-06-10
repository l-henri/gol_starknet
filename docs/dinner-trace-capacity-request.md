# Request to the Dinner maintainer: raise (or auto-size) the prover trace capacity

## Problem

Proving an INVOKE that runs N Conway's-Life generations (`iterate_life_several_in_place`) fails
for **N ≥ 44** with:

```
prover failed: Proving task failed to join: task 253 panicked with message "Not enough twiddles!"
```

- N ≤ 43 proves fine (~32–40 s, ~408 KB proof). N ≥ 44 fails fast (~16–24 s, during setup).
- The **same computation runs on-chain up to N=170** (the 1.2e9 L2-gas/tx cap; confirmed by a real
  Sepolia tx). So the workload is valid — the limit is the local prover's **trace capacity**, and
  it bites well below what the production prover handles.

## Diagnosis (confident on cause)

`"Not enough twiddles!"` is a stwo / stwo-cairo error: the prover precomputes circle-FFT twiddle
factors for a fixed maximum trace size (max `log_n_rows`, i.e. a 2^k-row evaluation domain). When
the AIR trace exceeds 2^k rows, the FFT step runs out of precomputed twiddles and panics. The
trace grows with the proven execution's step count, so past ~43 generations the SNOS trace crosses
the configured 2^k boundary.

## Suggested fix (confident on direction)

1. **Raise the max trace log-size / twiddle precompute** in the prover config (the `max_log_n_rows`
   / domain-size parameter in the stwo-cairo setup). A few extra powers of two should push the
   ceiling past 170 toward the balance limit. RAM scales ~linearly with 2^k — size it to the ~18 GB
   budget.
2. **Better: derive the twiddle tree size from the actual trace log-size** (compute twiddles up to
   the trace's domain) instead of a hardcoded max, so it auto-fits any workload up to RAM.
3. **Fail clearly** when the trace exceeds the configured max — e.g. `trace log2=X exceeds prover
   max=Y; raise max_log_n_rows` — instead of the raw `"Not enough twiddles!"` panic. Reporting the
   trace log-size on success would also let callers predict the ceiling.

(Exact symbol names are for you to locate in the stwo-cairo build; the cause — twiddle domain
smaller than the trace — and the direction are what I'm confident about.)

## Optional

Expose the configured max trace log-size on `/health` (next to `prover_ready`) so a client can
predict the per-tx generation ceiling before submitting.

## Repro

Submit a signed INVOKE_v3 calling `prove_move_forward_n(start_state, N)` on
`0x0057ac40958e78244ba405fcbf4ba37e20af65c45ad8c305bf61d3d211a6eb99` (Sepolia) via `/v1/prove`
(`network: testnet`). N=43 succeeds; N=44 panics. Binary search: ✅ 15/35/40/43 · ❌ 44/45/56/97/150.
