//! On-chain rendering of a lifeform's metadata: an SVG of its grid plus ERC721
//! JSON, returned as a base64 `data:` URI from `token_uri`.

use crate::interfaces::LifeFormData;
use crate::base64;

const GRID_SIZE: u32 = 15;
const CELL: u32 = 10; // px per cell -> 150x150 viewport

pub fn u32_to_decimal(value: u32) -> ByteArray {
    if value == 0 {
        return "0";
    }
    let mut digits: Array<u8> = array![];
    let mut n = value;
    loop {
        if n == 0 {
            break;
        }
        digits.append((48 + (n % 10)).try_into().unwrap());
        n = n / 10;
    };
    reverse_digits(digits)
}

pub fn u256_to_decimal(value: u256) -> ByteArray {
    if value == 0 {
        return "0";
    }
    let mut digits: Array<u8> = array![];
    let mut n = value;
    loop {
        if n == 0 {
            break;
        }
        let digit: u8 = (48 + (n % 10).low).try_into().unwrap();
        digits.append(digit);
        n = n / 10;
    };
    reverse_digits(digits)
}

fn reverse_digits(digits: Array<u8>) -> ByteArray {
    let mut out: ByteArray = "";
    let mut i = digits.len();
    loop {
        if i == 0 {
            break;
        }
        i -= 1;
        out.append_byte(*digits.at(i));
    };
    out
}

/// Render a packed grid state as an SVG (black live cells on white).
pub fn render_svg(state: u256) -> ByteArray {
    let mut svg: ByteArray =
        "<svg xmlns='http://www.w3.org/2000/svg' width='150' height='150' shape-rendering='crispEdges'><rect width='150' height='150' fill='#fff'/>";
    let mut power: u256 = 1;
    let mut row: u32 = 0;
    loop {
        if row >= GRID_SIZE {
            break;
        }
        let mut col: u32 = 0;
        loop {
            if col >= GRID_SIZE {
                break;
            }
            if (state & power) == power {
                svg.append(@"<rect x='");
                svg.append(@u32_to_decimal(col * CELL));
                svg.append(@"' y='");
                svg.append(@u32_to_decimal(row * CELL));
                svg.append(@"' width='10' height='10'/>");
            }
            power = power * 2;
            col += 1;
        };
        row += 1;
    };
    svg.append(@"</svg>");
    svg
}

/// Build the ERC721 metadata JSON. `image` is the (already-built) image data URI.
pub fn build_metadata_json(token_id: u256, data: LifeFormData, image: ByteArray) -> ByteArray {
    let status: ByteArray = if data.is_alive {
        "Alive"
    } else {
        "Dead"
    };
    let kind: ByteArray = if data.is_still {
        "Still life"
    } else if data.is_loop {
        "Loop"
    } else {
        "Path"
    };
    let mut json: ByteArray = "{\"name\":\"Lifeform #";
    json.append(@u256_to_decimal(token_id));
    json
        .append(
            @"\",\"description\":\"An autonomous Conway's Game of Life lifeform living forever on Starknet.\",\"image\":\"",
        );
    json.append(@image);
    json.append(@"\",\"attributes\":[{\"trait_type\":\"Status\",\"value\":\"");
    json.append(@status);
    json.append(@"\"},{\"trait_type\":\"Kind\",\"value\":\"");
    json.append(@kind);
    json.append(@"\"},{\"trait_type\":\"Sequence Length\",\"value\":");
    json.append(@u32_to_decimal(data.sequence_length));
    json.append(@"},{\"trait_type\":\"Age\",\"value\":");
    json.append(@u32_to_decimal(data.age));
    json.append(@"}]}");
    json
}

/// The full `token_uri` value: a base64 `data:application/json` URI embedding a base64 SVG.
pub fn token_uri(token_id: u256, data: LifeFormData) -> ByteArray {
    let mut image: ByteArray = "data:image/svg+xml;base64,";
    image.append(@base64::encode(render_svg(data.current_state)));
    let json = build_metadata_json(token_id, data, image);
    let mut uri: ByteArray = "data:application/json;base64,";
    uri.append(@base64::encode(json));
    uri
}
