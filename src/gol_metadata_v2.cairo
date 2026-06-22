//! v2 on-chain metadata: renders the 41x41 GridState as an SVG and wraps it in ERC721 JSON,
//! returned as a base64 `data:` URI from token_uri. Mirrors v1's gol_metadata but on the bitboard
//! GridState. Reuses the grid-agnostic base64 encoder and decimal helpers.

use gol_starknet::interfaces_v2::LifeFormData;
use gol_starknet::gol_grid_v2::{GridState, unpack, N};
use gol_starknet::base64;
use gol_starknet::gol_metadata::{u32_to_decimal, u256_to_decimal};

const CELL: u32 = 10; // px per cell -> (N*CELL) square viewport

/// Render the grid as an SVG (black live cells on white). Only live cells emit a <rect>, so the
/// output size scales with the live-cell count, not N^2.
pub fn render_svg(state: GridState) -> ByteArray {
    let rows = unpack(@state);
    let dim = u32_to_decimal(N * CELL);
    let mut svg: ByteArray = "<svg xmlns='http://www.w3.org/2000/svg' width='";
    svg.append(@dim);
    svg.append(@"' height='");
    svg.append(@dim);
    svg
        .append(
            @"' shape-rendering='crispEdges'><rect width='100%' height='100%' fill='#fff'/>",
        );
    let mut r: u32 = 0;
    while r < N {
        let row_val = *rows[r];
        // walk bit c of this row with a running power of two (bit c == column c)
        let mut p: u64 = 1;
        let mut c: u32 = 0;
        while c < N {
            if (row_val & p) == p {
                svg.append(@"<rect x='");
                svg.append(@u32_to_decimal(c * CELL));
                svg.append(@"' y='");
                svg.append(@u32_to_decimal(r * CELL));
                svg.append(@"' width='10' height='10'/>");
            }
            p = p * 2;
            c += 1;
        };
        r += 1;
    };
    svg.append(@"</svg>");
    svg
}

/// Build the ERC721 metadata JSON. `image` is the already-built image data URI.
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

/// The full token_uri: a base64 `data:application/json` URI embedding a base64 SVG.
pub fn token_uri(token_id: u256, data: LifeFormData) -> ByteArray {
    let mut image: ByteArray = "data:image/svg+xml;base64,";
    image.append(@base64::encode(render_svg(data.current_state)));
    let json = build_metadata_json(token_id, data, image);
    let mut uri: ByteArray = "data:application/json;base64,";
    uri.append(@base64::encode(json));
    uri
}

#[cfg(test)]
mod tests {
    use super::render_svg;
    use gol_starknet::gol_grid_v2::{grid_with, pack, MASK, N};

    // P5 worst case: every one of the N*N cells alive -> N*N <rect>s. Bounds token_uri's heaviest
    // render. #[ignore]d (step-heavy); run with `snforge test bench_render_dense --ignored
    // --max-n-steps 4000000000`. render_svg alone ~= 252M L2 gas at full density (measured
    // 2026-06-22); real (sparse) creatures are far cheaper (~80M for a blinker token_uri).
    #[test]
    #[ignore]
    fn bench_render_dense() {
        let mut rowvals: Array<(usize, u64)> = ArrayTrait::new();
        let mut r: usize = 0;
        while r < N {
            rowvals.append((r, MASK));
            r += 1;
        };
        let full = pack(@grid_with(@rowvals));
        let svg = render_svg(full);
        assert(svg.len() > 1000, 'dense svg renders');
    }
}
