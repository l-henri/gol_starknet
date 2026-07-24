//! v2 on-chain metadata — Art Blocks-style interactive renderer + static SVG fallback.
//!
//! token_uri returns `data:application/json,<json>` (raw). The JSON carries TWO visual fields:
//!   * `animation_url` — a self-contained `data:text/html;base64,<html>` page whose embedded
//!     <script> reconstructs the 41x41 toroidal grid from injected ROW VALUES and animates Conway's
//!     Game of Life. Fixed JS template + 41 row masks, so its size is independent of grid density.
//!     This is the canonical piece.
//!   * `image` — a static `data:image/svg+xml;base64,<svg>` snapshot of the current generation, for
//!     wallets/marketplaces that don't execute `animation_url`. One <rect> per LIVE cell, so unlike
//!     the HTML its size (and token_uri gas) scales with density (see the bench_svg_*/bench_uri_*
//!     gas probes — the reason worst-case density was measured before shipping this).

use gol_starknet::interfaces_v2::{LifeFormData, RenderParams, SPEED_MAX};
use gol_starknet::gol_grid_v2::{GridState, unpack, N};
use gol_starknet::base64;
use gol_starknet::gol_metadata::{u32_to_decimal, u256_to_decimal};

/// A-heuristic: deterministically derive a token's render params from its token_id (the Poseidon
/// hash, unique per token). Low 24 bits -> cell color, next 24 -> bg color (XOR-flipped if it
/// collides with cell, so bg != cell always), next slice -> speed in [1, SPEED_MAX).
pub fn derive_params(token_id: u256) -> RenderParams {
    let cell: u32 = (token_id & 0xffffff).try_into().unwrap();
    let bg_raw: u32 = ((token_id / 0x1000000) & 0xffffff).try_into().unwrap();
    let bg: u32 = if bg_raw == cell {
        bg_raw ^ 0xffffff_u32
    } else {
        bg_raw
    };
    let span: u256 = (SPEED_MAX - 1).into();
    let speed: u16 = ((token_id / 0x1000000000000) % span + 1).try_into().unwrap();
    RenderParams { bg, cell, speed }
}

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

/// The self-contained HTML page (with embedded renderer JS) for one lifeform. Visuals come from the
/// per-token RenderParams (bg/cell color as 0xRRGGBB, speed in generations/second).
pub fn render_html(state: GridState, bg: u32, cell: u32, speed: u16) -> ByteArray {
    // Head + script preamble up to the injected token data. Single quotes throughout so nothing
    // needs escaping inside the Cairo string literal.
    let mut html: ByteArray =
        "<!doctype html><html><head><meta charset='utf-8'><title>Lifeform</title><style>html,body{margin:0;height:100%;background:#0b0b0f;display:flex;align-items:center;justify-content:center}canvas{image-rendering:pixelated;width:92vmin;height:92vmin}</style></head><body><canvas id='c'></canvas><script>const N=41,ROWS=";
    html.append(@rows_js(state));
    html.append(@",BG=");
    html.append(@u32_to_decimal(bg));
    html.append(@",CELL=");
    html.append(@u32_to_decimal(cell));
    html.append(@",SPEED=");
    html.append(@u32_to_decimal(speed.into()));
    // Renderer: unpack rows -> grid (arithmetic bit extraction), toroidal Conway step, canvas draw,
    // animate at SPEED gen/sec. Colors are formatted from the injected 0xRRGGBB numbers.
    html
        .append(
            @";function hx(n){return '#'+n.toString(16).padStart(6,'0');}function U(rows){const g=[];for(let r=0;r<N;r++){const v=rows[r],l=[];for(let c=0;c<N;c++)l.push(Math.floor(v/Math.pow(2,c))%2);g.push(l);}return g;}function S(g){const n=[];for(let r=0;r<N;r++){const l=[];for(let c=0;c<N;c++){let k=0;for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){if(a||b)k+=g[(r+a+N)%N][(c+b+N)%N];}const al=g[r][c];l.push(((al&&(k===2||k===3))||(!al&&k===3))?1:0);}n.push(l);}return n;}let g=U(ROWS);const cv=document.getElementById('c'),px=12;cv.width=cv.height=N*px;const x=cv.getContext('2d');const bgc=hx(BG),cellc=hx(CELL);function D(){x.fillStyle=bgc;x.fillRect(0,0,cv.width,cv.height);x.fillStyle=cellc;for(let r=0;r<N;r++)for(let c=0;c<N;c++)if(g[r][c])x.fillRect(c*px,r*px,px-1,px-1);}D();setInterval(function(){g=S(g);D();},Math.round(1000/SPEED));</script></body></html>",
        );
    html
}

