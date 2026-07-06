//! Write call-builders for v2. Each method builds composable [`Call`]s (mint flows return the
//! `[approve, mint]` multicall); nothing is signed or sent until a `Submitter` takes them.
//!
//! v2: the state is a 7-felt [`GridState`] (not a `u256`), the ERC-721 `token_id` is a Poseidon
//! hash, and `set_render_params` is new. Minting charges the caller `sequence_length` NUT — for a
//! loop that's `loop_length`, for a path `length_to_loop_entrypoint` (matching the v1 economy).

use crate::config::GolAddresses;
use crate::encoding::selector;
use crate::grid::{step, token_hash, GridState, Rows};
use crate::types::{Call, Felt, RenderParams, U256};

/// Which minter a partial-path call targets (both expose the same partial-path entry points).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Minter {
    Loop,
    Path,
}

/// One transaction in a mint plan: a multicall the wallet signs + sends as a single tx.
#[derive(Clone, Debug)]
pub struct MintStep {
    pub label: String,
    pub calls: Vec<Call>,
}

/// The full transaction sequence to mint a loop (see [`GolWrites::plan_loop_mint`]).
#[derive(Clone, Debug)]
pub struct MintPlan {
    pub steps: Vec<MintStep>,
    pub tx_count: u32,
    /// True when the loop fits a single `mint_loop` tx (no partial paths needed).
    pub single_shot: bool,
    /// True when the plan needs more than `max_tx` transactions (caller should refuse).
    pub too_long: bool,
}

pub struct GolWrites<'a> {
    addresses: &'a GolAddresses,
    nut_decimals: u32,
}

impl<'a> GolWrites<'a> {
    pub fn new(addresses: &'a GolAddresses, nut_decimals: u32) -> Self {
        Self { addresses, nut_decimals }
    }

    /// `nutrient.approve(spender, amount)`.
    pub fn approve_nut(&self, spender: Felt, amount: U256) -> Call {
        let mut calldata = vec![spender];
        calldata.extend_from_slice(&amount.to_calldata());
        Call {
            to: self.addresses.nutrient,
            selector: selector("approve"),
            calldata,
        }
    }

    /// `[approve(loop_length NUT → lifeforms), loop_minter.mint_loop(loop_state, loop_length, recipient)]`.
    /// `loop_state` must be the loop's canonical (smallest) state — see
    /// [`crate::engine::is_single_loop_and_entrypoint_is_smallest`].
    pub fn mint_loop(&self, loop_state: &GridState, loop_length: u32, recipient: Felt) -> Vec<Call> {
        let approve = self
            .approve_nut(self.addresses.lifeforms, nut_cost_for_loop(loop_length, self.nut_decimals));
        let mut calldata = loop_state.to_calldata().to_vec();
        calldata.push(Felt::from(loop_length));
        calldata.push(recipient);
        vec![
            approve,
            Call { to: self.addresses.loop_minter, selector: selector("mint_loop"), calldata },
        ]
    }

    /// `[approve(length_to_loop NUT → lifeforms), path_minter.mint_path(path_start,
    /// length_to_loop_entrypoint, loop_length, recipient)]`.
    pub fn mint_path(
        &self,
        path_start: &GridState,
        length_to_loop_entrypoint: u32,
        loop_length: u32,
        recipient: Felt,
    ) -> Vec<Call> {
        // Paths escrow NUT into the PATH NFT (not the loop lifeforms) — that contract charges + holds it.
        let approve = self.approve_nut(
            self.addresses.path_lifeforms,
            nut_cost_for_path(length_to_loop_entrypoint, self.nut_decimals),
        );
        let mut calldata = path_start.to_calldata().to_vec();
        calldata.push(Felt::from(length_to_loop_entrypoint));
        calldata.push(Felt::from(loop_length));
        calldata.push(recipient);
        vec![
            approve,
            Call { to: self.addresses.path_minter, selector: selector("mint_path"), calldata },
        ]
    }

    /// `minter.mint_partial_path(path_start, path_length, trigger_state)` — registers a segment
    /// (no NUT, no NFT; assembled later via [`Self::combine_partial_path`] + a `*_from_partial_paths`).
    pub fn mint_partial_path(
        &self,
        minter: Minter,
        path_start: &GridState,
        path_length: u32,
        trigger_state: &GridState,
    ) -> Call {
        let mut calldata = path_start.to_calldata().to_vec();
        calldata.push(Felt::from(path_length));
        calldata.extend_from_slice(&trigger_state.to_calldata());
        Call {
            to: self.minter_addr(minter),
            selector: selector("mint_partial_path"),
            calldata,
        }
    }

