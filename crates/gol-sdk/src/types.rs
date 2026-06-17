//! Core types: the field element, a `u256` matching Cairo's encoding, a `Call`, and the domain
//! structs that mirror `interfaces.cairo` / `gol_bench.cairo`.

pub use starknet_types_core::felt::Felt;

use serde::{Deserialize, Serialize};

/// A single contract call: entry point + flat felt calldata.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Call {
    pub to: Felt,
    pub selector: Felt,
    pub calldata: Vec<Felt>,
}

/// Cairo `u256` as two 128-bit limbs — the on-chain calldata/return encoding (`[low, high]`).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct U256 {
    pub low: u128,
    pub high: u128,
}

impl U256 {
    pub const fn new(low: u128, high: u128) -> Self {
        Self { low, high }
    }
    pub const fn from_u128(v: u128) -> Self {
        Self { low: v, high: 0 }
    }
    pub fn from_felts(low: &Felt, high: &Felt) -> Self {
        Self {
            low: felt_to_u128(low),
            high: felt_to_u128(high),
        }
    }
    /// Calldata limbs in Cairo order: `[low, high]`.
    pub fn to_calldata(&self) -> [Felt; 2] {
        [Felt::from(self.low), Felt::from(self.high)]
    }
    /// Minimal `0x…` hex of the full 256-bit value (big-endian).
    pub fn to_hex(&self) -> String {
        let mut bytes = [0u8; 32];
        bytes[0..16].copy_from_slice(&self.high.to_be_bytes());
        bytes[16..32].copy_from_slice(&self.low.to_be_bytes());
        let s = hex::encode(bytes);
        let trimmed = s.trim_start_matches('0');
        if trimmed.is_empty() {
            "0x0".to_string()
        } else {
            format!("0x{trimmed}")
        }
    }
}

/// `LifeFormData` from `get_lifeform_data`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct LifeformData {
    pub is_loop: bool,
    pub is_still: bool,
    pub is_alive: bool,
    pub is_dead: bool,
    pub sequence_length: u32,
    pub current_state: U256,
    pub age: u32,
}

/// A lifeform plus its current owner.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct OwnedLifeform {
    pub token_id: U256,
    pub owner: Felt,
    pub data: LifeformData,
}

/// `PartialPathData` from `compute_partial_path` / `combine_partial_path`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct PartialPathData {
    pub entrypoint: U256,
    pub exitpoint: U256,
    pub length: u32,
    pub trigger_state: U256,
    pub smallest_element: U256,
}

/// Result of `is_single_loop_from_initial_state`: `(ok, smallest, sequence)`.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct LoopCheck {
    pub ok: bool,
    pub smallest: U256,
    pub sequence: Vec<U256>,
}

/// An ERC721 metadata attribute (`trait_type` + display `value`).
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct TokenAttribute {
    pub trait_type: String,
    pub value: String,
}

/// Decoded `token_uri`: the raw `data:` URI plus the parsed ERC721 metadata (`image` is itself a
/// `data:image/svg+xml;base64,…` URI — use [`TokenUri::svg`] to get the markup).
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct TokenUri {
    pub raw: String,
    pub name: Option<String>,
    pub description: Option<String>,
    pub image: Option<String>,
    pub attributes: Vec<TokenAttribute>,
}

/// The proven result of advancing `start_state` by `generations` steps — the SNIP-36 `MoveMessage`
/// emitted as the single L2->L1 message of `prove_move_forward_n` (benchmark contract).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct MoveMessage {
    pub start_state: U256,
    pub final_state: U256,
    pub generations: u32,
}

impl MoveMessage {
    /// Serialized payload in Cairo order: `[start.low, start.high, final.low, final.high, gens]`.
    pub fn to_calldata(&self) -> Vec<Felt> {
        let mut v = Vec::with_capacity(5);
        v.extend_from_slice(&self.start_state.to_calldata());
        v.extend_from_slice(&self.final_state.to_calldata());
        v.push(Felt::from(self.generations));
        v
    }
}

/// Low 128 bits of a felt as `u128` (sufficient for the SDK's `u256` limbs and small counters).
pub(crate) fn felt_to_u128(f: &Felt) -> u128 {
    let bytes = f.to_bytes_be();
    let mut limb = [0u8; 16];
    limb.copy_from_slice(&bytes[16..32]);
    u128::from_be_bytes(limb)
}

pub(crate) fn felt_to_bool(f: &Felt) -> bool {
    *f != Felt::ZERO
}

/// Minimal `0x…` hex for a felt (for JSON-RPC params).
pub(crate) fn felt_hex(f: &Felt) -> String {
    let s = hex::encode(f.to_bytes_be());
    let trimmed = s.trim_start_matches('0');
    if trimmed.is_empty() {
        "0x0".to_string()
    } else {
        format!("0x{trimmed}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn u256_calldata_and_hex_roundtrip() {
        let v = U256::new(0xdead_beef, 0x1234);
        let cd = v.to_calldata();
        assert_eq!(U256::from_felts(&cd[0], &cd[1]), v);
        assert_eq!(U256::from_u128(0).to_hex(), "0x0");
        assert_eq!(U256::from_u128(0x98307).to_hex(), "0x98307");
    }

    #[test]
    fn felt_hex_trims_leading_zeros() {
        assert_eq!(felt_hex(&Felt::from(0u8)), "0x0");
        assert_eq!(felt_hex(&Felt::from(0x42u32)), "0x42");
    }
}
