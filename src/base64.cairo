//! Minimal standard base64 encoder, used to build on-chain `data:` URIs.

/// Map a 6-bit value (0..63) to its base64 alphabet char, arithmetically. This avoids a
/// `ByteArray.at` lookup into a 64-char table per output char — a per-char ByteArray index is the
/// dominant cost when encoding kilobyte payloads on-chain, so computing the char directly is a
/// large gas win over the table-lookup form.
fn b64_char(v: u32) -> u8 {
    if v < 26 {
        (65 + v).try_into().unwrap() // 'A'..'Z'
    } else if v < 52 {
        (71 + v).try_into().unwrap() // 'a'..'z'  (97 - 26)
    } else if v < 62 {
        (v - 4).try_into().unwrap() // '0'..'9'  (48 - 52)
    } else if v == 62 {
        43 // '+'
    } else {
        47 // '/'
    }
}

/// Encode raw bytes as standard base64 (with `=` padding).
pub fn encode(data: ByteArray) -> ByteArray {
    let pad: u8 = 61; // '='
    let len = data.len();
    let mut out: ByteArray = "";
    let mut i: usize = 0;
    while i < len {
        let has1 = i + 1 < len;
        let has2 = i + 2 < len;
        let b0: u32 = data.at(i).unwrap().into();
        let b1: u32 = if has1 {
            data.at(i + 1).unwrap().into()
        } else {
            0
        };
        let b2: u32 = if has2 {
            data.at(i + 2).unwrap().into()
        } else {
            0
        };
        let n: u32 = b0 * 65536 + b1 * 256 + b2;
        out.append_byte(b64_char((n / 262144) % 64));
        out.append_byte(b64_char((n / 4096) % 64));
        out.append_byte(if has1 {
            b64_char((n / 64) % 64)
        } else {
            pad
        });
        out.append_byte(if has2 {
            b64_char(n % 64)
        } else {
            pad
        });
        i += 3;
    };
    out
}
