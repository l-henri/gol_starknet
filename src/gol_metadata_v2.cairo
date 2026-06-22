//! v2 on-chain metadata — Art Blocks-style interactive renderer.
//!
//! token_uri returns `data:application/json;base64,<json>`; the JSON's `animation_url` is a
//! self-contained `data:text/html;base64,<html>` page whose embedded <script> reconstructs the
//! 41x41 toroidal grid from injected ROW VALUES and animates Conway's Game of Life, adapting the
//! display to the lifeform's traits (kind/status/age). No SVG: the on-chain payload is a fixed JS
//! template + the 41 row masks + a few trait values, so its size is independent of grid density.

use gol_starknet::interfaces_v2::LifeFormData;
use gol_starknet::gol_grid_v2::{GridState, unpack};
use gol_starknet::base64;
use gol_starknet::gol_metadata::{u32_to_decimal, u256_to_decimal};

/// u64 -> decimal ByteArray (row masks exceed u32, so we need our own).
fn u64_to_decimal(value: u64) -> ByteArray {
    if value == 0 {
        return "0";
    }
    let mut digits: Array<u8> = array![];
    let mut n = value;
    while n != 0 {
        digits.append((48 + (n % 10)).try_into().unwrap());
        n = n / 10;
    };
    let mut out: ByteArray = "";
    let mut i = digits.len();
    while i != 0 {
        i -= 1;
        out.append_byte(*digits.at(i));
    };
    out
}

/// The 41 row masks as a JS array literal, e.g. `[14,0,4,...]`. Each value < 2^41, safe as a JS
/// Number (the renderer extracts bits arithmetically, not via 32-bit bitwise ops).
fn rows_js(state: GridState) -> ByteArray {
    let rows = unpack(@state);
    let mut out: ByteArray = "[";
    let mut i: usize = 0;
    while i < rows.len() {
        if i != 0 {
            out.append(@",");
        }
        out.append(@u64_to_decimal(*rows[i]));
        i += 1;
    };
    out.append(@"]");
    out
}

/// The self-contained HTML page (with embedded renderer JS) for one lifeform.
pub fn render_html(data: LifeFormData) -> ByteArray {
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

    // Head + script preamble up to the injected token data. Single quotes throughout so nothing
    // needs escaping inside the Cairo string literal.
    let mut html: ByteArray =
        "<!doctype html><html><head><meta charset='utf-8'><title>Lifeform</title><style>html,body{margin:0;height:100%;background:#0b0b0f;display:flex;align-items:center;justify-content:center}canvas{image-rendering:pixelated;width:92vmin;height:92vmin}</style></head><body><canvas id='c'></canvas><script>const N=41,ROWS=";
    html.append(@rows_js(data.current_state));
    html.append(@",KIND='");
    html.append(@kind);
    html.append(@"',STATUS='");
    html.append(@status);
    html.append(@"',AGE=");
    html.append(@u32_to_decimal(data.age));
    html.append(@",SEQ=");
    html.append(@u32_to_decimal(data.sequence_length));
    // Renderer: unpack rows -> grid (arithmetic bit extraction), toroidal Conway step, canvas draw,
    // animate unless dead or a still life. Age shifts the live-cell hue ("adapt to token data").
    html
        .append(
            @";function U(rows){const g=[];for(let r=0;r<N;r++){const v=rows[r],l=[];for(let c=0;c<N;c++)l.push(Math.floor(v/Math.pow(2,c))%2);g.push(l);}return g;}function S(g){const n=[];for(let r=0;r<N;r++){const l=[];for(let c=0;c<N;c++){let k=0;for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){if(a||b)k+=g[(r+a+N)%N][(c+b+N)%N];}const al=g[r][c];l.push(((al&&(k===2||k===3))||(!al&&k===3))?1:0);}n.push(l);}return n;}let g=U(ROWS);const cv=document.getElementById('c'),px=12;cv.width=cv.height=N*px;const x=cv.getContext('2d');const dead=STATUS==='Dead';const hue=(140+AGE*7)%360;const col=dead?'#555':'hsl('+hue+',75%,62%)';function D(){x.fillStyle=dead?'#0a0a0a':'#0b0b0f';x.fillRect(0,0,cv.width,cv.height);x.fillStyle=col;for(let r=0;r<N;r++)for(let c=0;c<N;c++)if(g[r][c])x.fillRect(c*px,r*px,px-1,px-1);}D();if(!dead&&KIND!=='Still life')setInterval(function(){g=S(g);D();},180);</script></body></html>",
        );
    html
}

/// ERC-721 JSON with traits and an `animation_url` (the interactive HTML renderer). No `image`
/// field — rendering is the JS, not an SVG.
pub fn build_metadata_json(
    token_id: u256, data: LifeFormData, animation_url: ByteArray,
) -> ByteArray {
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
            @"\",\"description\":\"An autonomous Conway's Game of Life lifeform living forever on Starknet. The image is a self-contained on-chain renderer.\",\"animation_url\":\"",
        );
    json.append(@animation_url);
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

/// The full token_uri: base64 `data:application/json` embedding a base64 `data:text/html` renderer.
pub fn token_uri(token_id: u256, data: LifeFormData) -> ByteArray {
    let mut animation_url: ByteArray = "data:text/html;base64,";
    animation_url.append(@base64::encode(render_html(data)));
    let json = build_metadata_json(token_id, data, animation_url);
    let mut uri: ByteArray = "data:application/json;base64,";
    uri.append(@base64::encode(json));
    uri
}

#[cfg(test)]
mod tests {
    use super::render_html;
    use gol_starknet::gol_grid_v2::{grid_with, pack, MASK, N};
    use gol_starknet::interfaces_v2::LifeFormData;

    fn lifeform(state: gol_starknet::gol_grid_v2::GridState) -> LifeFormData {
        LifeFormData {
            is_loop: true,
            is_still: false,
            is_alive: true,
            is_dead: false,
            sequence_length: 2,
            current_state: state,
            age: 5,
        }
    }

    // The renderer's size is independent of grid density: a full 41x41 grid and a 3-cell blinker
    // produce HTML of comparable, small size (fixed template + 41 row numbers). Contrast the old
    // SVG, which emitted one <rect> per live cell (up to ~252M gas at full density).
    #[test]
    fn render_is_density_independent_and_compact() {
        let sparse = pack(@grid_with(@array![(5_usize, 0b1110_u64)]));
        let mut rowvals: Array<(usize, u64)> = ArrayTrait::new();
        let mut r: usize = 0;
        while r < N {
            rowvals.append((r, MASK));
            r += 1;
        };
        let dense = pack(@grid_with(@rowvals));

        let hs = render_html(lifeform(sparse)).len();
        let hd = render_html(lifeform(dense)).len();
        // both small, and the dense one is only larger by the extra digits in the row array
        assert(hs > 800 && hs < 4000, 'sparse compact');
        assert(hd < 4000, 'dense still compact');
        assert(hd - hs < 600, 'density barely matters');
    }
}
