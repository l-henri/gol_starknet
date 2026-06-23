//! Write call-builders for v2. Each method builds composable [`Call`]s (mint flows return the
//! `[approve, mint]` multicall); nothing is signed or sent until a `Submitter` takes them.
//!
//! v2: the state is a 7-felt [`GridState`] (not a `u256`), the ERC-721 `token_id` is a Poseidon
//! hash, and `set_render_params` is new. Minting charges the caller `sequence_length` NUT — for a
//! loop that's `loop_length`, for a path `length_to_loop_entrypoint` (matching the v1 economy).

use crate::config::GolAddresses;
use crate::encoding::selector;
use crate::grid::GridState;
use crate::types::{Call, Felt, RenderParams, U256};

/// Which minter a partial-path call targets (both expose the same partial-path entry points).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Minter {
    Loop,
    Path,
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
        let approve = self.approve_nut(
            self.addresses.lifeforms,
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
        let approve =
            self.approve_nut(self.addresses.lifeforms, unit_cost(sequence_length, self.nut_decimals));
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

    /// `lifeforms.move_lifeform_forward(token_id)` — advance one generation, earn 1 NUT. Public.
    pub fn breathe_life(&self, token_id: U256) -> Call {
        Call {
            to: self.addresses.lifeforms,
            selector: selector("move_lifeform_forward"),
            calldata: token_id.to_calldata().to_vec(),
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
}
