//! Cairo `ByteArray` decoding + `token_uri` parsing.
//!
//! A Cairo `ByteArray` serializes as `[num_full_words, word_0 … word_{n-1}, pending_word,
//! pending_word_len]`: each full word packs 31 big-endian bytes, the pending word holds the
//! trailing `pending_word_len` (0..=30) bytes. `token_uri` returns one such string —
//! `data:application/json;base64,<json>` — whose JSON carries the ERC721 metadata + grid SVG.

use base64::Engine;

use crate::error::GolError;
use crate::types::{felt_to_u128, Felt, TokenAttribute, TokenUri};

/// Decode a Cairo `ByteArray` (as returned by a view) into its UTF-8 string.
pub fn decode_byte_array(felts: &[Felt]) -> Result<String, GolError> {
    let n = felt_to_u128(felts.first().ok_or_else(|| GolError::Encoding("byte array: empty".into()))?) as usize;
    // layout length = 1 (count) + n (full words) + 1 (pending word) + 1 (pending len)
    if felts.len() < n + 3 {
        return Err(GolError::Encoding(format!(
            "byte array: need {} felts, got {}",
            n + 3,
            felts.len()
        )));
    }
    let mut bytes = Vec::with_capacity(n * 31 + 31);
    for word in &felts[1..1 + n] {
        let b = word.to_bytes_be(); // 32 bytes; a full word is the low 31
        bytes.extend_from_slice(&b[1..32]);
    }
    let pending = &felts[1 + n];
    let pending_len = felt_to_u128(&felts[2 + n]) as usize;
    if pending_len > 31 {
        return Err(GolError::Encoding(format!(
            "byte array: pending_word_len {pending_len} > 31"
        )));
    }
    if pending_len > 0 {
        let b = pending.to_bytes_be();
        bytes.extend_from_slice(&b[32 - pending_len..32]);
    }
    String::from_utf8(bytes).map_err(|e| GolError::Encoding(format!("byte array: invalid utf-8: {e}")))
}

/// Parse a `token_uri` string into structured metadata (best-effort; unparseable payloads keep
/// only `raw`).
pub fn parse_token_uri(raw: String) -> TokenUri {
    let parsed = decode_data_uri_bytes(&raw)
        .and_then(|bytes| serde_json::from_slice::<serde_json::Value>(&bytes).ok());
    let mut uri = TokenUri {
        raw,
        ..TokenUri::default()
    };
    if let Some(v) = parsed {
        uri.name = v.get("name").and_then(|x| x.as_str()).map(String::from);
        uri.description = v.get("description").and_then(|x| x.as_str()).map(String::from);
        uri.image = v.get("image").and_then(|x| x.as_str()).map(String::from);
        if let Some(arr) = v.get("attributes").and_then(|a| a.as_array()) {
            uri.attributes = arr.iter().filter_map(parse_attribute).collect();
        }
    }
    uri
}

impl TokenUri {
    /// Decode the `image` data URI to raw SVG markup, if present and valid UTF-8.
    pub fn svg(&self) -> Option<String> {
        let bytes = decode_data_uri_bytes(self.image.as_deref()?)?;
        String::from_utf8(bytes).ok()
    }
}

/// Decode the payload of a `data:` URI (base64 or inline) to bytes.
fn decode_data_uri_bytes(uri: &str) -> Option<Vec<u8>> {
    let comma = uri.find(',')?;
    let prefix = &uri[..comma];
    let payload = &uri[comma + 1..];
    if prefix.contains(";base64") {
        base64::engine::general_purpose::STANDARD.decode(payload).ok()
    } else {
        Some(payload.as_bytes().to_vec())
    }
}

fn parse_attribute(v: &serde_json::Value) -> Option<TokenAttribute> {
    let trait_type = v.get("trait_type")?.as_str()?.to_string();
    let value = match v.get("value")? {
        serde_json::Value::String(s) => s.clone(),
        other => other.to_string(), // numbers/bools → their display form
    };
    Some(TokenAttribute { trait_type, value })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn byte_array_pending_only() {
        // "hello" = 5 bytes, no full words: [0, 0x68656c6c6f, 5]
        let felts = [Felt::from(0u8), Felt::from(0x68656c6c6f_u64), Felt::from(5u8)];
        assert_eq!(decode_byte_array(&felts).unwrap(), "hello");
    }

    #[test]
    fn byte_array_full_word() {
        // one full 31-byte word of 'a', no pending: [1, <31×'a'>, 0, 0]
        let mut w = [0u8; 32];
        for b in &mut w[1..32] {
            *b = b'a';
        }
        let felts = [Felt::from(1u8), Felt::from_bytes_be(&w), Felt::ZERO, Felt::ZERO];
        assert_eq!(decode_byte_array(&felts).unwrap(), "a".repeat(31));
    }

    #[test]
    fn parses_data_uri_json_and_svg() {
        let svg = "<svg></svg>";
        let img = format!(
            "data:image/svg+xml;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(svg)
        );
        let json = format!(
            r#"{{"name":"Lifeform #1","description":"d","image":"{img}","attributes":[{{"trait_type":"Status","value":"Alive"}},{{"trait_type":"Age","value":0}}]}}"#
        );
        let raw = format!(
            "data:application/json;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(&json)
        );

        let uri = parse_token_uri(raw);
        assert_eq!(uri.name.as_deref(), Some("Lifeform #1"));
        assert_eq!(uri.attributes.len(), 2);
        assert_eq!(uri.attributes[0].trait_type, "Status");
        assert_eq!(uri.attributes[0].value, "Alive");
        assert_eq!(uri.attributes[1].value, "0"); // number stringified
        assert_eq!(uri.svg().as_deref(), Some("<svg></svg>"));
    }
}
