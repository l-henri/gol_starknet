//! v2 grid core — 38x38 toroidal Game of Life on a row-per-word bitboard.
//!
//! Each grid row is one `u64` bitmask (38 bits used, bit `i` = column `i`); a generation is
//! computed with bitwise full-adders across three adjacent rows. This is the stepper validated in
//! `spike/v2_stepper`, brought into the package, plus the two pieces the v2 design needs on top:
//!
//!   * `lt`        — lexicographic total order over the row words (row 0 most significant). The
//!                   multi-word generalization of v1's `u256 <`, used to pick a loop's canonical
//!                   (smallest) state.
//!   * `token_id`  — Poseidon over the row words. Compact, STARK-native, collision-resistant; the
//!                   ERC-721 id + uniqueness key for the canonical state.
//!
//! Equivalence is TIME-CYCLE ONLY (per the design): translated/rotated copies are distinct grids.
//! See `docs/v2-grid-redesign.md`.

use core::poseidon::poseidon_hash_span;

pub const N: usize = 41; // grid edge length
pub const MASK: u64 = 0x1ffffffffff; // 2^41 - 1  (low 41 bits)
pub const TOPBIT: u64 = 0x10000000000; // 2^40    (bit 40 = column N-1)

// Storage packing (row-aligned): each felt252 holds 6 whole rows (6*41 = 246 <= 251 bits), so the
// 41 rows fit in 7 felts (rows 0..35 in w0..w5, rows 36..40 in w6). No cross-felt bit straddling.
pub const POW_ROW: felt252 = 0x20000000000; // 2^41 — row stride within a packed felt

// ---------------------------------------------------------------------------
// Bitboard stepper (proven in spike/v2_stepper)
// ---------------------------------------------------------------------------

const TOPBIT_NZ: NonZero<u64> = 0x10000000000; // 2^40, as a divisor
const TWO_NZ: NonZero<u64> = 2;

/// Left-neighbour mask: bit i takes column i-1, torus wrap (bit 40 -> bit 0).
/// One divmod, one OR: for x = q·2^40 + r the rotation is r·2 | q — the parts are
/// disjoint and already ≤ MASK, so no masking is needed (1 bitwise op, was 2).
fn rotl(x: u64) -> u64 {
    let (q, r) = DivRem::div_rem(x, TOPBIT_NZ);
    (r * 2) | q
}

/// Right-neighbour mask: bit i takes column i+1, torus wrap (bit 0 -> bit 40).
/// For x = q·2 + r the rotation is q | r·2^40 — disjoint, ≤ MASK (1 bitwise op, was 3).
fn rotr(x: u64) -> u64 {
    let (q, r) = DivRem::div_rem(x, TWO_NZ);
    q | (r * TOPBIT)
}

/// Half adder over bitmasks: (sum, carry) per bit.
fn ha(a: u64, b: u64) -> (u64, u64) {
    (a ^ b, a & b)
}

/// Full adder over bitmasks: (sum, carry) per bit.
fn fa(a: u64, b: u64, c: u64) -> (u64, u64) {
    let (s1, c1) = ha(a, b);
    let (s2, c2) = ha(s1, c);
    (s2, c1 | c2)
}

/// One generation over the whole NxN torus.
///
/// Two passes sharing the horizontal work: pass 1 rotates and sums each row ONCE
/// (t + 2·tc = l+m+r, the 3-cell sum any adjacent row needs; p + 2·pc = l+r, the 2-cell
/// sum the row itself needs), pass 2 adds the three row-sums per output row. Same
/// full-adder network as the original step_row, deduplicated: 29 bitwise ops + 2 divmods
/// per row instead of 53 + 6 (each input row was previously rotated/summed three times,
/// once per adjacent output row). Inputs must be masked 41-bit rows (pack/unpack form).
pub fn step(rows: @Array<u64>) -> Array<u64> {
    // Pass 1: per-row horizontal sum/carry planes.
    let mut h: Array<(u64, u64, u64, u64)> = ArrayTrait::new();
    let mut r: usize = 0;
    while r != N {
        let m = *rows[r];
        let l = rotl(m);
        let rt = rotr(m);
        let (t, tc) = fa(l, m, rt);
        let (p, pc) = ha(l, rt);
        h.append((t, tc, p, pc));
        r += 1;
    };
    // Pass 2: neighbour count of row i = (l+m+r)(i-1) + (l+r)(i) + (l+m+r)(i+1),
    // accumulated into per-bit count planes (ones, twos, fours, eights).
    let mut out: Array<u64> = ArrayTrait::new();
    let mut i: usize = 0;
    while i != N {
        let up = if i == 0 {
            N - 1
        } else {
            i - 1
        };
        let dn = if i == N - 1 {
            0
        } else {
            i + 1
        };
        let (t_u, tc_u, _, _) = *h[up];
        let (_, _, p, pc) = *h[i];
        let (t_d, tc_d, _, _) = *h[dn];
        let (ones, ca) = fa(t_u, p, t_d);
        let (t2, c2a) = fa(tc_u, pc, tc_d);
        let (twos, c2b) = ha(t2, ca);
        let (fours, eights) = ha(c2a, c2b);
        // Alive iff count == 3, or count == 2 and currently alive: both need twos set
        // with fours/eights clear; ones distinguishes 3 (born) from 2 (needs m). This is
        // the old eq3 | (m & eq2) with the shared factor pulled out.
        let m = *rows[i];
        out.append((ones | m) & twos & (fours ^ MASK) & (eights ^ MASK));
        i += 1;
    };
    out
}

