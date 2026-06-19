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

/// Left-neighbour mask: bit i takes column i-1, torus wrap (bit 37 -> bit 0).
fn rotl(x: u64) -> u64 {
    ((x * 2) | (x / TOPBIT)) & MASK
}

/// Right-neighbour mask: bit i takes column i+1, torus wrap (bit 0 -> bit 37).
fn rotr(x: u64) -> u64 {
    ((x / 2) | ((x & 1) * TOPBIT)) & MASK
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

/// Next state of one row given the rows above (u), current (m), below (d).
fn step_row(u: u64, m: u64, d: u64) -> u64 {
    let ul = rotl(u);
    let ur = rotr(u);
    let ml = rotl(m);
    let mr = rotr(m);
    let dl = rotl(d);
    let dr = rotr(d);

    // Sum the 8 neighbour masks per bit into a 4-bit count (ones, twos, fours, eights).
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

    // born if ==3; survives if alive and ==2 (alive & ==3 is covered by eq3)
    (eq3 | (m & eq2)) & MASK
}

/// One generation over the whole NxN torus.
pub fn step(rows: @Array<u64>) -> Array<u64> {
    let mut out = ArrayTrait::new();
    let mut r: usize = 0;
    while r < N {
        let u = *rows[if r == 0 {
            N - 1
        } else {
            r - 1
        }];
        let m = *rows[r];
        let d = *rows[if r == N - 1 {
            0
        } else {
            r + 1
        }];
        out.append(step_row(u, m, d));
        r += 1;
    };
    out
}

// ---------------------------------------------------------------------------
// Canonicalisation
// ---------------------------------------------------------------------------

/// Strict lexicographic order over the row words, row 0 most significant.
/// The multi-word generalisation of v1's `u256 <`. Total order over distinct grids.
pub fn lt(a: @Array<u64>, b: @Array<u64>) -> bool {
    let mut i: usize = 0;
    let mut decided = false;
    let mut result = false;
    while i < N {
        if !decided && *a[i] != *b[i] {
            result = *a[i] < *b[i];
            decided = true;
        }
        i += 1;
    };
    result
}

/// ERC-721 token id / uniqueness key: Poseidon over the row words.
pub fn token_id(rows: @Array<u64>) -> u256 {
    let mut felts: Array<felt252> = ArrayTrait::new();
    let mut i: usize = 0;
    while i < rows.len() {
        felts.append((*rows[i]).into());
        i += 1;
    };
    let h: felt252 = poseidon_hash_span(felts.span());
    h.into()
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

pub fn eq(a: @Array<u64>, b: @Array<u64>) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut i: usize = 0;
    let mut ok = true;
    while i < a.len() {
        if *a[i] != *b[i] {
            ok = false;
        }
        i += 1;
    };
    ok
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::{step, step_naive, lt, token_id, grid_with, eq, pack, unpack, N};

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
}