    /// `minter.combine_partial_path(id1, id2)` — the ids are `token_hash` felts of the segments.
    pub fn combine_partial_path(&self, minter: Minter, id1: Felt, id2: Felt) -> Call {
        Call {
            to: self.minter_addr(minter),
            selector: selector("combine_partial_path"),
            calldata: vec![id1, id2],
        }
    }

    /// `[approve(sequence_length NUT → lifeforms), loop_minter.mint_loop_from_partial_paths(loop_state,
    /// recipient)]`. `sequence_length` is the assembled loop's length (the registered segment's length).
    pub fn mint_loop_from_partial_paths(
        &self,
        loop_state: &GridState,
        sequence_length: u32,
        recipient: Felt,
    ) -> Vec<Call> {
        let approve =
            self.approve_nut(self.addresses.lifeforms, unit_cost(sequence_length, self.nut_decimals));
        let mut calldata = loop_state.to_calldata().to_vec();
        calldata.push(recipient);
        vec![
            approve,
            Call {
                to: self.addresses.loop_minter,
                selector: selector("mint_loop_from_partial_paths"),
                calldata,
            },
        ]
    }

    /// `[approve(sequence_length NUT → lifeforms), path_minter.mint_path_from_partial_paths(path_start,
    /// recipient)]`.
    pub fn mint_path_from_partial_paths(
        &self,
        path_start: &GridState,
        sequence_length: u32,
        recipient: Felt,
    ) -> Vec<Call> {
        let approve = self
            .approve_nut(self.addresses.path_lifeforms, unit_cost(sequence_length, self.nut_decimals));
        let mut calldata = path_start.to_calldata().to_vec();
        calldata.push(recipient);
        vec![
            approve,
            Call {
                to: self.addresses.path_minter,
                selector: selector("mint_path_from_partial_paths"),
                calldata,
            },
        ]
    }

    /// `path_lifeforms.set_render_params(token_id, bg, cell, speed)` — owner-only (path NFT).
    pub fn set_path_render_params(&self, token_id: U256, params: RenderParams) -> Call {
        let mut calldata = token_id.to_calldata().to_vec();
        calldata.push(Felt::from(params.bg));
        calldata.push(Felt::from(params.cell));
        calldata.push(Felt::from(params.speed));
        Call {
            to: self.addresses.path_lifeforms,
            selector: selector("set_render_params"),
            calldata,
        }
    }

    /// `path_lifeforms.challenge_burn(older_id, younger_id, d4, dr, dc)` — permissionless
    /// anti-farm/anti-copy: burns `younger` iff it is a forward sub-path OR symmetry copy of the
    /// strictly older `older` (witness `(d4, dr, dc)`; `(0,0,0)` = the plain sub-path rule; the
    /// step offset is implied by the length gap). Pays `younger`'s escrow to the caller.
    pub fn challenge_burn(&self, older_id: U256, younger_id: U256, d4: u8, dr: u8, dc: u8) -> Call {
        let mut calldata = older_id.to_calldata().to_vec();
        calldata.extend_from_slice(&younger_id.to_calldata());
        calldata.push(Felt::from(d4));
        calldata.push(Felt::from(dr));
        calldata.push(Felt::from(dc));
        Call {
            to: self.addresses.path_lifeforms,
            selector: selector("challenge_burn"),
            calldata,
        }
    }

    /// `lifeforms.challenge_burn(a_id, b_id, a_state, d4, dr, dc, k)` — the LOOP-side anti-copy
    /// burn: `a_state` is A's canonical preimage (checked on-chain against A's token id), `k` the
    /// phase within A's cycle. Bounty = B's sequence_length NUT, freshly minted to the caller.
    #[allow(clippy::too_many_arguments)]
    pub fn challenge_burn_loop(
        &self,
        a_id: U256,
        b_id: U256,
        a_state: &GridState,
        d4: u8,
        dr: u8,
        dc: u8,
        k: u32,
    ) -> Call {
        let mut calldata = a_id.to_calldata().to_vec();
        calldata.extend_from_slice(&b_id.to_calldata());
        calldata.extend_from_slice(&a_state.to_calldata());
        calldata.push(Felt::from(d4));
        calldata.push(Felt::from(dr));
        calldata.push(Felt::from(dc));
        calldata.push(Felt::from(k));
        Call {
            to: self.addresses.lifeforms,
            selector: selector("challenge_burn"),
            calldata,
        }
    }