// ---------------------------------------------------------------------------
// Canonicalisation
// ---------------------------------------------------------------------------

/// Strict lexicographic order over the row words, row 0 most significant.
/// The multi-word generalisation of v1's `u256 <`. Total order over distinct grids.
/// Exits on the first differing row — called every generation of every mint walk.
pub fn lt(a: @Array<u64>, b: @Array<u64>) -> bool {
    let mut i: usize = 0;
    let mut result = false;
    while i != N {
        let av = *a[i];
        let bv = *b[i];
        if av != bv {
            result = av < bv;
            break;
        }
        i += 1;
    };
    result
}

/// Poseidon over the row words — the canonical identity of a grid (used as the loop/path id and
/// the equality key for the hash-stored partial-path fields).
pub fn token_hash(rows: @Array<u64>) -> felt252 {
    let mut felts: Array<felt252> = ArrayTrait::new();
    let mut i: usize = 0;
    while i < rows.len() {
        felts.append((*rows[i]).into());
        i += 1;
    };
    poseidon_hash_span(felts.span())
}

/// ERC-721 token id / uniqueness key: the `token_hash` widened to `u256`.
pub fn token_id(rows: @Array<u64>) -> u256 {
    token_hash(rows).into()
}

// ---------------------------------------------------------------------------
// Storage form: row-aligned packing into 7 felt252 words (6 rows/felt, 41-bit rows)
// ---------------------------------------------------------------------------

/// The `Store`/`Serde`-able grid state: 41 bitboard rows packed into 7 felts (see `POW_ROW`).
/// Compute always happens on the unpacked `Array<u64>` rows; this is purely the stored form.
#[derive(Drop, Copy, Serde, PartialEq, starknet::Store)]
pub struct GridState {
    pub w0: felt252,
    pub w1: felt252,
    pub w2: felt252,
    pub w3: felt252,
    pub w4: felt252,
    pub w5: felt252,
    pub w6: felt252,
}

/// Pack `count` rows starting at `start` into a single felt: row j at bit offset 41*j.
fn pack_felt(rows: @Array<u64>, start: usize, count: usize) -> felt252 {
    let mut acc: felt252 = 0;
    let mut p: felt252 = 1;
    let mut j: usize = 0;
    while j < count {
        let rv: felt252 = (*rows[start + j]).into();
        acc = acc + rv * p;
        p = p * POW_ROW;
        j += 1;
    };
    acc
}

/// Pack the N bitboard rows into the 7-felt storage form.
pub fn pack(rows: @Array<u64>) -> GridState {
    GridState {
        w0: pack_felt(rows, 0, 6),
        w1: pack_felt(rows, 6, 6),
        w2: pack_felt(rows, 12, 6),
        w3: pack_felt(rows, 18, 6),
        w4: pack_felt(rows, 24, 6),
        w5: pack_felt(rows, 30, 6),
        w6: pack_felt(rows, 36, 5) // rows 36..40
    }
}

/// Unpack `count` rows out of one felt (low row first), appending to `rows`.
fn unpack_felt(word: felt252, count: usize, ref rows: Array<u64>) {
    let mask_row: u256 = 0x1ffffffffff; // 2^41 - 1
    let pow: u256 = 0x20000000000; // 2^41
    let mut u: u256 = word.into();
    let mut j: usize = 0;
    while j < count {
        let row: u256 = u & mask_row;
        rows.append(row.try_into().unwrap());
        u = u / pow;
        j += 1;
    };
}

