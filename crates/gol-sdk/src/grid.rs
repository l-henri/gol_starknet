//! v2 Game of Life engine core — a faithful Rust port of `src/gol_grid_v2.cairo`.
//!
//! The grid is a 41×41 torus. Each row is one `u64` bitmask: bit `c` (0..=40) is column `c`.
//! Compute happens on the unpacked `Rows` ([`u64; N`]); the on-chain `Store`/calldata form is the
//! 7-felt [`GridState`] (6 rows per felt, row `j` at bit offset `41*j` — see [`POW_ROW`]).
//!
//! The token id is the Poseidon hash of the row words widened to `u256` — the same value the
//! contract uses as the ERC-721 id and uniqueness key. `token_id`/`pack` are verified against the
//! live seeded blinker in the tests, which pins the Poseidon + packing to the Cairo implementation.

use crate::types::{Felt, U256};
use starknet_types_core::hash::{Poseidon, StarkHash};

pub const N: usize = 41;
pub const MASK: u64 = 0x1ffffffffff; // 2^41 - 1 (low 41 bits)
pub const TOPBIT: u64 = 0x10000000000; // 2^40 (bit 40 = column N-1)
/// Row stride within a packed felt: `2^41`.
pub const POW_ROW: u64 = 0x20000000000;

/// The unpacked grid: `N` bitboard rows.
pub type Rows = [u64; N];

/// All-dead grid.
pub fn empty() -> Rows {
    [0u64; N]
}

/// Build rows from `(row_index, mask)` pairs (everything else dead). Mirrors Cairo `grid_with`.
pub fn grid_with(rowvals: &[(usize, u64)]) -> Rows {
    let mut rows = [0u64; N];
    for &(r, v) in rowvals {
        rows[r] = v & MASK;
    }
    rows
}

// --- bitboard stepper (port of gol_grid_v2 rotl/rotr/ha/fa/step_row/step) -----------------------

/// Left-neighbour mask: bit i takes column i-1, torus wrap (bit 40 -> bit 0).
#[inline]
fn rotl(x: u64) -> u64 {
    ((x << 1) | (x >> 40)) & MASK
}

/// Right-neighbour mask: bit i takes column i+1, torus wrap (bit 0 -> bit 40).
#[inline]
fn rotr(x: u64) -> u64 {
    ((x >> 1) | ((x & 1) * TOPBIT)) & MASK
}

/// Half adder over bitmasks: (sum, carry) per bit.
#[inline]
fn ha(a: u64, b: u64) -> (u64, u64) {
    (a ^ b, a & b)
}

/// Full adder over bitmasks: (sum, carry) per bit.
#[inline]
fn fa(a: u64, b: u64, c: u64) -> (u64, u64) {
    let (s1, c1) = ha(a, b);
    let (s2, c2) = ha(s1, c);
    (s2, c1 | c2)
}

/// Next state of one row given the rows above (u), current (m), below (d).
fn step_row(u: u64, m: u64, d: u64) -> u64 {
    let ul = rotl(u);
    let ur = rotr(u);
    let ml = rotl(m);
    let mr = rotr(m);
    let dl = rotl(d);
    let dr = rotr(d);

    // Sum the 8 neighbour masks per bit into a 4-bit count.
    let (s1, c1) = fa(ul, u, ur);
    let (s2, c2) = fa(ml, mr, dl);
    let (s3, c3) = ha(d, dr);
    let (ones, ca) = fa(s1, s2, s3);
    let (t1, tc1) = fa(c1, c2, c3);
    let (twos, tc2) = ha(t1, ca);
    let (fours, eights) = ha(tc1, tc2);

    let not_ones = ones ^ MASK;
    let not_fours = fours ^ MASK;
    let not_eights = eights ^ MASK;

    let eq3 = ones & twos & not_fours & not_eights; // count == 3
    let eq2 = not_ones & twos & not_fours & not_eights; // count == 2

    (eq3 | (m & eq2)) & MASK
}