// -------------------------------------------------------------------------------------------------
// Static SVG snapshot — the ERC-721 `image` fallback for consumers that don't run `animation_url`.
//
// Bit convention matches render_html EXACTLY (consensus-critical): row r, bit c (LSB = column 0) is
// the cell at (col c, row r). Unit cells in a `0 0 N N` viewBox keep every coord to 1–2 digits, and
// a single `<g fill>` wraps all live cells so each <rect> omits its own fill. Cost note: one <rect>
// per LIVE cell means size/gas scale with density — sparse creatures are cheap, a full grid is the
// worst case. That is the whole reason for the bench_svg_*/bench_uri_* probes.
// -------------------------------------------------------------------------------------------------

const SVG_CELL_PX: u32 = 12; // display px per cell (N*12), matching render_html's canvas scale

/// Format a 24-bit color as a 6-digit lowercase `#RRGGBB` string.
fn color_hex(rgb: u32) -> ByteArray {
    let mut out: ByteArray = "#";
    let mut div: u32 = 0x100000; // 16^5 — emit the most-significant nibble first
    let mut i: u32 = 0;
    while i < 6 {
        let nib: u32 = (rgb / div) & 0xf;
        let ch: u8 = if nib < 10 {
            (48 + nib).try_into().unwrap() // '0'..'9'
        } else {
            (87 + nib).try_into().unwrap() // 'a'..'f'
        };
        out.append_byte(ch);
        div = div / 16;
        i += 1;
    };
    out
}

// Max horizontal runs before token_uri swaps the per-cell SVG for a fixed emblem — keeping token_uri
// revert-proof and roughly uniform-cost for ANY state. Set LOW because the node's `starknet_call`
// gas budget is tight: the deployed HTML-only token_uri is ~38.6M and ~162M is known to revert
// (v2-deployment.md). At RUN_CAP=16 the in-full ceiling is ~90M (≈ the over-cap fallback cost), so
// simple creatures (blinkers, gliders, small oscillators/still-lifes) render in full and busier
// states — including a solid grid (41 runs) — show the emblem. CONSERVATIVE default: raise it toward
// the node's real budget once a live view-call measures the headroom (bench_uri_* give per-state gas).
const RUN_CAP: usize = 16;

/// Number of horizontal runs of live cells across the grid (one run = one `<rect>` in render_svg).
/// Cheap bit scan, no string building — used to decide the per-cell vs fallback render.
fn count_runs(rows: @Array<u64>) -> usize {
    let mut total: usize = 0;
    let mut r: usize = 0;
    while r < N {
        let mut m: u64 = *rows[r];
        let mut c: usize = 0;
        while c < N {
            if (m & 1) == 1 {
                total += 1;
                while c < N && (m & 1) == 1 {
                    m = m / 2;
                    c += 1;
                };
            } else {
                m = m / 2;
                c += 1;
            }
        };
        r += 1;
    };
    total
}