/// Unpack the 7-felt storage form back into the N bitboard rows.
pub fn unpack(gs: @GridState) -> Array<u64> {
    let mut rows: Array<u64> = ArrayTrait::new();
    unpack_felt(*gs.w0, 6, ref rows);
    unpack_felt(*gs.w1, 6, ref rows);
    unpack_felt(*gs.w2, 6, ref rows);
    unpack_felt(*gs.w3, 6, ref rows);
    unpack_felt(*gs.w4, 6, ref rows);
    unpack_felt(*gs.w5, 6, ref rows);
    unpack_felt(*gs.w6, 5, ref rows);
    rows
}

/// Identity hash of a stored grid. `grid_hash(pack(rows)) == token_hash(rows)` since `unpack`
/// inverts `pack`, so a stored state and a freshly computed one hash identically.
pub fn grid_hash(gs: @GridState) -> felt252 {
    token_hash(@unpack(gs))
}

// ---------------------------------------------------------------------------
// Torus symmetries (challenge-burn witnesses — see docs/symmetry-challenge-spec.md)
//
// A symmetry g decomposes as translate(dr, dc) ∘ d4[i] (dihedral first, then translation).
// The d4 index table is CONSENSUS-CRITICAL: the SDK and any indexer must match it exactly.
//   0 = identity                     4 = flip horizontal (mirror columns)
//   1 = rotate 90° clockwise         5 = flip vertical (mirror rows)
//   2 = rotate 180°                  6 = transpose (main diagonal)
//   3 = rotate 270° clockwise        7 = anti-transpose
// Life commutes with all of these on the square torus: step(g(s)) == g(step(s)).
// ---------------------------------------------------------------------------

/// Column-bit powers 2^0..2^(N-1), for per-cell reads/writes.
fn pow2_table() -> Array<u64> {
    let mut t: Array<u64> = ArrayTrait::new();
    let mut p: u64 = 1;
    let mut i: usize = 0;
    while i < N {
        t.append(p);
        if i != N - 1 {
            p = p * 2;
        }
        i += 1;
    };
    t
}

fn pow2_128(e: usize) -> u128 {
    let mut p: u128 = 1;
    let mut i: usize = 0;
    while i < e {
        p = p * 2;
        i += 1;
    };
    p
}

/// Source cell (sr, sc) whose content lands on output cell (r, c) under d4 element `d4`
/// (i.e. the inverse mapping, so callers can build the output cell-by-cell).
fn d4_source(d4: u8, r: usize, c: usize, last: usize) -> (usize, usize) {
    if d4 == 0 {
        (r, c)
    } else if d4 == 1 { // forward: (r,c) -> (c, last-r)
        (last - c, r)
    } else if d4 == 2 { // forward: (r,c) -> (last-r, last-c)
        (last - r, last - c)
    } else if d4 == 3 { // forward: (r,c) -> (last-c, r)
        (c, last - r)
    } else if d4 == 4 { // forward: (r,c) -> (r, last-c)
        (r, last - c)
    } else if d4 == 5 { // forward: (r,c) -> (last-r, c)
        (last - r, c)
    } else if d4 == 6 { // forward: (r,c) -> (c, r)
        (c, r)
    } else { // 7, forward: (r,c) -> (last-c, last-r)
        (last - c, last - r)
    }
}

/// Apply a dihedral (D4) element. O(N^2) per-cell copy — fine for the rare challenge tx;
/// the identity is a plain row copy.
pub fn apply_d4(d4: u8, rows: @Array<u64>) -> Array<u64> {
    assert(d4 < 8, 'bad d4');
    let last = N - 1;
    let pow = pow2_table();
    let mut out: Array<u64> = ArrayTrait::new();
    let mut r: usize = 0;
    while r < N {
        let mut v: u64 = 0;
        if d4 == 0 {
            v = *rows[r];
        } else {
            let mut c: usize = 0;
            while c < N {
                let (sr, sc) = d4_source(d4, r, c, last);
                if (*rows[sr] / *pow[sc]) & 1 == 1 {
                    v = v | *pow[c];
                }
                c += 1;
            };
        }
        out.append(v);
        r += 1;
    };
    out
}

