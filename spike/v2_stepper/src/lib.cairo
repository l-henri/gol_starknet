//! v2 bigger-grid feasibility spike.
//!
//! Bitwise ("bitboard") Conway's Game of Life stepper for a 38x38 toroidal grid.
//! Each grid row is one u64 bitmask (38 bits used); a generation is computed with
//! bitwise ops across three adjacent rows instead of cell-by-cell.
//!
//! Goal: prove the v2 stepper (a) is correct (matches a naive reference) and
//! (b) measure its on-chain cost vs the naive approach.

pub const N: usize = 38; // grid edge length
pub const MASK: u64 = 0x3fffffffff; // 2^38 - 1  (low 38 bits)
pub const TOPBIT: u64 = 0x2000000000; // 2^37     (bit 37 = column N-1)

// ---------------------------------------------------------------------------
// Bitboard stepper (the v2 candidate)
// ---------------------------------------------------------------------------

/// Left-neighbour mask: bit i takes column i-1, with torus wrap (bit 37 -> bit 0).
fn rotl(x: u64) -> u64 {
    ((x * 2) | (x / TOPBIT)) & MASK
}

/// Right-neighbour mask: bit i takes column i+1, with torus wrap (bit 0 -> bit 37).
fn rotr(x: u64) -> u64 {
    ((x / 2) | ((x & 1) * TOPBIT)) & MASK
}

/// Half adder over bitmasks: returns (sum, carry) per bit.
fn ha(a: u64, b: u64) -> (u64, u64) {
    (a ^ b, a & b)
}

/// Full adder over bitmasks: returns (sum, carry) per bit.
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

    // count == 3  -> ones & twos, not fours/eights
    let eq3 = ones & twos & not_fours & not_eights;
    // count == 2  -> twos only
    let eq2 = not_ones & twos & not_fours & not_eights;

    // born if ==3; survives if alive and ==2 (the ==3 survive case is covered by eq3)
    (eq3 | (m & eq2)) & MASK
}

/// One generation over the whole 38x38 torus.
pub fn step_bitboard(rows: @Array<u64>) -> Array<u64> {
    let mut out = ArrayTrait::new();
    let mut r: usize = 0;
    while r < N {
        let u = *rows[(r + N - 1) % N];
        let m = *rows[r];
        let d = *rows[(r + 1) % N];
        out.append(step_row(u, m, d));
        r += 1;
    };
    out
}

/// Run `gens` generations with the bitboard stepper.
pub fn run_bitboard(rows: Array<u64>, gens: usize) -> Array<u64> {
    let mut cur = rows;
    let mut g: usize = 0;
    while g < gens {
        cur = step_bitboard(@cur);
        g += 1;
    };
    cur
}

// ---------------------------------------------------------------------------
// Naive reference stepper (oracle + cost baseline)
// ---------------------------------------------------------------------------

fn pow2(e: usize) -> u64 {
    let mut p: u64 = 1;
    let mut i: usize = 0;
    while i < e {
        p *= 2;
        i += 1;
    };
    p
}

fn bit(row: u64, c: usize) -> u64 {
    (row / pow2(c)) & 1
}

/// Straightforward cell-by-cell stepper. Correct-by-inspection; used to validate
/// the bitboard stepper and as a naive-cost baseline.
pub fn step_naive(rows: @Array<u64>) -> Array<u64> {
    let mut out = ArrayTrait::new();
    let mut r: usize = 0;
    while r < N {
        let ra = (r + N - 1) % N;
        let rb = (r + 1) % N;
        let mut new_row: u64 = 0;
        let mut c: usize = 0;
        while c < N {
            let ca = (c + N - 1) % N;
            let cb = (c + 1) % N;
            let mut cnt: u64 = 0;
            cnt += bit(*rows[ra], ca) + bit(*rows[ra], c) + bit(*rows[ra], cb);
            cnt += bit(*rows[r], ca) + bit(*rows[r], cb);
            cnt += bit(*rows[rb], ca) + bit(*rows[rb], c) + bit(*rows[rb], cb);
            let alive = bit(*rows[r], c) == 1;
            let lives = if alive {
                cnt == 2 || cnt == 3
            } else {
                cnt == 3
            };
            if lives {
                new_row += pow2(c);
            }
            c += 1;
        };
        out.append(new_row);
        r += 1;
    };
    out
}

