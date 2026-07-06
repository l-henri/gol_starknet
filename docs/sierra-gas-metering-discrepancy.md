# Gas discrepancy by account class — Sierra-gas vs Cairo-steps metering

**Status:** root cause confirmed empirically **and from blockifier source** (open question #1 resolved 2026-06-30).
**Date of investigation:** 2026-06-30 (Sepolia).
**Why this doc exists:** a fork-off briefing so a fresh session can pick up the deep dive with full context. Canonical short record lives in memory `gol-feed-gas-cap.md`.

---

## TL;DR

The same on-chain action (`move_lifeform_forward_n` on the same creature, same `n`) costs **~4.6–5.3× more L2 gas** when sent from one account vs another. It is **not** the pattern, **not** density, **not** a broken `estimateFee`, **not** account-validation overhead.

**Cause:** Starknet meters execution in one of two modes — modern **Sierra-gas** or legacy **Cairo-steps**. Which mode applies is fixed by the **sender account class's Sierra version** and is **inherited down the entire call stack**. Account classes at **Sierra ≥ 1.7.0** get Sierra-gas; older classes get Cairo-steps. For our compute-heavy bitboard stepper, Cairo-steps pricing is ~5× more expensive per generation. This split only exists since **Starknet v0.13.4** (Sepolia ~end Feb 2025, mainnet ~end Mar 2025).

**Practical upshot:** wallets still defaulting users to a pre-2025 account class (Sierra 1.5.0) pay ~5×. Upgrading the account class (or using a wallet on a ≥1.7.0 class) cuts feed/mint gas ~5×.

---

## The call under test

- **Contract** (lifeforms / forward): `0x40380471b403f52ac0ed6e674b391de268f83a8a1778d236bb7acc090c4e633`
- **Entrypoint**: `move_lifeform_forward_n(token_id: u256, n: felt)` — selector `0x2672d0b682e3d8132d1ca79ed59fd21fd8f9b956aa445fe186cdbcc423d6305`
- It reads the lifeform state, steps the GoL grid `n` times (pure compute, the SWAR bitboard stepper), writes the new state, and mints `n` NUT to the caller.
- **Creature used throughout** (token_id `u256`): `0x3c332ebfb065d0671c845f96e60b96b840c5b35674fd1f6764b55f1202178c1`
  - low `0x840c5b35674fd1f6764b55f1202178c1`, high `0x3c332ebfb065d0671c845f96e60b96b`
  - calldata for a feed of `n`: `[low, high, n]`

Per-generation step gas is **pattern/density-independent** (proven earlier via still-life experiment: 4→324 live cells all step at the same per-gen cost — see `crates/gol-sdk/examples/density_probe.rs`). So the only variable across the experiments below is the **sender account**.

---

## Accounts tested (Sepolia)

| Role | Address | Account class hash | Sierra ver | Tier |
|---|---|---|---|---|
| Agent / strkd | `0x026d87a881bc82eb038c4cc214fbccd16ea72b424b523a7b2b2551a2e495e70f` | `0x1d1777db36cdd06dd62cfde77b1b6ae06412af95d57a13dc40ac77b8a702381` | **1.7.0** | MODERN |
| Ready (user main) | `0x46e460252f57769cfeb9e82c1426e9a8c253b5b9fdc2b07c27dee8820eebcdf` | `0x36078334509b514626504edc9fb252328d1a240e4e948bef8d0c08dff45927f` (Argent) | **1.5.0** | LEGACY |
| Xverse | `0x02fb9215c05d452a8989bfc6b5a02803923712cc293a6fd03fa016c1fb2352a7` | `0x663fc01a0dbe1bacc4cd2a4c856eb9784b255a20988aa33d4d52b6fc20bd024` | **1.5.0** | LEGACY (predicted; not yet fed) |
| Argent #2 | `0x05e99526E0cEDC097dAc0E28b7f93A7840A091cb69e76e919A1C8551abA03a38` | `0x36078334…` (same as Ready) | **1.5.0** | LEGACY |
| Argent #3 | `0x070DFe05c9592dA04fBf346C7a29A02B12609564134099bbD9B7C9fA7b37d322` | `0x36078334…` (same as Ready) | **1.5.0** | LEGACY |
| New Argent/Ready | `0x039dee6801c02a64c79763bdf1e87d8e2b901b161a768eda101492f524be85f7` | `0x3957f9f5a1cbfe918cedc2015c85200ca51a5f7506ecb6de98a5207b759bf8a` | **1.7.0** | MODERN (measured cheap) |

The old Argent class `0x36078334…` was **first declared on Sepolia at block 71,009, 2024-06-03 09:03:59 UTC** — ~10 months before the v0.13.4 upgrade, hence stuck on legacy metering.

---

## Raw measurements (`l2_gas`, same creature)

| n | Agent OZ-style `1.7.0` | Ready Argent `1.5.0` | New Argent `1.7.0` |
|---|---|---|---|
| 1 | 6,138,960 | 14,598,720 | — |
| 10 | 30,350,311 | 140,160,720 | **30,321,241** |
| 60 | 161,920,261 | 835,118,720 | — |

Ratio (Ready/Agent): n=1 → 2.38×, n=10 → 4.62×, n=60 → 5.16× (climbs with n).

**Transaction hashes** (Voyager: `https://sepolia.voyager.online/tx/<hash>`):
- Agent n=1 `0x45f87efe60d2218011015a51b22bb9aa95f3abc0956abbcdce4df7910b3dbe9`
- Agent n=10 `0x7a98a2b0f258e6cb9e4ec2360405ad11c52d30647ab0046af85355f66b1d7d5`
- Agent n=60 `0x3cefb93f9719d8c02ac1928791b196bb64271ffd85b0959a0eaf2d4c8eb18b3`
- Ready n=1 `0x505f2f7932de9da719d33b9a39a33a4048bc1f70422702b74cc7d3232065925`
- Ready n=10 `0x585431fdd46589b1acf5c29a512392051bb7430f33be20ed287c957a6745907`
- Ready n=60 `0x03825fc82090bc61f64e990ed1c0376f7b4dbe5bc534c27e667a0f274fc425d2`
- New-Argent n=10 `0x373f4bfdd8a8d84361ece7cd9149ac48c506dd75a48d00262a8fe510303df6e`

> NOTE on the `MoveForward` event: its 3rd field is the **cumulative generation** the creature reaches, not the call's `n`. Both Ready n=10 and Agent n=10 used calldata `n=0xa`; the event reading `0x14` after the agent call just means the creature went from gen 10 → 20. Gas ÷ n confirms 10 steps, not 20.

---

## Analysis 1 — it's a per-step multiplier, not fixed overhead

Fit `gas(n) = F + n·S`:

| Account | Fixed `F` | Per-step `S` |
|---|---|---|
| Agent (1.7.0) | ~3.72M | **2.637M / gen** |
| Ready (1.5.0) | ~0.89M | **13.904M / gen** |

- Per-step ratio `S_ready / S_agent ≈ 5.27×`.
- Fixed terms are tiny and the legacy one is *smaller* — so it is NOT account validation/wrapper overhead.
- The ratio **climbs with n** (2.38 → 4.62 → 5.16×), the signature of a per-step multiplier (fixed overhead would make the ratio *shrink* toward 1).

## Analysis 2 — the gap lives inside the inner compute call (trace, n=60)

`starknet_traceTransaction` per-invocation `l2_gas`:

| Invocation | Agent (1.7.0) | Ready (1.5.0) | ratio |
|---|---|---|---|
| `__validate__` | 81,805 | 320,000 | 3.9× |
| `__execute__` (total) | 160,771,376 | 835,057,280 | 5.20× |
| └ inner `move_lifeform_forward_n` | **160,629,706** | **835,026,560** | **5.20×** |
| &nbsp;&nbsp;└ nested NUT mint | 406,930 | 400,960 | 1.00× |
| `fee_transfer` | 371,360 | 371,360 | 1.00× |

The 5.2× is **entirely** in the inner stepping call. The nested NUT mint (storage/syscall-bound) and the fee transfer are identical to the felt — exactly where the two metering modes price the same. Only pure compute diverges.

## Analysis 3 — the determinant is the account's Sierra version

`getClass(account_class).sierra_program[0:3]` = version felts:
- Agent class `0x1d1777db…` → **1.7.0** → cheap.
- New Argent class `0x3957f9f5…` → **1.7.0** → cheap (`30,321,241` ≈ agent's `30,350,311`, within 0.1%, despite being a *different* class and a different vendor family).
- Old Argent `0x36078334…` + Xverse `0x663fc01a…` → **1.5.0** → expensive.

Four distinct class hashes sort cleanly into two buckets by Sierra version alone. Vendor and class size are irrelevant (the "big 30k-felt Argent class" idea from earlier was a red herring).

---

## Mechanism (confirmed from blockifier source)

Starknet's blockifier tracks each call's resource as either `SierraGas` or `CairoSteps` (`tracked_resource`). The mode is decided by the contract's Sierra version and **inherited from the top of the call stack** — an inner call is metered in Sierra-gas only if it *and* its caller chain are all Sierra-gas-capable. Because the **account** sits at the top of the stack:

- Modern account (Sierra ≥ 1.7.0) → whole tree metered in Sierra-gas → cheap.
- Legacy account (Sierra < 1.7.0) → Cairo-steps forced onto the entire tree, **including the modern GoL contract** → expensive.

For compute-heavy code (lots of VM steps, few syscalls) the Cairo-steps→gas conversion is ~5× the Sierra-gas price; for syscall/storage-bound code (NUT mint, fee transfer) the two are ~equal. That matches the trace exactly.

### Confirmed vs. unconfirmed
- **Confirmed (receipts + traces):** gas sorts by Sierra version; the gap is per-step and lives in the inner compute call; magnitude ~5.2×.
- **Documented:** v0.13.4 introduced L2/Sierra-gas metering and the Sierra-1.7.0 (= Cairo 2.10.0) threshold for the modern execution path. Sources: Starknet v0.13.4 pre-release notes; docs version notes; Cairo v2.10.0 announcement.
- **Confirmed from blockifier source (2026-06-30):** the exact `tracked_resource` rule, the 1.7.0 cutoff, and the sticky-downgrade inheritance — see below.

### Source confirmation — open question #1 RESOLVED

Read from `starkware-libs/sequencer` (paths/lines are `main` HEAD at fetch time; behaviour matches deployed v0.13.4+).

**1. The cutoff is a versioned constant, value `1.7.0`, introduced exactly at v0.13.4.**
`min_sierra_version_for_sierra_gas` in `crates/blockifier/resources/blockifier_versioned_constants_*.json`:
`0_13_0`…`0_13_3` = `"100.0.0"` (unreachable → everything CairoSteps); `0_13_4` through `0_14_4` = `"1.7.0"`. The diff-regression file `versioned_constants_diff_regression/0.13.3_0.13.4.txt` shows the single change `min_sierra_version_for_sierra_gas: "1.7.0"`. So the flip is precisely at 0.13.4, not gradual.

**2. Per-contract preference: `min_sierra ≤ contract.sierra_version` → SierraGas, else CairoSteps** (`≤`, so 1.7.0 itself qualifies). `crates/blockifier/src/execution/contract_class.rs` (`CompiledClassV1::tracked_resource`):
```rust
pub fn tracked_resource(&self, min_sierra_version: &SierraVersion) -> TrackedResource {
    if *min_sierra_version <= self.sierra_version { TrackedResource::SierraGas }
    else { TrackedResource::CairoSteps }
}
```

**3. The inheritance rule is a sticky downgrade ("once CairoSteps, always CairoSteps for nested calls"), NOT a generic min — and it keys off the immediate caller, not specifically the account.** `RunnableCompiledClass::tracked_resource` in the same file:
```rust
match last_tracked_resource {
    // Once we ran with CairoSteps, we will continue to run using it for all nested calls.
    Some(TrackedResource::CairoSteps) => TrackedResource::CairoSteps,
    Some(TrackedResource::SierraGas) | None => contract_tracked_resource,
}
```
`last_tracked_resource` is `context.tracked_resource_stack.last()` (`get_current_tracked_resource`). Each call computes its mode, pushes it, runs, pops (`execution_utils.rs::execute_entry_point_call_wrapper`). So a `CairoSteps` frame forces every descendant to `CairoSteps` regardless of their own Sierra version; a `SierraGas` frame lets each child pick its own. The **account is just the top frame** that seeds the stack — which is why a legacy account poisons the whole tree. This already largely answers open question #2: it is *any* caller in the chain, not the account specifically (an empirical legacy-intermediary test would still confirm the edge case, but the source says a legacy intermediary would force its subtree too).

**4. The two modes diverge in how gas is charged** (`entry_point_execution.rs::finalize_execution` / `get_call_result`):
- `SierraGas`: `gas_consumed = initial_gas − remaining_gas` (the compiler's `withdraw_gas` instrumentation); raw VM step/builtin resources are **zeroed** (`ExtendedExecutionResources::default()`).
- `CairoSteps`: `gas_consumed = 0` (Sierra counter ignored; `initial_gas` is set to `infinite_gas_for_vm_mode()` so `withdraw_gas` never trips); the **actual measured VM steps + builtins** are recorded and later converted to L2 gas via the step/builtin cost table.

  So the ~5× is: real VM steps × the Cairo-steps→L2-gas price overcharges compute-heavy code relative to the compiler's Sierra-gas model. Syscall/storage-bound calls (NUT mint, fee_transfer) are charged the same in both modes because their cost is dominated by syscall gas, not VM steps — exactly the trace pattern in Analysis 2.

**5. Native vs Sierra-gas metering are SEPARATE, ordered gates** (the explicit sub-question). There is **no** `min_sierra_version_for_native` versioned constant. Cairo-native execution is *subordinate* to the metering mode: `execution_utils.rs` (V1Native branch) runs the native artifact **only if** the current `tracked_resource` is `SierraGas`; if a legacy caller has forced `CairoSteps`, even a native-capable class falls back to the VM/casm path — *"We cannot run native with cairo steps as the tracked resources (it's a vm resource)."* So Sierra-gas metering (gated on the 1.7.0 constant) is the prerequisite; whether a native artifact then runs is a downstream config/contract-manager decision, not a second Sierra-version threshold.

---

## Open questions / next experiments for the fork

1. ~~**Read the blockifier source.**~~ **RESOLVED 2026-06-30** — see "Source confirmation" above. Constant `min_sierra_version_for_sierra_gas = "1.7.0"` (from v0.13.4); per-contract test is `min ≤ sierra_version` (≤, inclusive); inheritance is a *sticky downgrade* off the immediate caller, not a generic min; native execution is a separate downstream gate subordinate to Sierra-gas metering (no own version threshold).
2. **Account vs. any top-of-stack contract.** Source says it's the *immediate caller* on the `tracked_resource_stack`, not the account specifically — a `CairoSteps` frame forces its whole subtree (#3 in source confirmation). The account just seeds the stack. **Still worth an empirical check:** modern account → legacy intermediary contract → GoL should meter the inner GoL call in CairoSteps (predicts ~5×); the reverse (legacy account → modern intermediary → GoL) should stay CairoSteps throughout (sticky). Confirms the edge from the deployed sequencer, not just HEAD source.
3. **Does an in-place class upgrade fix it?** Upgrade the Ready/Argent account to a Sierra ≥1.7.0 class and re-feed — confirm it flips to ~3M/gen end-to-end.
4. **Quantify the conversion.** Get raw step counts (older RPC trace shape, or local `cairo-vm`/`blockifier` run) and compute effective gas/step in each mode for the identical inner execution.
5. **Is 5.27× workload-specific?** It depends on the builtin/step mix. Try another compute-heavy contract to see whether the multiplier is constant or varies with the resource profile.
6. **Mainnet parity.** Same behavior on mainnet? (Versioned constants should match.)
7. **Product implication.** Feeding/minting costs ~5× depending on the user's wallet class. Options to explore: surface the tier in-app (already done — see `ui/game-of-life/src/lib/gasCaps.ts`), nudge a class upgrade, or sponsor via a paymaster/outside-execution so the cost is uniform.

---

## Tooling

- **RPC** (CORS-enabled, supports `starknet_traceTransaction` + `getClass`): `https://api.cartridge.gg/x/starknet/sepolia`
- **Probe scripts** (copied next to this doc, in `docs/gas-probes/`):
  - `trace.py <txA> <txB>` — per-invocation `l2_gas` breakdown of two txs (validate / execute / inner / nested / fee_transfer).
  - `probe.py` — dumps `tracked_resource` (if the node populates it) + each account's class Sierra version. Edit the tx/account constants at the top.
  - `declblock.py` — binary-searches the first block where a class resolves, prints the declaration block + UTC timestamp. Edit `CLS` at the top.
  - Run with plain `python3 docs/gas-probes/trace.py …` (stdlib only, no deps).
- **Agent-side transactions**: the local **strkd** wallet companion (see memory `gol-tx-tooling.md`) — pair `claude-code-gol` with `reattach:true`; agent account `0x026d87…e70f`. Note strkd's loopback port can change between launches (was 50099, then 49163 — discover via `lsof -nP -iTCP -sTCP:LISTEN | grep strkd`).

## Repo & memory pointers
- GoL stepper / engine (off-chain faithful port): `crates/gol-sdk/src/grid.rs` (`step`), `crates/gol-sdk/src/engine.rs`.
- Density-independence proof tool: `crates/gol-sdk/examples/density_probe.rs`.
- Per-wallet cap sizing already shipped from this finding: `ui/game-of-life/src/lib/gasCaps.ts` (+ `wallet.tsx` tier detection, `useMint.ts`, the feed slider in `life/[id]/page.tsx`).
- Memory: `gol-feed-gas-cap.md` (canonical), `gol-mint-gas-limit.md`, `gol-incubator-partial-paths.md`, `gol-tx-tooling.md`.