/// One generation over the whole N×N torus.
pub fn step(rows: &Rows) -> Rows {
    let mut out = [0u64; N];
    for r in 0..N {
        let u = rows[if r == 0 { N - 1 } else { r - 1 }];
        let m = rows[r];
        let d = rows[if r == N - 1 { 0 } else { r + 1 }];
        out[r] = step_row(u, m, d);
    }
    out
}

// --- canonicalisation helpers -------------------------------------------------------------------

/// Strict lexicographic order over the row words, row 0 most significant (multi-word `u256 <`).
pub fn lt(a: &Rows, b: &Rows) -> bool {
    for i in 0..N {
        if a[i] != b[i] {
            return a[i] < b[i];
        }
    }
    false
}

/// Row-wise equality.
pub fn eq(a: &Rows, b: &Rows) -> bool {
    a == b
}

// --- identity (Poseidon over the row words) -----------------------------------------------------

/// Poseidon over the row words — the canonical identity of a grid. Matches Cairo `token_hash`
/// (`poseidon_hash_span` over the rows as felts).
pub fn token_hash(rows: &Rows) -> Felt {
    let felts: Vec<Felt> = rows.iter().map(|&r| Felt::from(r)).collect();
    Poseidon::hash_array(&felts)
}

/// ERC-721 token id / uniqueness key: `token_hash` widened to `u256`.
pub fn token_id(rows: &Rows) -> U256 {
    U256::from_felt(&token_hash(rows))
}

// --- torus symmetries (port of gol_grid_v2 apply_d4/translate/apply_symmetry) --------------------
//
// The d4 index table is CONSENSUS-CRITICAL and must match `src/gol_grid_v2.cairo` exactly:
//   0 = identity                     4 = flip horizontal (mirror columns)
//   1 = rotate 90° clockwise         5 = flip vertical (mirror rows)
//   2 = rotate 180°                  6 = transpose (main diagonal)
//   3 = rotate 270° clockwise        7 = anti-transpose
// A full symmetry g = translate(dr, dc) ∘ d4 (dihedral first, then translation).

/// Source cell (sr, sc) whose content lands on output cell (r, c) under d4 element `d4`.
fn d4_source(d4: u8, r: usize, c: usize, last: usize) -> (usize, usize) {
    match d4 {
        0 => (r, c),
        1 => (last - c, r),          // forward: (r,c) -> (c, last-r)
        2 => (last - r, last - c),   // forward: (r,c) -> (last-r, last-c)
        3 => (c, last - r),          // forward: (r,c) -> (last-c, r)
        4 => (r, last - c),          // forward: (r,c) -> (r, last-c)
        5 => (last - r, c),          // forward: (r,c) -> (last-r, c)
        6 => (c, r),                 // forward: (r,c) -> (c, r)
        _ => (last - c, last - r),   // 7, forward: (r,c) -> (last-c, last-r)
    }
}

/// Apply a dihedral (D4) element (per-cell copy, mirrors the Cairo implementation).
pub fn apply_d4(d4: u8, rows: &Rows) -> Rows {
    assert!(d4 < 8, "bad d4");
    if d4 == 0 {
        return *rows;
    }
    let last = N - 1;
    let mut out = [0u64; N];
    for (r, slot) in out.iter_mut().enumerate() {
        let mut v = 0u64;
        for c in 0..N {
            let (sr, sc) = d4_source(d4, r, c, last);
            if (rows[sr] >> sc) & 1 == 1 {
                v |= 1 << c;
            }
        }
        *slot = v;
    }
    out
}

/// Rotate a row's bits left by `dc` columns (bit c -> bit (c+dc) mod N).
#[inline]
fn rot_row_by(x: u64, dc: usize) -> u64 {
    if dc == 0 {
        return x;
    }
    let shifted = (x as u128) << dc;
    (((shifted & MASK as u128) | (shifted >> N)) as u64) & MASK
}