    /// Tile a run of `n_states` states starting at `start` into overlapping partial-path segments of
    /// ≤ `chunk` Conway steps, registered under the PATH minter and combined into the accumulator keyed
    /// at `token_hash(start)`. `trigger` guards against overshoot (a segment that reaches it is
    /// rejected). Segments overlap by one state (seg k+1 starts at seg k's exitpoint). Handles the
    /// single-state case (`n_states == 1`) as one length-1 segment. Appends `MintStep`s to `steps` and
    /// returns the accumulator's final state (its exitpoint) so the caller can continue the walk.
    fn tile_partial(
        &self,
        start: &Rows,
        n_states: u32,
        trigger: &GridState,
        chunk: u32,
        label: &str,
        steps: &mut Vec<MintStep>,
    ) -> Rows {
        let acc_id = token_hash(start);
        let total_steps = n_states.saturating_sub(1);
        let mut current = *start;
        let mut b_prev = 0u32;
        let mut seg_index = 0u32;
        loop {
            let b_next = (b_prev + chunk).min(total_steps);
            let seg_steps = b_next - b_prev;
            let seg_state = GridState::pack(&current);
            let mpp = self.mint_partial_path(Minter::Path, &seg_state, seg_steps + 1, trigger);
            seg_index += 1;
            if b_prev == 0 {
                steps.push(MintStep { label: format!("{label} {seg_index}"), calls: vec![mpp] });
            } else {
                let combine = self.combine_partial_path(Minter::Path, acc_id, token_hash(&current));
                steps.push(MintStep {
                    label: format!("{label} {seg_index} + combine"),
                    calls: vec![mpp, combine],
                });
            }
            for _ in 0..seg_steps {
                current = step(&current);
            }
            b_prev = b_next;
            if b_prev >= total_steps {
                break;
            }
        }
        current
    }

    /// Plan the transaction(s) to mint a PATH of `sequence_length` (distance to loop) whose terminal
    /// loop has period `loop_period`, from `start` rows. Short paths mint in one `mint_path` tx; longer
    /// ones are tiled: the **main path** (`start` → the state before the loop entry, `sequence_length`
    /// states) and the **loop witness** (`loop_period` states, keyed at the loop entry) are each split
    /// into ≤`chunk_steps` segments, then a cheap `mint_path_from_partial_paths` finalises. Single-shot
    /// cost is ∝ `sequence_length + loop_period` (mint_path steps both), so that's the single-shot gate.
    pub fn plan_path_mint(
        &self,
        start: &Rows,
        sequence_length: u32,
        loop_period: u32,
        recipient: Felt,
        chunk_steps: u32,
        single_shot_max: u32,
        max_tx: u32,
    ) -> MintPlan {
        let start_state = GridState::pack(start);
        // mint_path re-steps the transient AND walks the loop once, so cost ∝ sequence_length + period.
        if sequence_length + loop_period <= single_shot_max {
            return MintPlan {
                steps: vec![MintStep {
                    label: "mint".into(),
                    calls: self.mint_path(&start_state, sequence_length, loop_period, recipient),
                }],
                tx_count: 1,
                single_shot: true,
                too_long: false,
            };
        }
        let chunk = chunk_steps.max(1);
        // The loop entry = start stepped `sequence_length` times; it's the trigger for both tilings
        // (never hit inside the main path, and only at closure of the loop witness).
        let mut loop_entry = *start;
        for _ in 0..sequence_length {
            loop_entry = step(&loop_entry);
        }
        let loop_entry_state = GridState::pack(&loop_entry);
        let mut steps: Vec<MintStep> = Vec::new();
        // Main path: `sequence_length` states (s0..s_{L-1}); its exitpoint steps to the loop entry.
        self.tile_partial(start, sequence_length, &loop_entry_state, chunk, "path segment", &mut steps);
        // Loop witness: `loop_period` states from the loop entry; keyed at token_hash(loop_entry).
        self.tile_partial(&loop_entry, loop_period, &loop_entry_state, chunk, "loop segment", &mut steps);
        steps.push(MintStep {
            label: "mint".into(),
            calls: self.mint_path_from_partial_paths(&start_state, sequence_length, recipient),
        });
        let tx_count = steps.len() as u32;
        MintPlan { steps, tx_count, single_shot: false, too_long: tx_count > max_tx }
    }