/// Rotate a row's bits left by the columns encoded in `mul` (= 2^dc, precomputed by the
/// caller — hoisted out of per-row loops), via u128 headroom.
fn rot_row_by_mul(x: u64, mul: u128) -> u64 {
    if mul == 1 {
        return x;
    }
    let mask128: u128 = MASK.into();
    let pow41: u128 = 0x20000000000; // 2^41
    let shifted: u128 = x.into() * mul;
    let lo: u128 = shifted & mask128;
    let hi: u128 = shifted / pow41; // bits >= 41 wrap around to the low end
    (lo | hi).try_into().unwrap()
}

/// Translate the torus: cell (r, c) -> ((r+dr) mod N, (c+dc) mod N). O(N).
pub fn translate(rows: @Array<u64>, dr: usize, dc: usize) -> Array<u64> {
    let drm = dr % N;
    let dcm = dc % N;
    let mul = pow2_128(dcm); // once — NOT per row
    let mut out: Array<u64> = ArrayTrait::new();
    let mut r: usize = 0;
    while r < N {
        let src = (r + N - drm) % N;
        out.append(rot_row_by_mul(*rows[src], mul));
        r += 1;
    };
    out
}

/// Full torus symmetry: translate(dr, dc) ∘ d4. The challenge-burn witness transform.
pub fn apply_symmetry(d4: u8, dr: usize, dc: usize, rows: @Array<u64>) -> Array<u64> {
    assert(dr < N && dc < N, 'bad shift');
    translate(@apply_d4(d4, rows), dr, dc)
}

// ---------------------------------------------------------------------------
// Naive reference stepper (cheap O(N^2) oracle for tests) — v1-style bool grid
// ---------------------------------------------------------------------------

fn rows_to_grid(rows: @Array<u64>) -> Array<Array<bool>> {
    let mut grid: Array<Array<bool>> = ArrayTrait::new();
    let mut r: usize = 0;
    while r < N {
        let mut v: u64 = *rows[r];
        let mut row: Array<bool> = ArrayTrait::new();
        let mut c: usize = 0;
        while c < N {
            row.append((v & 1) == 1);
            v = v / 2;
            c += 1;
        };
        grid.append(row);
        r += 1;
    };
    grid
}

fn grid_to_rows(grid: @Array<Array<bool>>) -> Array<u64> {
    let mut rows: Array<u64> = ArrayTrait::new();
    let mut r: usize = 0;
    while r < N {
        let row = grid.at(r);
        let mut v: u64 = 0;
        let mut p: u64 = 1;
        let mut c: usize = 0;
        while c < N {
            if *row.at(c) {
                v = v + p;
            }
            if c != N - 1 {
                p = p * 2;
            }
            c += 1;
        };
        rows.append(v);
        r += 1;
    };
    rows
}

fn step_bool(grid: @Array<Array<bool>>) -> Array<Array<bool>> {
    let mut next: Array<Array<bool>> = ArrayTrait::new();
    let mut row: usize = 0;
    while row < N {
        let ra = if row == 0 {
            N - 1
        } else {
            row - 1
        };
        let rb = if row == N - 1 {
            0
        } else {
            row + 1
        };
        let above = grid.at(ra);
        let current = grid.at(row);
        let below = grid.at(rb);
        let mut single: Array<bool> = ArrayTrait::new();
        let mut col: usize = 0;
        while col < N {
            let ca = if col == 0 {
                N - 1
            } else {
                col - 1
            };
            let cb = if col == N - 1 {
                0
            } else {
                col + 1
            };
            let mut n: u32 = 0;
            if *above.at(ca) {
                n += 1;
            }
            if *above.at(col) {
                n += 1;
            }
            if *above.at(cb) {
                n += 1;
            }
            if *current.at(ca) {
                n += 1;
            }
            if *current.at(cb) {
                n += 1;
            }
            if *below.at(ca) {
                n += 1;
            }
            if *below.at(col) {
                n += 1;
            }
            if *below.at(cb) {
                n += 1;
            }
            let alive = *current.at(col);
            let lives = if alive {
                n == 2 || n == 3
            } else {
                n == 3
            };
            single.append(lives);
            col += 1;
        };
        next.append(single);
        row += 1;
    };
    next
}