pub fn run_naive(rows: Array<u64>, gens: usize) -> Array<u64> {
    let mut cur = rows;
    let mut g: usize = 0;
    while g < gens {
        cur = step_naive(@cur);
        g += 1;
    };
    cur
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Build an N-row grid; rows not listed are empty. `rowvals` = (row_index, mask).
pub fn grid_with(rowvals: @Array<(usize, u64)>) -> Array<u64> {
    let mut g = ArrayTrait::new();
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

/// XOR checksum — used in gas tests to force full evaluation of a result.
pub fn checksum(rows: @Array<u64>) -> u64 {
    let mut s: u64 = 0;
    let mut i: usize = 0;
    while i < rows.len() {
        s = s ^ *rows[i];
        i += 1;
    };
    s
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::{
        N, step_bitboard, step_naive, run_bitboard, grid_with, eq, checksum,
    };

    // A reusable busy seed (several non-trivial rows spread across the grid).
    fn seed() -> Array<u64> {
        grid_with(
            @array![
                (1_usize, 0b1110_u64),
                (2_usize, 0b0100_u64),
                (7_usize, 0x155_u64),
                (8_usize, 0x2aa_u64),
                (15_usize, 0x3ff_u64),
                (16_usize, 0x201_u64),
                (25_usize, 0x12345_u64),
                (30_usize, 0x3ffff_u64),
                (37_usize, 0b111_u64),
            ],
        )
    }

    #[test]
    fn blinker_is_period_2() {
        // horizontal 3-cell line at row 5, cols 1..3
        let g0 = grid_with(@array![(5_usize, 0b1110_u64)]);
        let g1 = step_bitboard(@g0);
        let g2 = step_bitboard(@g1);
        assert(!eq(@g1, @g0), 'blinker should change');
        assert(eq(@g2, @g0), 'blinker should be period 2');
    }

    #[test]
    fn block_is_still() {
        // 2x2 block at rows 10,11 cols 1,2
        let g0 = grid_with(@array![(10_usize, 0b110_u64), (11_usize, 0b110_u64)]);
        let g1 = step_bitboard(@g0);
        assert(eq(@g1, @g0), 'block should be still');
    }

    #[test]
    fn empty_stays_empty() {
        let g0 = grid_with(@array![]);
        let g1 = step_bitboard(@g0);
        assert(checksum(@g1) == 0, 'empty should stay empty');
    }

    #[test]
    fn bitboard_matches_naive_many_gens() {
        let mut cur = seed();
        let mut g: usize = 0;
        // step both in lockstep; they must agree at every generation
        while g < 12 {
            let nb = step_bitboard(@cur);
            let nn = step_naive(@cur);
            assert(eq(@nb, @nn), 'bitboard != naive');
            cur = nb;
            g += 1;
        };
    }

    // ---- gas probes (read with `snforge test --detailed-resources`) ----
    // Per-generation cost = (cost of *_101 - cost of *_1) / 100.

    #[test]
    fn gas_bitboard_1() {
        let r = run_bitboard(seed(), 1);
        assert(r.len() == N && checksum(@r) != 0xdeadbeefdead, 'x');
    }

    #[test]
    fn gas_bitboard_101() {
        let r = run_bitboard(seed(), 101);
        assert(r.len() == N && checksum(@r) != 0xdeadbeefdead, 'x');
    }

    #[test]
    fn gas_bitboard_201() {
        let r = run_bitboard(seed(), 201);
        assert(r.len() == N && checksum(@r) != 0xdeadbeefdead, 'x');
    }

    #[test]
    fn gas_naive_1() {
        let r = super::run_naive(seed(), 1);
        assert(r.len() == N && checksum(@r) != 0xdeadbeefdead, 'x');
    }

    #[test]
    fn gas_naive_4() {
        let r = super::run_naive(seed(), 4);
        assert(r.len() == N && checksum(@r) != 0xdeadbeefdead, 'x');
    }
}