    /// `lifeforms.move_lifeform_forward_n(token_id, n)` — advance `n` generations and mint `n` NUT to
    /// the caller in a single call (a cheap batch of move_lifeform_forward). Public.
    pub fn breathe_life(&self, token_id: U256, n: u32) -> Call {
        let mut calldata = token_id.to_calldata().to_vec();
        calldata.push(Felt::from(n));
        Call {
            to: self.addresses.lifeforms,
            selector: selector("move_lifeform_forward_n"),
            calldata,
        }
    }

    /// `lifeforms.set_render_params(token_id, bg, cell, speed)` — owner-only. The contract asserts
    /// `bg != cell` and `0 < speed < SPEED_MAX`.
    pub fn set_render_params(&self, token_id: U256, params: RenderParams) -> Call {
        let mut calldata = token_id.to_calldata().to_vec();
        calldata.push(Felt::from(params.bg));
        calldata.push(Felt::from(params.cell));
        calldata.push(Felt::from(params.speed));
        Call {
            to: self.addresses.lifeforms,
            selector: selector("set_render_params"),
            calldata,
        }
    }

    /// `lifeforms.transfer_from(from, to, token_id)`.
    pub fn transfer(&self, from: Felt, to: Felt, token_id: U256) -> Call {
        let mut calldata = vec![from, to];
        calldata.extend_from_slice(&token_id.to_calldata());
        Call {
            to: self.addresses.lifeforms,
            selector: selector("transfer_from"),
            calldata,
        }
    }

    /// Plan the full transaction sequence to mint a loop of period `loop_length` whose canonical
    /// (smallest) state is `canonical`. Short loops fit one `mint_loop` tx; longer ones are tiled into
    /// overlapping partial-path segments (each ≤ `chunk_steps` Conway steps). Segments overlap by one
    /// state — segment k+1 starts at segment k's exitpoint — so they `combine` cleanly. Every segment
    /// after the first is batched with a `combine` that folds it into the accumulator keyed under
    /// `token_hash(canonical)` (the loop id the final mint reads). The last step is
    /// `mint_loop_from_partial_paths` (approve + mint). `too_long` is set if the plan exceeds `max_tx`.
    ///
    /// Mirrors the on-chain checks: the first segment starts at `canonical` (so the accumulator's key
    /// is the loop id), no segment interior hits the canonical (only at closure), the assembled length
    /// equals `loop_length`, its smallest is the canonical, and stepping its exitpoint returns to it.
    pub fn plan_loop_mint(
        &self,
        canonical: &Rows,
        loop_length: u32,
        recipient: Felt,
        chunk_steps: u32,
        single_shot_max: u32,
        max_tx: u32,
    ) -> MintPlan {
        let canon_state = GridState::pack(canonical);
        if loop_length <= single_shot_max {
            return MintPlan {
                steps: vec![MintStep {
                    label: "mint".into(),
                    calls: self.mint_loop(&canon_state, loop_length, recipient),
                }],
                tx_count: 1,
                single_shot: true,
                too_long: false,
            };
        }
        let loop_id = token_hash(canonical);
        let total_steps = loop_length.saturating_sub(1); // walk s0..s_{L-1}
        let chunk = chunk_steps.max(1);
        let mut steps: Vec<MintStep> = Vec::new();
        let mut current = *canonical; // s_{b_prev}
        let mut b_prev = 0u32;
        let mut seg_index = 0u32;
        while b_prev < total_steps {
            let b_next = (b_prev + chunk).min(total_steps);
            let seg_steps = b_next - b_prev;
            let path_start_rows = current;
            let path_start = GridState::pack(&path_start_rows);
            // a segment of `seg_steps` steps spans seg_steps+1 states
            let mpp = self.mint_partial_path(Minter::Loop, &path_start, seg_steps + 1, &canon_state);
            seg_index += 1;
            if b_prev == 0 {
                steps.push(MintStep { label: format!("segment {seg_index}"), calls: vec![mpp] });
            } else {
                let combine =
                    self.combine_partial_path(Minter::Loop, loop_id, token_hash(&path_start_rows));
                steps.push(MintStep {
                    label: format!("segment {seg_index} + combine"),
                    calls: vec![mpp, combine],
                });
            }
            for _ in 0..seg_steps {
                current = step(&current); // advance to the exitpoint = next segment's start
            }
            b_prev = b_next;
        }
        steps.push(MintStep {
            label: "mint".into(),
            calls: self.mint_loop_from_partial_paths(&canon_state, loop_length, recipient),
        });
        let tx_count = steps.len() as u32;
        MintPlan { steps, tx_count, single_shot: false, too_long: tx_count > max_tx }
    }