/// Translate the torus: cell (r, c) -> ((r+dr) mod N, (c+dc) mod N).
pub fn translate(rows: &Rows, dr: usize, dc: usize) -> Rows {
    let (drm, dcm) = (dr % N, dc % N);
    let mut out = [0u64; N];
    for (r, slot) in out.iter_mut().enumerate() {
        *slot = rot_row_by(rows[(r + N - drm) % N], dcm);
    }
    out
}

/// Full torus symmetry: translate(dr, dc) ∘ d4. The challenge-burn witness transform.
pub fn apply_symmetry(d4: u8, dr: usize, dc: usize, rows: &Rows) -> Rows {
    translate(&apply_d4(d4, rows), dr, dc)
}

/// Lexicographically smallest grid in the full 13,448-element symmetry orbit, with the witness
/// `(d4, dr, dc)` that produces it. This is the orbit identity for copy detection (mint warnings,
/// indexer dedup): two grids are symmetry copies iff their orbit canonicals are equal.
pub fn symmetry_canonical(rows: &Rows) -> (Rows, u8, usize, usize) {
    let mut best = *rows;
    let mut witness = (0u8, 0usize, 0usize);
    for d4 in 0..8u8 {
        let img = apply_d4(d4, rows);
        for dr in 0..N {
            for dc in 0..N {
                let cand = translate(&img, dr, dc);
                if lt(&cand, &best) {
                    best = cand;
                    witness = (d4, dr, dc);
                }
            }
        }
    }
    (best, witness.0, witness.1, witness.2)
}

/// `translate(img, dr, dc) == b`, without materializing the translated grid (early-exit compare).
fn translated_eq(img: &Rows, dr: usize, dc: usize, b: &Rows) -> bool {
    for r in 0..N {
        if rot_row_by(img[(r + N - dr) % N], dc) != b[r] {
            return false;
        }
    }
    true
}

/// Search for a challenge witness: `(d4, dr, dc, k)` with `apply_symmetry(d4, dr, dc, step^k(a)) == b`,
/// scanning `k` in `0..=max_k`. Used to plan a `challenge_burn` (for paths `max_k` = the length gap;
/// for loops `max_k` = period − 1). Returns the first match found.
pub fn find_witness(a: &Rows, b: &Rows, max_k: u32) -> Option<(u8, usize, usize, u32)> {
    let mut cur = *a;
    for k in 0..=max_k {
        for d4 in 0..8u8 {
            let img = apply_d4(d4, &cur);
            for dr in 0..N {
                for dc in 0..N {
                    if translated_eq(&img, dr, dc, b) {
                        return Some((d4, dr, dc, k));
                    }
                }
            }
        }
        if k < max_k {
            cur = step(&cur);
        }
    }
    None
}

// --- storage form: 7-felt row-aligned packing ---------------------------------------------------

/// The 7-felt `Store`/calldata form: 41 rows packed 6-per-felt (last 5), row `j` at bit `41*j`.
/// Field order `w0..w6` matches the Cairo `GridState` Serde layout.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct GridState(pub [Felt; 7]);

const WORD_COUNTS: [usize; 7] = [6, 6, 6, 6, 6, 6, 5];
const WORD_STARTS: [usize; 7] = [0, 6, 12, 18, 24, 30, 36];

fn pack_felt(rows: &Rows, start: usize, count: usize) -> Felt {
    // Field arithmetic == integer arithmetic here: a word holds ≤ 6*41 = 246 bits < the felt
    // modulus (~2^251), so no wraparound — matches the Cairo `pack_felt` exactly.
    let pow_row = Felt::from(POW_ROW);
    let mut acc = Felt::ZERO;
    let mut p = Felt::ONE;
    for j in 0..count {
        acc += Felt::from(rows[start + j]) * p;
        p *= pow_row;
    }
    acc
}

