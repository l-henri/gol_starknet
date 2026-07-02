//! Core types: the field element, a `u256` matching Cairo's encoding, a `Call`, and the domain
//! structs that mirror `interfaces.cairo` / `gol_bench.cairo`.

pub use starknet_types_core::felt::Felt;

use serde::{Deserialize, Serialize};

use crate::grid::GridState;

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
    /// The full value of a single felt as a `u256` (felts are < 2^252, so `high` ≤ 124 bits). Used
    /// for the v2 token id, which is a Poseidon hash rather than the state itself.
    pub fn from_felt(f: &Felt) -> Self {
        let b = f.to_bytes_be();
        let mut hi = [0u8; 16];
        let mut lo = [0u8; 16];
        hi.copy_from_slice(&b[0..16]);
        lo.copy_from_slice(&b[16..32]);
        Self {
            high: u128::from_be_bytes(hi),
            low: u128::from_be_bytes(lo),
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

    /// Parse from a decimal or `0x` hex string (the JS / CLI boundary). Decimal is limited to
    /// `u128`; hex accepts the full 256 bits.
    pub fn parse(s: &str) -> Option<U256> {
        let s = s.trim();
        if let Some(h) = s.strip_prefix("0x").or_else(|| s.strip_prefix("0X")) {
            if h.is_empty() || h.len() > 64 {
                return None;
            }
            let bytes = hex::decode(format!("{h:0>64}")).ok()?;
            let mut hi = [0u8; 16];
            let mut lo = [0u8; 16];
            hi.copy_from_slice(&bytes[0..16]);
            lo.copy_from_slice(&bytes[16..32]);
            Some(U256 {
                high: u128::from_be_bytes(hi),
                low: u128::from_be_bytes(lo),
            })
        } else {
            // Full-width decimal. v2 token ids are 252-bit Poseidon hashes, so their decimal form
            // far exceeds u128 — parse digit-by-digit into 64-bit limbs (`acc = acc*10 + d`).
            let bytes = s.as_bytes();
            if bytes.is_empty() || !bytes.iter().all(u8::is_ascii_digit) {
                return None;
            }
            let mut limbs = [0u64; 4]; // little-endian
            for &b in bytes {
                let mut carry = (b - b'0') as u64;
                for limb in limbs.iter_mut() {
                    let v = (*limb as u128) * 10 + carry as u128;
                    *limb = v as u64;
                    carry = (v >> 64) as u64;
                }
                if carry != 0 {
                    return None; // overflow past 2^256
                }
            }
            Some(U256 {
                low: (limbs[0] as u128) | ((limbs[1] as u128) << 64),
                high: (limbs[2] as u128) | ((limbs[3] as u128) << 64),
            })
        }
    }
}

/// `LifeFormData` from `get_lifeform_data` (v2: `current_state` is the multi-felt [`GridState`]).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct LifeformData {
    pub is_loop: bool,
    pub is_still: bool,
    pub is_alive: bool,
    pub is_dead: bool,
    pub sequence_length: u32,
    pub current_state: GridState,
    pub age: u32,
}

/// A lifeform plus its current owner.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct OwnedLifeform {
    pub token_id: U256,
    pub owner: Felt,
    pub data: LifeformData,
}

/// What a PATH creature converges to (mirrors the Cairo `LifeState` enum; variant index = felt).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum LifeState {
    Alive,
    Frozen,
    Dead,
}

impl LifeState {
    pub fn from_index(i: u8) -> LifeState {
        match i {
            1 => LifeState::Frozen,
            2 => LifeState::Dead,
            _ => LifeState::Alive,
        }
    }
    pub fn as_str(&self) -> &'static str {
        match self {
            LifeState::Alive => "alive",
            LifeState::Frozen => "frozen",
            LifeState::Dead => "dead",
        }
    }
}

/// `PathFormData` from `get_path_data` on the path NFT (docs/path-creatures-spec.md). A path is a
/// static transient that leads into a loop; `sequence_length` is its distance to the loop.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PathForm {
    pub life_state: LifeState,
    pub sequence_length: u32,
    pub start_state: GridState,
    pub target_loop_id: Felt,
    pub target_period: u32,
    pub minted_at: u64,
    pub escrow: U256,
}

/// A path creature plus its current owner.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct OwnedPath {
    pub token_id: U256,
    pub owner: Felt,
    pub data: PathForm,
}

/// Per-token render params (`get_render_params` / `set_render_params`): `bg`/`cell` are 0xRRGGBB
/// colours and `speed` is generations/second (`0 < speed < SPEED_MAX`). The v2 partial-path type
/// lives in [`crate::engine`] (it carries `GridState`s); loop/path discovery is the off-chain engine.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct RenderParams {
    pub bg: u32,
    pub cell: u32,
    pub speed: u16,
}

/// An ERC721 metadata attribute (`trait_type` + display `value`).
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct TokenAttribute {
    pub trait_type: String,
    pub value: String,
}

/// Decoded `token_uri`: the raw `data:` URI plus the parsed ERC721 metadata. v2 has no `image`;
/// `animation_url` is a `data:text/html;base64,…` interactive renderer — use [`TokenUri::html`].
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct TokenUri {
    pub raw: String,
    pub name: Option<String>,
    pub description: Option<String>,
    pub animation_url: Option<String>,
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
        assert_eq!(U256::parse("98307"), Some(U256::from_u128(98307)));
        assert_eq!(U256::parse("0x18003"), Some(U256::from_u128(0x18003)));
        assert_eq!(U256::parse("0xZZ"), None);
    }

    #[test]
    fn parses_decimal_beyond_u128() {
        // v2 token ids are 252-bit; their decimal form exceeds u128 (the old parser silently failed).
        assert_eq!(U256::parse("340282366920938463463374607431768211455"), Some(U256::new(u128::MAX, 0))); // 2^128 - 1
        assert_eq!(U256::parse("340282366920938463463374607431768211456"), Some(U256::new(0, 1))); // 2^128
        // a real v2 token id round-trips between its decimal and hex forms.
        let hex = "0x411c2166602957139ae2f005a79f979ed0b6233924360487293edc79cc00a23";
        let dec = "1840627337087318780751954265620527044040676149041008957592235432059066124835";
        assert_eq!(U256::parse(dec), U256::parse(hex));
        assert_eq!(U256::parse("12a"), None); // not all digits
    }

    #[test]
    fn felt_hex_trims_leading_zeros() {
        assert_eq!(felt_hex(&Felt::from(0u8)), "0x0");
        assert_eq!(felt_hex(&Felt::from(0x42u32)), "0x42");
    }
}
