//! Write call-builders. Each method builds composable [`Call`]s (mint flows return the
//! `[approve, mint]` multicall); nothing is signed or sent until a `Submitter` takes them.

use crate::config::GolAddresses;
use crate::encoding::selector;
use crate::types::{Call, Felt, U256};

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

    /// `[approve(NUT to lifeforms), loop_minter.mint_loop(loop_id, loop_length, recipient)]`.
    pub fn mint_loop(&self, loop_id: U256, loop_length: u32, recipient: Felt) -> Vec<Call> {
        let approve = self.approve_nut(self.addresses.lifeforms, nut_cost_for_loop(loop_length, self.nut_decimals));
        let mut calldata = loop_id.to_calldata().to_vec();
        calldata.push(Felt::from(loop_length));
        calldata.push(recipient);
        let mint = Call {
            to: self.addresses.loop_minter,
            selector: selector("mint_loop"),
            calldata,
        };
        vec![approve, mint]
    }

    /// `[approve(NUT to lifeforms), path_minter.mint_path(...)]`.
    pub fn mint_path(
        &self,
        path_id: U256,
        length_to_loop: u32,
        loop_entry: U256,
        loop_length: u32,
        recipient: Felt,
    ) -> Vec<Call> {
        let approve = self.approve_nut(self.addresses.lifeforms, nut_cost_for_path(length_to_loop, self.nut_decimals));
        let mut calldata = path_id.to_calldata().to_vec();
        calldata.push(Felt::from(length_to_loop));
        calldata.extend_from_slice(&loop_entry.to_calldata());
        calldata.push(Felt::from(loop_length));
        calldata.push(recipient);
        let mint = Call {
            to: self.addresses.path_minter,
            selector: selector("mint_path"),
            calldata,
        };
        vec![approve, mint]
    }

    /// `mint_partial_path(path_start, path_length, trigger_state)` on the chosen minter.
    pub fn mint_partial_path(
        &self,
        minter: Minter,
        path_start: U256,
        path_length: u32,
        trigger_state: U256,
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

    /// `combine_partial_path(id1, id2)` on the chosen minter.
    pub fn combine_partial_path(&self, minter: Minter, id1: U256, id2: U256) -> Call {
        let mut calldata = id1.to_calldata().to_vec();
        calldata.extend_from_slice(&id2.to_calldata());
        Call {
            to: self.minter_addr(minter),
            selector: selector("combine_partial_path"),
            calldata,
        }
    }

    /// `lifeforms.move_lifeform_forward(token_id)` — advance one generation, earn NUT.
    pub fn breathe_life(&self, token_id: U256) -> Call {
        Call {
            to: self.addresses.lifeforms,
            selector: selector("move_lifeform_forward"),
            calldata: token_id.to_calldata().to_vec(),
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

/// NUT cost of minting a path: `length_to_loop * 10^decimals`.
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

    #[test]
    fn mint_loop_is_approve_then_mint() {
        let addrs = deployments(Network::Sepolia).unwrap();
        let w = GolWrites::new(&addrs, 18);
        let calls = w.mint_loop(U256::from_u128(0x98307), 4, Felt::from(0xabcu32));
        assert_eq!(calls.len(), 2);
        // call 0 = approve NUT (4 NUT) to the lifeforms contract
        assert_eq!(calls[0].to, addrs.nutrient);
        assert_eq!(calls[0].selector, selector("approve"));
        assert_eq!(calls[0].calldata[0], addrs.lifeforms);
        assert_eq!(calls[0].calldata[1], Felt::from(4u128 * 10u128.pow(18))); // low
        assert_eq!(calls[0].calldata[2], Felt::ZERO); // high
        // call 1 = mint_loop on the loop minter
        assert_eq!(calls[1].to, addrs.loop_minter);
        assert_eq!(calls[1].selector, selector("mint_loop"));
        // calldata: [loop_id.low, loop_id.high, loop_length, recipient]
        assert_eq!(calls[1].calldata, vec![Felt::from(0x98307u64), Felt::ZERO, Felt::from(4u32), Felt::from(0xabcu32)]);
    }

    #[test]
    fn nut_cost_scales_with_length() {
        assert_eq!(nut_cost_for_loop(3, 18), U256::from_u128(3 * 10u128.pow(18)));
        assert_eq!(nut_cost_for_path(0, 18), U256::from_u128(0));
    }
}