/// Extract the 41-bit row at bit `offset` from a felt's little-endian byte image.
fn extract_row(le: &[u8; 32], offset: usize) -> u64 {
    let mut v: u64 = 0;
    for k in 0..41 {
        let b = offset + k;
        let bit = ((le[b >> 3] >> (b & 7)) & 1) as u64;
        v |= bit << k;
    }
    v
}

impl GridState {
    /// Pack the N bitboard rows into the 7-felt storage form.
    pub fn pack(rows: &Rows) -> GridState {
        let mut w = [Felt::ZERO; 7];
        for (i, slot) in w.iter_mut().enumerate() {
            *slot = pack_felt(rows, WORD_STARTS[i], WORD_COUNTS[i]);
        }
        GridState(w)
    }

    /// Unpack the 7-felt storage form back into the N bitboard rows.
    pub fn unpack(&self) -> Rows {
        let mut rows = [0u64; N];
        let mut idx = 0;
        for (i, word) in self.0.iter().enumerate() {
            let le = word.to_bytes_le();
            for j in 0..WORD_COUNTS[i] {
                rows[idx] = extract_row(&le, 41 * j);
                idx += 1;
            }
        }
        rows
    }

    /// The 7 words as calldata felts (Cairo `Serde` order w0..w6).
    pub fn to_calldata(&self) -> [Felt; 7] {
        self.0
    }

    /// Build from 7 consecutive felts (e.g. a slice of an RPC return).
    pub fn from_felts(w: &[Felt]) -> Option<GridState> {
        if w.len() < 7 {
            return None;
        }
        let mut a = [Felt::ZERO; 7];
        a.copy_from_slice(&w[0..7]);
        Some(GridState(a))
    }

    /// Identity hash of the stored grid (`grid_hash(pack(rows)) == token_hash(rows)`).
    pub fn token_hash(&self) -> Felt {
        token_hash(&self.unpack())
    }

    /// Number of live cells.
    pub fn population(&self) -> u32 {
        self.unpack().iter().map(|r| r.count_ones()).sum()
    }

    /// The 7 storage words as comma-joined `0x…` hex (debug/printing).
    pub fn to_hex(&self) -> String {
        self.0
            .iter()
            .map(crate::types::felt_hex)
            .collect::<Vec<_>>()
            .join(",")
    }

