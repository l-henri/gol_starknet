//! Minimal standard base64 encoder, used to build on-chain `data:` URIs.

/// Encode raw bytes as standard base64 (with `=` padding).
pub fn encode(data: ByteArray) -> ByteArray {
    let table: ByteArray = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let pad: u8 = 61; // '='
    let len = data.len();
    let mut out: ByteArray = "";
    let mut i: usize = 0;
    loop {
        if i >= len {
            break;
        }
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
        out.append_byte(table.at((n / 262144) % 64).unwrap());
        out.append_byte(table.at((n / 4096) % 64).unwrap());
        out.append_byte(if has1 {
            table.at((n / 64) % 64).unwrap()
        } else {
            pad
        });
        out.append_byte(if has2 {
            table.at(n % 64).unwrap()
        } else {
            pad
        });
        i += 3;
    };
    out
}
