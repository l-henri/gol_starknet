//! Pure encoding primitives: `sn_keccak` entry-point selectors and the Poseidon SNIP-36 message
//! hash. No I/O — fully unit-testable offline against starknet.js-derived fixtures.

use crate::types::{Felt, MoveMessage};
use starknet_types_core::hash::{Poseidon, StarkHash};
use tiny_keccak::{Hasher, Keccak};

/// `sn_keccak`: keccak256 of the input, masked to 250 bits (top 6 bits cleared).
pub fn starknet_keccak(data: &[u8]) -> Felt {
    let mut hasher = Keccak::v256();
    hasher.update(data);
    let mut out = [0u8; 32];
    hasher.finalize(&mut out);
    out[0] &= 0x03; // clear the top 6 bits → < 2^250
    Felt::from_bytes_be(&out)
}

/// Entry-point / event selector for a name (`sn_keccak` of the ASCII bytes).
pub fn selector(name: &str) -> Felt {
    starknet_keccak(name.as_bytes())
}

/// Poseidon hash of the L2->L1 message a SNIP-36 proof commits — matches the Cairo `message_hash`
/// in `gol_bench.cairo`: `poseidon([from_address, to_address=0, payload_len, ...payload])`.
pub fn move_message_hash(contract: Felt, msg: &MoveMessage) -> Felt {
    let payload = msg.to_calldata();
    let mut data = Vec::with_capacity(3 + payload.len());
    data.push(contract);
    data.push(Felt::ZERO);
    data.push(Felt::from(payload.len() as u64));
    data.extend_from_slice(&payload);
    Poseidon::hash_array(&data)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::U256;

    // Fixtures derived from the frontend's starknet.js (hash.getSelectorFromName /
    // computePoseidonHashOnElements) — the ground-truth oracle.

    #[test]
    fn selector_fixtures() {
        let cases = [
            ("get_grid_size", "0x2afe8275316b08353f4c1eb94470f9351664c081e3601d1274d00f492eb0dfd"),
            ("balance_of", "0x35a73cd311a05d46deda634c5ee045db92f811b4e74bca4437fcb5302b7af33"),
            ("approve", "0x219209e083275171774dab1df80982e9df2096516f06319c5c6d71ae0a8480c"),
            ("move_lifeform_forward", "0xce26c947fa5a9ffb57a3cc884d504aa5ad01cb2c4b90451e66ba2227d6b7e"),
            ("mint_loop", "0x1450d9ac1812908645720f27da2d0dbc0bf1ddb3abf6f49cca68acd1bbf9760"),
            ("iterate_life_once", "0x3ab75419222f443c43591ba9df3c35461bc23fd537d9f1daa11c05b864a4585"),
        ];
        for (name, want) in cases {
            assert_eq!(selector(name), Felt::from_hex(want).unwrap(), "selector({name})");
        }
    }

    #[test]
    fn event_selector_fixtures() {
        assert_eq!(
            selector("Transfer"),
            Felt::from_hex("0x99cd8bde557814842a3121e8ddfd433a539b8c9f14bf31ebf108d12e6196e9").unwrap()
        );
        assert_eq!(
            selector("NewLifeForm"),
            Felt::from_hex("0x11f46882e19ad05d3762feda18b95af02b4d04ff264650de9665ede8f823262").unwrap()
        );
    }

    #[test]
    fn move_message_hash_fixture() {
        // contract=0x123, MoveMessage{start=1, final=2, generations=3}
        let msg = MoveMessage {
            start_state: U256::from_u128(1),
            final_state: U256::from_u128(2),
            generations: 3,
        };
        let h = move_message_hash(Felt::from_hex("0x123").unwrap(), &msg);
        assert_eq!(
            h,
            Felt::from_hex("0x5323c371f0c4baa097ef72c63e84b77a294a67cfa03a6adfec6dfc2e4033a25").unwrap()
        );
    }
}