    /// Unpacked rows as `f64` (each row < 2^41, exact in `f64`) — for the JS/WASM boundary.
    pub fn rows_f64(&self) -> Vec<f64> {
        self.unpack().iter().map(|&r| r as f64).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn blinker_a() -> Rows {
        grid_with(&[(5, 0b1110)])
    }
    fn blinker_b() -> Rows {
        grid_with(&[(4, 0b0100), (5, 0b0100), (6, 0b0100)])
    }

    #[test]
    fn blinker_oscillates_period_2() {
        let a = blinker_a();
        let b = step(&a);
        assert_eq!(b, blinker_b(), "horizontal -> vertical");
        assert_eq!(step(&b), a, "vertical -> horizontal");
    }

    #[test]
    fn block_is_still() {
        let block = grid_with(&[(10, 0b110), (11, 0b110)]);
        assert_eq!(step(&block), block);
    }

    #[test]
    fn lt_is_lexicographic_row0_msb() {
        let a = blinker_a(); // row4 = 0
        let b = blinker_b(); // row4 = 4
        assert!(lt(&a, &b), "differ first at row4: 0 < 4");
        assert!(!lt(&b, &a));
        assert!(!lt(&a, &a));
    }

    #[test]
    fn pack_unpack_roundtrip() {
        let rows = grid_with(&[(0, 1), (5, 0b1110), (18, 0xABCDE), (36, 0x1234), (40, MASK)]);
        assert_eq!(GridState::pack(&rows).unpack(), rows);
        // identity hash survives the storage round-trip
        assert_eq!(GridState::pack(&rows).token_hash(), token_hash(&rows));
    }

    // The decisive check: the canonical blinker's token_id must equal the live seeded token on
    // Sepolia — pins Poseidon + packing to the deployed Cairo contract.
    #[test]
    fn token_id_matches_live_seeded_blinker() {
        let want = U256::from_felt(
            &Felt::from_hex(
                "0x743d91e948cc844ef3e08dc46ede35fe5ea085981a0176d3203810da80d9416",
            )
            .unwrap(),
        );
        assert_eq!(token_id(&blinker_a()), want);
    }

    // --- torus symmetries (must mirror the Cairo tests in src/gol_grid_v2.cairo) ---------------

    fn busy_seed() -> Rows {
        grid_with(&[
            (1, 0b1110),
            (2, 0b0100),
            (7, 0x155),
            (15, 0x3ff),
            (16, 0x201),
            (25, 0x12345),
            (37, 0b111),
        ])
    }

    #[test]
    fn d4_group_orders() {
        let g = busy_seed();
        let r1 = apply_d4(1, &g);
        let r2 = apply_d4(1, &r1);
        let r3 = apply_d4(1, &r2);
        assert_eq!(apply_d4(1, &r3), g, "rot90^4 = id");
        assert_eq!(r2, apply_d4(2, &g), "rot90^2 = rot180");
        assert_eq!(r3, apply_d4(3, &g), "rot90^3 = rot270");
        for d in 4..8u8 {
            assert_eq!(apply_d4(d, &apply_d4(d, &g)), g, "reflection^2 = id");
        }
    }

    #[test]
    fn translate_wraps_and_composes() {
        let g = busy_seed();
        assert_eq!(translate(&g, N, N), g);
        assert_eq!(translate(&translate(&g, 1, 2), 3, 4), translate(&g, 4, 6));
        assert_ne!(token_id(&translate(&g, 0, 1)), token_id(&g));
    }

    #[test]
    fn step_commutes_with_symmetries() {
        let g = busy_seed();
        let stepped = step(&g);
        for d in 0..8u8 {
            assert_eq!(
                step(&apply_symmetry(d, 3, 7, &g)),
                apply_symmetry(d, 3, 7, &stepped),
                "step must commute with g (d4={d})"
            );
        }
    }

    #[test]
    fn orbit_canonical_detects_copies() {
        let g = busy_seed();
        let copy = apply_symmetry(5, 12, 30, &g);
        let (ca, ..) = symmetry_canonical(&g);
        let (cb, ..) = symmetry_canonical(&copy);
        assert_eq!(ca, cb, "orbit canonicals of copies must match");
        // the returned witness reproduces the canonical
        let (c, d4, dr, dc) = symmetry_canonical(&g);
        assert_eq!(apply_symmetry(d4, dr, dc, &g), c);
        // an unrelated grid lands elsewhere
        let (cu, ..) = symmetry_canonical(&grid_with(&[(20, 0b101)]));
        assert_ne!(ca, cu);
    }

    #[test]
    fn find_witness_recovers_transform_and_step_offset() {
        let a = busy_seed();
        // pure symmetry copy (k = 0)
        let b0 = apply_symmetry(1, 2, 3, &a);
        assert_eq!(find_witness(&a, &b0, 0), Some((1, 2, 3, 0)));
        // stepped + transformed copy (k = 2)
        let b2 = apply_symmetry(4, 0, 5, &step(&step(&a)));
        let (d4, dr, dc, k) = find_witness(&a, &b2, 5).expect("witness exists");
        assert_eq!(k, 2);
        assert_eq!(apply_symmetry(d4, dr, dc, &step(&step(&a))), b2);
        // unrelated grid -> no witness
        assert_eq!(find_witness(&a, &grid_with(&[(20, 0b101)]), 3), None);
    }
}