    fn minter_addr(&self, minter: Minter) -> Felt {
        match minter {
            Minter::Loop => self.addresses.loop_minter,
            Minter::Path => self.addresses.path_minter,
        }
    }
}

/// NUT cost of minting a loop: `loop_length * 10^decimals`.
pub fn nut_cost_for_loop(loop_length: u32, decimals: u32) -> U256 {
    unit_cost(loop_length, decimals)
}

/// NUT cost of minting a path: `length_to_loop_entrypoint * 10^decimals`.
pub fn nut_cost_for_path(length_to_loop: u32, decimals: u32) -> U256 {
    unit_cost(length_to_loop, decimals)
}

fn unit_cost(n: u32, decimals: u32) -> U256 {
    U256::from_u128((n as u128) * 10u128.pow(decimals))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{deployments, Network};
    use crate::grid::{grid_with, GridState};

    #[test]
    fn mint_loop_is_approve_then_mint() {
        let addrs = deployments(Network::Sepolia).unwrap();
        let w = GolWrites::new(&addrs, 18);
        let state = GridState::pack(&grid_with(&[(5, 0b1110)]));
        let calls = w.mint_loop(&state, 2, Felt::from(0xabcu32));
        assert_eq!(calls.len(), 2);
        // call 0 = approve 2 NUT to the lifeforms contract
        assert_eq!(calls[0].to, addrs.nutrient);
        assert_eq!(calls[0].selector, selector("approve"));
        assert_eq!(calls[0].calldata[0], addrs.lifeforms);
        assert_eq!(calls[0].calldata[1], Felt::from(2u128 * 10u128.pow(18))); // low
        assert_eq!(calls[0].calldata[2], Felt::ZERO); // high
        // call 1 = mint_loop on the loop minter: [w0..w6, loop_length, recipient]
        assert_eq!(calls[1].to, addrs.loop_minter);
        assert_eq!(calls[1].selector, selector("mint_loop"));
        let cd = &calls[1].calldata;
        assert_eq!(cd.len(), 9);
        assert_eq!(&cd[0..7], &state.to_calldata()[..]);
        assert_eq!(cd[7], Felt::from(2u32));
        assert_eq!(cd[8], Felt::from(0xabcu32));
    }

    #[test]
    fn set_render_params_calldata() {
        let addrs = deployments(Network::Sepolia).unwrap();
        let w = GolWrites::new(&addrs, 18);
        let call = w.set_render_params(
            U256::from_u128(0x99),
            RenderParams { bg: 0x810da8, cell: 0xd9416, speed: 105 },
        );
        assert_eq!(call.to, addrs.lifeforms);
        assert_eq!(call.selector, selector("set_render_params"));
        // [token_id.low, token_id.high, bg, cell, speed]
        assert_eq!(
            call.calldata,
            vec![
                Felt::from(0x99u32),
                Felt::ZERO,
                Felt::from(0x810da8u32),
                Felt::from(0xd9416u32),
                Felt::from(105u32),
            ]
        );
    }

    #[test]
    fn nut_cost_scales_with_length() {
        assert_eq!(nut_cost_for_loop(3, 18), U256::from_u128(3 * 10u128.pow(18)));
        assert_eq!(nut_cost_for_path(0, 18), U256::from_u128(0));
    }

    #[test]
    fn mint_partial_path_calldata() {
        let addrs = deployments(Network::Sepolia).unwrap();
        let w = GolWrites::new(&addrs, 18);
        let start = GridState::pack(&grid_with(&[(5, 0b1110)]));
        let trigger = GridState::pack(&grid_with(&[(20, 0b101)]));
        let call = w.mint_partial_path(Minter::Loop, &start, 3, &trigger);
        assert_eq!(call.to, addrs.loop_minter);
        assert_eq!(call.selector, selector("mint_partial_path"));
        // [path_start(7), path_length, trigger_state(7)] = 15 felts
        assert_eq!(call.calldata.len(), 15);
        assert_eq!(&call.calldata[0..7], &start.to_calldata()[..]);
        assert_eq!(call.calldata[7], Felt::from(3u32));
        assert_eq!(&call.calldata[8..15], &trigger.to_calldata()[..]);
    }

    #[test]
    fn combine_partial_path_calldata() {
        let addrs = deployments(Network::Sepolia).unwrap();
        let w = GolWrites::new(&addrs, 18);
        // Path minter this time — exercises minter_addr routing.
        let call = w.combine_partial_path(Minter::Path, Felt::from(0x11u32), Felt::from(0x22u32));
        assert_eq!(call.to, addrs.path_minter);
        assert_eq!(call.selector, selector("combine_partial_path"));
        assert_eq!(call.calldata, vec![Felt::from(0x11u32), Felt::from(0x22u32)]);
    }

    #[test]
    fn mint_loop_from_partial_paths_calldata() {
        let addrs = deployments(Network::Sepolia).unwrap();
        let w = GolWrites::new(&addrs, 18);
        let state = GridState::pack(&grid_with(&[(5, 0b1110)]));
        let calls = w.mint_loop_from_partial_paths(&state, 2, Felt::from(0xabcu32));
        assert_eq!(calls.len(), 2);
        // approve sequence_length(=2) NUT to lifeforms
        assert_eq!(calls[0].to, addrs.nutrient);
        assert_eq!(calls[0].calldata[0], addrs.lifeforms);
        assert_eq!(calls[0].calldata[1], Felt::from(2u128 * 10u128.pow(18)));
        // mint: [loop_state(7), recipient] = 8 felts
        assert_eq!(calls[1].to, addrs.loop_minter);
        assert_eq!(calls[1].selector, selector("mint_loop_from_partial_paths"));
        assert_eq!(calls[1].calldata.len(), 8);
        assert_eq!(&calls[1].calldata[0..7], &state.to_calldata()[..]);
        assert_eq!(calls[1].calldata[7], Felt::from(0xabcu32));
    }

    #[test]
    fn plan_loop_mint_tiles_a_glider_and_matches_contract_checks() {
        use crate::engine::{combine_partial_path, compute_partial_path, find_loop, PartialPathData};
        use crate::grid::{eq, grid_with, step, GridState};
        let addrs = deployments(Network::Sepolia).unwrap();
        let w = GolWrites::new(&addrs, 18);
        // A glider returns to itself after a long period on the torus — a real multi-segment loop.
        let glider = grid_with(&[(0, 0b010), (1, 0b100), (2, 0b111)]);
        let (period, canonical) = find_loop(&glider, 4096).expect("glider loops");
        assert!(period > 8, "need a multi-segment loop, got period {period}");

        let chunk = 16u32;
        let plan = w.plan_loop_mint(&canonical, period, Felt::from(0xabcu32), chunk, 8, 64);
        assert!(!plan.single_shot && !plan.too_long);
        let n_segments = plan.steps.len() - 1; // last step is the final mint

        // Re-derive the tiling and run the SAME checks the contract runs, segment by segment.
        let mut current = canonical;
        let mut b_prev = 0u32;
        let total_steps = period - 1;
        let mut acc: Option<PartialPathData> = None;
        let mut idx = 0usize;
        while b_prev < total_steps {
            let b_next = (b_prev + chunk).min(total_steps);
            let seg_steps = b_next - b_prev;
            // the planner's segment path_start (calldata[0..7]) must be this state
            let mpp = &plan.steps[idx].calls[0];
            assert_eq!(mpp.selector, selector("mint_partial_path"));
            let plan_start = GridState::from_felts(&mpp.calldata[0..7]).unwrap();
            assert!(eq(&plan_start.unpack(), &current), "segment {idx} path_start");
            assert!(eq(&GridState::from_felts(&mpp.calldata[8..15]).unwrap().unpack(), &canonical), "trigger");
            // contract accepts the segment (trigger not hit inside it)
            let seg = compute_partial_path(&current, &canonical, seg_steps + 1).expect("segment computes");
            acc = Some(match acc {
                None => {
                    assert_eq!(plan.steps[idx].calls.len(), 1, "first segment has no combine");
                    seg
                }
                Some(a) => {
                    assert_eq!(plan.steps[idx].calls.len(), 2);
                    assert_eq!(plan.steps[idx].calls[1].selector, selector("combine_partial_path"));
                    combine_partial_path(a, seg).expect("segments chain & combine")
                }
            });
            for _ in 0..seg_steps {
                current = step(&current);
            }
            b_prev = b_next;
            idx += 1;
        }
        assert_eq!(idx, n_segments);
        let assembled = acc.unwrap();
        assert_eq!(assembled.length, period, "assembled length == loop period");
        assert!(eq(&assembled.smallest.unpack(), &canonical), "smallest == canonical");
        assert!(eq(&step(&assembled.exitpoint.unpack()), &canonical), "loop closes back to canonical");

        // final step = approve + mint_loop_from_partial_paths
        let last = plan.steps.last().unwrap();
        assert_eq!(last.calls.len(), 2);
        assert_eq!(last.calls[1].selector, selector("mint_loop_from_partial_paths"));
    }

    #[test]
    fn plan_loop_mint_short_loop_is_single_shot() {
        use crate::grid::grid_with;
        let addrs = deployments(Network::Sepolia).unwrap();
        let w = GolWrites::new(&addrs, 18);
        let blinker = grid_with(&[(5, 0b111)]); // period 2
        let plan = w.plan_loop_mint(&blinker, 2, Felt::from(1u32), 16, 8, 8);
        assert!(plan.single_shot);
        assert_eq!(plan.tx_count, 1);
        assert_eq!(plan.steps[0].calls[1].selector, selector("mint_loop"));
    }

    #[test]
    fn plan_path_mint_single_shot_targets_path_nft() {
        let addrs = deployments(Network::Sepolia).unwrap();
        let w = GolWrites::new(&addrs, 18);
        let l = grid_with(&[(1, 0b110), (2, 0b010)]); // L-tromino -> block, len 1
        let plan = w.plan_path_mint(&l, 1, 1, Felt::from(0xabcu32), 16, 60, 16);
        assert!(plan.single_shot && !plan.too_long);
        assert_eq!(plan.steps[0].calls.len(), 2);
        // approve escrows into the PATH NFT (not the loop lifeforms)
        assert_eq!(plan.steps[0].calls[0].to, addrs.nutrient);
        assert_eq!(plan.steps[0].calls[0].calldata[0], addrs.path_lifeforms);
        assert_eq!(plan.steps[0].calls[1].to, addrs.path_minter);
        assert_eq!(plan.steps[0].calls[1].selector, selector("mint_path"));
    }

    #[test]
    fn plan_path_mint_too_long_when_over_max_tx() {
        let addrs = deployments(Network::Sepolia).unwrap();
        let w = GolWrites::new(&addrs, 18);
        let l = grid_with(&[(1, 0b110), (2, 0b010)]);
        // force tiling (single_shot_max 0) -> 3 steps (main+loop+mint) > max_tx 1 -> too_long.
        let plan = w.plan_path_mint(&l, 1, 1, Felt::from(1u32), 16, 0, 1);
        assert!(plan.too_long && !plan.single_shot);
    }

    // Tiled path mint: force multi-tx (single_shot_max 0) and re-run the contract's checks segment by
    // segment for BOTH the main path and the loop witness, then confirm the final mint step.
    #[test]
    fn plan_path_mint_tiles_main_and_loop_witness() {
        use crate::engine::{classify_fate, combine_partial_path, compute_partial_path, Fate, PartialPathData};
        use crate::grid::{eq, step};
        let addrs = deployments(Network::Sepolia).unwrap();
        let w = GolWrites::new(&addrs, 18);
        // A real path: L-tromino -> block (still life). seq 1, loop period 1.
        let start = grid_with(&[(1, 0b110), (2, 0b010)]);
        let (seq, period, loop_entry) = match classify_fate(&start, 64) {
            Fate::Path(p) => (p.sequence_length, p.loop_period, p.loop_entry),
            f => panic!("expected a path, got {f:?}"),
        };
        let plan = w.plan_path_mint(&start, seq, period, Felt::from(0xabcu32), 16, 0, 16);
        assert!(!plan.single_shot && !plan.too_long);

        let trigger = GridState::pack(&loop_entry);
        // Walk the plan's mint_partial_path segments up to the final mint; fold main vs loop separately.
        let mut main_acc: Option<PartialPathData> = None;
        let mut loop_acc: Option<PartialPathData> = None;
        let mut on_loop = false;
        for stepx in &plan.steps[..plan.steps.len() - 1] {
            let mpp = &stepx.calls[0];
            assert_eq!(mpp.selector, selector("mint_partial_path"));
            let seg_start = GridState::from_felts(&mpp.calldata[0..7]).unwrap();
            let seg_len = crate::types::felt_to_u128(&mpp.calldata[7]) as u32;
            assert_eq!(&GridState::from_felts(&mpp.calldata[8..15]).unwrap(), &trigger, "trigger = loop entry");
            let seg = compute_partial_path(&seg_start.unpack(), &loop_entry, seg_len).expect("segment computes");
            // the main path's first segment starts at `start`; the loop witness's at `loop_entry`.
            if !on_loop && eq(&seg_start.unpack(), &loop_entry) && main_acc.is_some() {
                on_loop = true;
            }
            let acc = if on_loop { &mut loop_acc } else { &mut main_acc };
            *acc = Some(match acc.take() {
                None => seg,
                Some(a) => combine_partial_path(a, seg).expect("segments combine"),
            });
        }
        let main = main_acc.unwrap();
        let looping = loop_acc.unwrap();
        assert_eq!(main.length, seq, "main length == sequence_length");
        assert!(eq(&step(&main.exitpoint.unpack()), &loop_entry), "main exit steps to loop entry");
        assert_eq!(looping.length, period, "loop witness length == period");
        assert!(eq(&step(&looping.exitpoint.unpack()), &loop_entry), "loop closes to entry");
        // final step = approve + mint_path_from_partial_paths
        let last = plan.steps.last().unwrap();
        assert_eq!(last.calls[1].selector, selector("mint_path_from_partial_paths"));
    }

    #[test]
    fn challenge_burn_calldata() {
        let addrs = deployments(Network::Sepolia).unwrap();
        let w = GolWrites::new(&addrs, 18);
        let call = w.challenge_burn(U256::from_u128(0xa), U256::from_u128(0xb), 1, 2, 3);
        assert_eq!(call.to, addrs.path_lifeforms);
        assert_eq!(call.selector, selector("challenge_burn"));
        // [older.lo, older.hi, younger.lo, younger.hi, d4, dr, dc]
        assert_eq!(
            call.calldata,
            vec![
                Felt::from(0xau32),
                Felt::ZERO,
                Felt::from(0xbu32),
                Felt::ZERO,
                Felt::ONE,
                Felt::from(2u32),
                Felt::from(3u32),
            ]
        );
    }

    #[test]
    fn challenge_burn_loop_calldata() {
        let addrs = deployments(Network::Sepolia).unwrap();
        let w = GolWrites::new(&addrs, 18);
        let a_state = GridState::pack(&grid_with(&[(5, 0b1110)]));
        let call =
            w.challenge_burn_loop(U256::from_u128(0xa), U256::from_u128(0xb), &a_state, 0, 1, 0, 1);
        assert_eq!(call.to, addrs.lifeforms);
        assert_eq!(call.selector, selector("challenge_burn"));
        // [a.lo, a.hi, b.lo, b.hi, w0..w6, d4, dr, dc, k] = 4 + 7 + 4
        assert_eq!(call.calldata.len(), 15);
        assert_eq!(&call.calldata[4..11], &a_state.to_calldata()[..]);
        assert_eq!(call.calldata[14], Felt::ONE); // k
    }

    #[test]
    fn mint_path_from_partial_paths_calldata() {
        let addrs = deployments(Network::Sepolia).unwrap();
        let w = GolWrites::new(&addrs, 18);
        let state = GridState::pack(&grid_with(&[(5, 0b1110)]));
        let calls = w.mint_path_from_partial_paths(&state, 5, Felt::from(0xabcu32));
        assert_eq!(calls.len(), 2);
        assert_eq!(calls[0].to, addrs.nutrient);
        assert_eq!(calls[0].calldata[1], Felt::from(5u128 * 10u128.pow(18))); // 5 NUT
        assert_eq!(calls[1].to, addrs.path_minter);
        assert_eq!(calls[1].selector, selector("mint_path_from_partial_paths"));
        assert_eq!(calls[1].calldata.len(), 8);
        assert_eq!(&calls[1].calldata[0..7], &state.to_calldata()[..]);
        assert_eq!(calls[1].calldata[7], Felt::from(0xabcu32));
    }
}