/// Cheap, correct-by-inspection oracle: unpack to a bool grid, step v1-style, repack.
pub fn step_naive(rows: @Array<u64>) -> Array<u64> {
    let grid = rows_to_grid(rows);
    let next = step_bool(@grid);
    grid_to_rows(@next)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Build an N-row grid; rows not listed are empty. `rowvals` = (row_index, mask).
pub fn grid_with(rowvals: @Array<(usize, u64)>) -> Array<u64> {
    let mut g: Array<u64> = ArrayTrait::new();
    let mut r: usize = 0;
    while r < N {
        let mut v: u64 = 0;
        let mut k: usize = 0;
        while k < rowvals.len() {
            let (idx, val) = *rowvals[k];
            if idx == r {
                v = val;
            }
            k += 1;
        };
        g.append(v);
        r += 1;
    };
    g
}

/// Exits on the first differing row — called every generation of every mint walk.
pub fn eq(a: @Array<u64>, b: @Array<u64>) -> bool {
    let len = a.len();
    if len != b.len() {
        return false;
    }
    let mut i: usize = 0;
    let mut ok = true;
    while i != len {
        if *a[i] != *b[i] {
            ok = false;
            break;
        }
        i += 1;
    };
    ok
}

/// True iff every cell is dead (the empty/"dead" grid). Exits on the first live row.
pub fn is_empty(rows: @Array<u64>) -> bool {
    let len = rows.len();
    let mut i: usize = 0;
    let mut empty = true;
    while i != len {
        if *rows[i] != 0 {
            empty = false;
            break;
        }
        i += 1;
    };
    empty
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::{
        step, step_naive, lt, token_id, grid_with, eq, pack, unpack, N, apply_d4, translate,
        apply_symmetry,
    };

    fn seed() -> Array<u64> {
        grid_with(
            @array![
                (1_usize, 0b1110_u64),
                (2_usize, 0b0100_u64),
                (7_usize, 0x155_u64),
                (15_usize, 0x3ff_u64),
                (16_usize, 0x201_u64),
                (25_usize, 0x12345_u64),
                (37_usize, 0b111_u64),
            ],
        )
    }

    #[test]
    fn blinker_is_period_2() {
        let g0 = grid_with(@array![(5_usize, 0b1110_u64)]);
        let g1 = step(@g0);
        let g2 = step(@g1);
        assert(!eq(@g1, @g0), 'blinker should change');
        assert(eq(@g2, @g0), 'blinker should be period 2');
    }

    #[test]
    fn block_is_still() {
        let g0 = grid_with(@array![(10_usize, 0b110_u64), (11_usize, 0b110_u64)]);
        assert(eq(@step(@g0), @g0), 'block should be still');
    }

    #[test]
    fn empty_stays_empty() {
        let g0 = grid_with(@array![]);
        let g1 = step(@g0);
        let mut i = 0;
        let mut all_zero = true;
        while i < N {
            if *g1[i] != 0 {
                all_zero = false;
            }
            i += 1;
        };
        assert(all_zero, 'empty should stay empty');
    }

    #[test]
    fn bitboard_matches_naive_oracle() {
        // Step both in lockstep; they must agree at every generation.
        let mut cur = seed();
        let mut g: usize = 0;
        while g < 6 {
            let nb = step(@cur);
            let nn = step_naive(@cur);
            assert(eq(@nb, @nn), 'bitboard != oracle');
            cur = nb;
            g += 1;
        };
    }

    #[test]
    fn lt_is_a_strict_order() {
        let a = grid_with(@array![(0_usize, 1_u64)]);
        let b = grid_with(@array![(0_usize, 2_u64)]);
        assert(lt(@a, @b), 'a < b');
        assert(!lt(@b, @a), 'not b < a');
        assert(!lt(@a, @a), 'not a < a');
        // row 0 is most significant: a difference in row 0 dominates any lower row
        let c = grid_with(@array![(0_usize, 1_u64), (5_usize, 0xfff_u64)]);
        let d = grid_with(@array![(0_usize, 2_u64)]);
        assert(lt(@c, @d), 'row0 dominates');
    }

    #[test]
    fn pack_unpack_roundtrips() {
        // a representative grid
        assert(eq(@unpack(@pack(@seed())), @seed()), 'seed roundtrip');
        // edge bits: full first/last rows + top bit (40) and bottom bit (0) in a middle row
        let edge = grid_with(
            @array![
                (0_usize, 0x1ffffffffff_u64),
                (40_usize, 0x1ffffffffff_u64),
                (20_usize, 0x10000000001_u64),
            ],
        );
        assert(eq(@unpack(@pack(@edge)), @edge), 'edge roundtrip');
        // packing is faithful enough that token_id is invariant across a storage round-trip
        assert(token_id(@unpack(@pack(@seed()))) == token_id(@seed()), 'id survives storage');
    }

    #[test]
    fn token_id_distinguishes_and_is_stable() {
        let g = seed();
        assert(token_id(@g) == token_id(@g), 'same grid same id');
        // a different grid -> different id
        let g2 = step(@g);
        assert(token_id(@g) != token_id(@g2), 'diff grid diff id');
        // time-cycle-only: a SHIFTED copy is a DISTINCT token (not spatially canonical)
        let blinker_a = grid_with(@array![(5_usize, 0b1110_u64)]);
        let blinker_b = grid_with(@array![(6_usize, 0b1110_u64)]);
        assert(token_id(@blinker_a) != token_id(@blinker_b), 'shift is distinct');
    }

    // ------------------------------------------------------------------
    // Torus symmetries (docs/symmetry-challenge-spec.md)
    // ------------------------------------------------------------------

    #[test]
    fn d4_group_involutions_and_orders() {
        let g = seed();
        // rot90 has order 4
        let r1 = apply_d4(1, @g);
        let r2 = apply_d4(1, @r1);
        let r3 = apply_d4(1, @r2);
        let r4 = apply_d4(1, @r3);
        assert(!eq(@r1, @g), 'rot90 changes');
        assert(eq(@r4, @g), 'rot90^4 = id');
        // rot90 twice = rot180; three times = rot270
        assert(eq(@r2, @apply_d4(2, @g)), 'rot90^2 = rot180');
        assert(eq(@r3, @apply_d4(3, @g)), 'rot90^3 = rot270');
        // the four reflections are involutions
        let mut d: u8 = 4;
        while d < 8 {
            let once = apply_d4(d, @g);
            assert(eq(@apply_d4(d, @once), @g), 'reflection^2 = id');
            d += 1;
        };
        // identity is a copy
        assert(eq(@apply_d4(0, @g), @g), 'id is id');
    }

    #[test]
    fn translate_wraps_and_composes() {
        let g = seed();
        // full wrap = identity
        assert(eq(@translate(@g, N, N), @g), 'translate N = id');
        // composition: (1,2) then (3,4) = (4,6)
        let t1 = translate(@translate(@g, 1, 2), 3, 4);
        assert(eq(@t1, @translate(@g, 4, 6)), 'translation composes');
        // a shifted copy is a different grid (and a distinct token)
        assert(!eq(@translate(@g, 1, 0), @g), 'shift changes grid');
        assert(token_id(@translate(@g, 0, 1)) != token_id(@g), 'shift changes id');
    }

    #[test]
    fn step_commutes_with_symmetries() {
        // Equivariance step(g(s)) == g(step(s)) — the property the challenge-burn relies on.
        let g = seed();
        let stepped = step(@g);
        let mut d: u8 = 0;
        while d < 8 {
            let a = step(@apply_symmetry(d, 3, 7, @g));
            let b = apply_symmetry(d, 3, 7, @stepped);
            assert(eq(@a, @b), 'step commutes with g');
            d += 1;
        };
    }

    // P5 gas probes: per-generation step cost at 41x41 = (gas(bench_step_101) - gas(bench_step_1))
    // / 100. Read l2_gas via `snforge test bench_step`.
    fn run_n(gens: usize) -> u64 {
        let mut cur = seed();
        let mut g: usize = 0;
        while g < gens {
            cur = step(@cur);
            g += 1;
        };
        // force full evaluation
        let mut s: u64 = 0;
        let mut i: usize = 0;
        while i < N {
            s = s ^ *cur[i];
            i += 1;
        };
        s
    }

    // #[ignore]d so the default suite stays fast/green; run with
    // `snforge test bench_step --ignored`. Per-gen = (bench_step_101 - bench_step_1)/100
    // ~= 1.64M L2 gas/generation at 41x41 (measured 2026-08-03, shared-horizontal-sums
    // stepper; was 2.64M with the per-row step_row on 2026-06-22).
    #[test]
    #[ignore]
    fn bench_step_1() {
        assert(run_n(1) != 0xdeadbeef, 'x');
    }

    #[test]
    #[ignore]
    fn bench_step_101() {
        assert(run_n(101) != 0xdeadbeef, 'x');
    }
}