/// The fixed fallback image for over-cap (noise) states: a small centred glider emblem in the
/// token's own colours. Signals "a dense lifeform" without drawing the unbounded per-cell grid; the
/// real thing is still in `animation_url`.
fn render_svg_fallback(bg: u32, cell: u32) -> ByteArray {
    let n_dec = u32_to_decimal(N);
    let side = u32_to_decimal(SVG_CELL_PX * N);
    let mut svg: ByteArray = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ";
    svg.append(@n_dec);
    svg.append(@" ");
    svg.append(@n_dec);
    svg.append(@"' shape-rendering='crispEdges' width='");
    svg.append(@side);
    svg.append(@"' height='");
    svg.append(@side);
    svg.append(@"'><rect width='");
    svg.append(@n_dec);
    svg.append(@"' height='");
    svg.append(@n_dec);
    svg.append(@"' fill='");
    svg.append(@color_hex(bg));
    svg.append(@"'/><g fill='");
    svg.append(@color_hex(cell));
    // centred glider: (20,19) (21,20) then the run (19..21, 21)
    svg
        .append(
            @"'><rect x='20' y='19' width='1' height='1'/><rect x='21' y='20' width='1' height='1'/><rect x='19' y='21' width='3' height='1'/></g></svg>",
        );
    svg
}

/// Render a grid state as a static SVG: `cell`-colored live cells over a full-canvas `bg` rect.
/// Over RUN_CAP horizontal runs (near-checkerboard noise) it returns a fixed emblem instead, so the
/// output — and token_uri's gas — is bounded for every possible state.
pub fn render_svg(state: GridState, bg: u32, cell: u32) -> ByteArray {
    let rows = unpack(@state);
    if count_runs(@rows) > RUN_CAP {
        return render_svg_fallback(bg, cell);
    }
    let n_dec = u32_to_decimal(N); // grid edge (viewBox + bg rect dims)
    let side = u32_to_decimal(SVG_CELL_PX * N); // rendered px per side
    let mut svg: ByteArray = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ";
    svg.append(@n_dec);
    svg.append(@" ");
    svg.append(@n_dec);
    svg.append(@"' shape-rendering='crispEdges' width='");
    svg.append(@side);
    svg.append(@"' height='");
    svg.append(@side);
    svg.append(@"'><rect width='");
    svg.append(@n_dec);
    svg.append(@"' height='");
    svg.append(@n_dec);
    svg.append(@"' fill='");
    svg.append(@color_hex(bg));
    svg.append(@"'/><g fill='");
    svg.append(@color_hex(cell));
    svg.append(@"'>");
    // Run-length rects: one <rect> per HORIZONTAL run of live cells (not per cell). A solid/clustered
    // region collapses to a few wide rects, so cost tracks the number of runs, not the live-cell
    // count — dense-but-clustered grids (what real Life patterns are) stay cheap. The pathological
    // worst case is an alternating checkerboard (every cell its own run); see bench_uri_checker.
    let mut r: usize = 0;
    while r < N {
        let mut m: u64 = *rows[r];
        let mut c: usize = 0;
        while c < N {
            if (m & 1) == 1 {
                let start = c;
                let mut runlen: usize = 0;
                while c < N && (m & 1) == 1 {
                    runlen += 1;
                    m = m / 2;
                    c += 1;
                };
                svg.append(@"<rect x='");
                svg.append(@u32_to_decimal(start));
                svg.append(@"' y='");
                svg.append(@u32_to_decimal(r));
                svg.append(@"' width='");
                svg.append(@u32_to_decimal(runlen));
                svg.append(@"' height='1'/>");
            } else {
                m = m / 2;
                c += 1;
            }
        };
        r += 1;
    };
    svg.append(@"</g></svg>");
    svg
}

/// ERC-721 JSON with traits, a static `image` (SVG snapshot of the current generation) and an
/// `animation_url` (the interactive HTML renderer). `image` is the fallback for wallets/marketplaces
/// that don't execute `animation_url`; the animation is the canonical piece.
pub fn build_metadata_json(
    token_id: u256, data: LifeFormData, image: ByteArray, animation_url: ByteArray,
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
    let mut json: ByteArray = "{\"name\":\"Lifeform ";
    json.append(@u256_to_decimal(token_id));
    json
        .append(
            @"\",\"description\":\"An autonomous Conway's Game of Life lifeform living forever on Starknet. The still image is a snapshot of its current generation; animation_url is a self-contained on-chain renderer that brings it to life.\",\"image\":\"",
        );
    json.append(@image);
    json.append(@"\",\"animation_url\":\"");
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

/// The full token_uri: a raw `data:application/json` URI whose `image` is a base64 SVG snapshot and
/// whose `animation_url` is a base64 `data:text/html` renderer.
///
/// The JSON is returned RAW (not base64) — base64-encoding the ~2.4KB JSON on-chain was the single
/// largest cost in token_uri (~54M gas) and pushed a node view-call over its gas budget. The JSON
/// contains no URI-reserved chars that break a `data:` payload (no `#`/`%`; the name omits `#`), so
/// a consumer reads everything after the first comma and `JSON.parse`s it directly. Both the SVG and
/// the HTML stay base64 (they carry `#` colors and spaces a raw `data:` URI can't hold safely).
pub fn token_uri(token_id: u256, data: LifeFormData, rp: RenderParams) -> ByteArray {
    let mut image: ByteArray = "data:image/svg+xml;base64,";
    image.append(@base64::encode(render_svg(data.current_state, rp.bg, rp.cell)));
    let mut animation_url: ByteArray = "data:text/html;base64,";
    animation_url.append(@base64::encode(render_html(data.current_state, rp.bg, rp.cell, rp.speed)));
    let json = build_metadata_json(token_id, data, image, animation_url);
    let mut uri: ByteArray = "data:application/json,";
    uri.append(@json);
    uri
}

#[cfg(test)]
mod tests {
    use super::{render_html, render_svg, derive_params, token_uri};
    use gol_starknet::base64;
    use gol_starknet::gol_grid_v2::{grid_with, pack, MASK, N};
    use gol_starknet::interfaces_v2::{SPEED_MAX, LifeFormData, RenderParams};

    // ---- gas benches (run: `snforge test bench_uri --ignored`) ----------------------------------
    // Pinpoint where token_uri's gas goes: render_html (string build) vs inner base64 vs the full
    // path (json build + outer base64). Subtract to attribute cost.
    #[test]
    #[ignore]
    fn bench_uri_render_html() {
        let s = pack(@grid_with(@array![(5_usize, 0b1110_u64)]));
        let h = render_html(s, 0x810da8, 0xd9416, 105);
        assert(h.len() > 100, 'html');
    }

    #[test]
    #[ignore]
    fn bench_uri_inner_base64() {
        let s = pack(@grid_with(@array![(5_usize, 0b1110_u64)]));
        let b = base64::encode(render_html(s, 0x810da8, 0xd9416, 105));
        assert(b.len() > 100, 'b64');
    }

    #[test]
    #[ignore]
    fn bench_uri_full() {
        let s = pack(@grid_with(@array![(5_usize, 0b1110_u64)]));
        let lf = LifeFormData {
            is_loop: true, is_still: false, is_alive: true, is_dead: false,
            sequence_length: 2, current_state: s, age: 5,
        };
        let u = token_uri(
            0x743d91e948cc844ef3e08dc46ede35fe5ea085981a0176d3203810da80d9416_u256,
            lf,
            RenderParams { bg: 0x810da8, cell: 0xd9416, speed: 105 },
        );
        assert(u.len() > 100, 'uri');
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

        let hs = render_html(sparse, 0x0b0b0f, 0x7ef9a0, 12).len();
        let hd = render_html(dense, 0x0b0b0f, 0x7ef9a0, 12).len();
        // both small, and the dense one is only larger by the extra digits in the row array
        assert(hs > 800 && hs < 4000, 'sparse compact');
        assert(hd < 4000, 'dense still compact');
        assert(hd - hs < 600, 'density barely matters');
    }

    // derive_params always satisfies the invariants: bg != cell and 0 < speed < SPEED_MAX.
    #[test]
    fn derive_params_respects_invariants() {
        let p = derive_params(0x123456789abcdef0fedcba_u256);
        assert(p.bg != p.cell, 'bg differs from cell');
        assert(p.speed > 0 && p.speed < SPEED_MAX, 'speed in range');
        // collision case: token_id 0 -> cell==bg_raw==0 -> XOR fallback flips bg
        let z = derive_params(0);
        assert(z.cell == 0 && z.bg == 0xffffff, 'collision XOR-flipped');
        assert(z.speed > 0 && z.speed < SPEED_MAX, 'speed in range (0)');
    }

    // ---- static SVG `image` -------------------------------------------------------------------

    /// Naive substring search, for asserting specific SVG rects exist / are absent.
    fn contains(hay: @ByteArray, needle: @ByteArray) -> bool {
        let hl = hay.len();
        let nl = needle.len();
        if nl == 0 {
            return true;
        }
        if nl > hl {
            return false;
        }
        let mut i: usize = 0;
        let mut found = false;
        while i <= hl - nl {
            let mut j: usize = 0;
            let mut ok = true;
            while j < nl {
                if hay.at(i + j).unwrap() != needle.at(j).unwrap() {
                    ok = false;
                    break;
                }
                j += 1;
            };
            if ok {
                found = true;
                break;
            }
            i += 1;
        };
        found
    }

    // The SVG must place live cells at the SAME coords the HTML renderer draws: row r, bit c
    // (LSB = column 0) -> cell at (x=c, y=r). Run-length: a horizontal run is ONE rect. Row 5 =
    // 0b1110 -> a run at cols 1..3 (x=1,width=3); row 7 = 0b101 -> two width-1 rects at cols 0 and 2.
    #[test]
    fn render_svg_places_live_cells_on_the_right_coords() {
        let s = pack(@grid_with(@array![(5_usize, 0b1110_u64), (7_usize, 0b101_u64)]));
        let svg = render_svg(s, 0x0b0b0f, 0x7ef9a0);
        assert(contains(@svg, @"fill='#0b0b0f'"), 'bg color formatted');
        assert(contains(@svg, @"fill='#7ef9a0'"), 'cell color formatted');
        assert(contains(@svg, @"<rect x='1' y='5' width='3' height='1'/>"), 'run cols 1-3');
        assert(contains(@svg, @"<rect x='0' y='7' width='1' height='1'/>"), 'isolated col0');
        assert(contains(@svg, @"<rect x='2' y='7' width='1' height='1'/>"), 'isolated col2');
        // column 0 of row 5 is dead, and the gap at (col1,row7) must not be filled
        assert(!contains(@svg, @"<rect x='0' y='5'"), 'col0 row5 dead');
        assert(!contains(@svg, @"<rect x='1' y='7'"), 'col1 row7 gap');
    }

    // Over RUN_CAP runs (near-checkerboard noise) render_svg returns the fixed glider emblem instead
    // of the unbounded per-cell grid, keeping token_uri revert-proof. A real creature stays in full.
    #[test]
    fn render_svg_falls_back_over_the_run_cap() {
        let svg = render_svg(over_cap_state(), 0x0b0b0f, 0x7ef9a0);
        assert(contains(@svg, @"<rect x='19' y='21' width='3' height='1'/>"), 'emblem present');
        assert(svg.len() < 500, 'fallback is tiny');
        let blinker = render_svg(pack(@grid_with(@array![(5_usize, 0b1110_u64)])), 0x0b0b0f, 0x7ef9a0);
        assert(contains(@blinker, @"<rect x='1' y='5' width='3' height='1'/>"), 'real render');
        assert(!contains(@blinker, @"x='19' y='21' width='3'"), 'no emblem for real');
    }

    // ---- gas benches (run: `snforge test bench_ --ignored`) -------------------------------------
    // token_uri gas per regime. The numbers that gate deploy: bench_uri_sparse (typical creature) and
    // bench_uri_near_cap (the in-full ceiling) must stay under the node view-call budget (~38.6M
    // deployed works, ~162M reverts); bench_uri_over_cap confirms the pathological tail is bounded by
    // the fallback.

    // Alternating checkerboard: 21 runs/row × 41 = 861 runs, well OVER RUN_CAP -> render_svg returns
    // the fixed emblem. Confirms the cap holds token_uri bounded for the pathological case.
    fn over_cap_state() -> gol_starknet::gol_grid_v2::GridState {
        let mut rowvals: Array<(usize, u64)> = ArrayTrait::new();
        let mut r: usize = 0;
        while r < N {
            rowvals.append((r, 0x15555555555_u64)); // bits 0,2,4,..,40 set (21 runs)
            r += 1;
        };
        pack(@grid_with(@rowvals))
    }

    // Just UNDER the cap: 15 isolated cells = 15 runs (< RUN_CAP=16). The most expensive state that
    // still renders in full — the in-full ceiling token_uri cost.
    fn near_cap_state() -> gol_starknet::gol_grid_v2::GridState {
        let mut rowvals: Array<(usize, u64)> = ArrayTrait::new();
        let mut r: usize = 0;
        while r < 15 {
            rowvals.append((r, 0b1_u64)); // one isolated cell per row -> one run each
            r += 1;
        };
        pack(@grid_with(@rowvals))
    }

    fn lifeform(s: gol_starknet::gol_grid_v2::GridState) -> LifeFormData {
        LifeFormData {
            is_loop: true, is_still: false, is_alive: true, is_dead: false, sequence_length: 2,
            current_state: s, age: 5,
        }
    }

    #[test]
    #[ignore]
    fn bench_svg_sparse() {
        let s = pack(@grid_with(@array![(5_usize, 0b1110_u64)]));
        let svg = render_svg(s, 0x810da8, 0xd9416);
        assert(svg.len() > 100, 'svg');
    }

    #[test]
    #[ignore]
    fn bench_svg_near_cap() {
        let svg = render_svg(near_cap_state(), 0x810da8, 0xd9416);
        assert(svg.len() > 100, 'svg');
    }

    #[test]
    #[ignore]
    fn bench_svg_over_cap() {
        let svg = render_svg(over_cap_state(), 0x810da8, 0xd9416); // -> fallback emblem
        assert(svg.len() > 100, 'svg');
    }

    #[test]
    #[ignore]
    fn bench_uri_sparse() {
        let s = pack(@grid_with(@array![(5_usize, 0b1110_u64)]));
        let u = token_uri(
            0x743d91e948cc844ef3e08dc46ede35fe5ea085981a0176d3203810da80d9416_u256,
            lifeform(s),
            RenderParams { bg: 0x810da8, cell: 0xd9416, speed: 105 },
        );
        assert(u.len() > 100, 'uri');
    }

    #[test]
    #[ignore]
    fn bench_uri_near_cap() {
        // Capped worst case: the most-runs state that still renders in full. Must stay under budget.
        let u = token_uri(
            0x743d91e948cc844ef3e08dc46ede35fe5ea085981a0176d3203810da80d9416_u256,
            lifeform(near_cap_state()),
            RenderParams { bg: 0x810da8, cell: 0xd9416, speed: 105 },
        );
        assert(u.len() > 100, 'uri');
    }

    #[test]
    #[ignore]
    fn bench_uri_over_cap() {
        // Over the cap -> fallback emblem; confirms the pathological case is now cheap.
        let u = token_uri(
            0x743d91e948cc844ef3e08dc46ede35fe5ea085981a0176d3203810da80d9416_u256,
            lifeform(over_cap_state()),
            RenderParams { bg: 0x810da8, cell: 0xd9416, speed: 105 },
        );
        assert(u.len() > 100, 'uri');
    }
}
