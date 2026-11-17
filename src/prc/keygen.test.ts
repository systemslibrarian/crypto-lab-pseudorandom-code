/**
 * ACCEPTANCE CHECK A — algebra.
 *
 * Expectations here come from the construction as the papers state it, not
 * from this implementation: row weight exactly t, P G = 0, G of shape n x g,
 * the permutation a bijection. Plus the worked example small enough to verify
 * by hand, which is the only test in this file that would survive a rewrite of
 * every other line of `keygen.ts`.
 *
 * Christ & Gunn, IACR ePrint 2024/235, section 2.2 (the G0 sampling procedure)
 * and Definition 3; Wang et al., IACR ePrint 2025/2283, Algorithm 1 (the same
 * procedure with the permutation).
 */

import { describe, expect, it } from 'vitest';
import { getBit, wordsFor } from './bits.js';
import {
  type KeyPair,
  buildKey,
  checkColumns,
  generateKey,
  readRow,
  unitColumn,
  verifyParityCheck,
} from './keygen.js';
import { type Params, OFFERED_N, makeParams } from './params.js';

const ALL_T = [3, 4, 5, 6, 7, 8];
const KEYS_PER_CONFIG = 20;

/** Every row of P must have weight exactly t, with no repeated column. */
function rowWeightsAreExactlyT(key: KeyPair): { bad: number; firstBad: number | null } {
  const { sk } = key;
  let bad = 0;
  let firstBad: number | null = null;
  for (let i = 0; i < sk.r; i++) {
    const cols = checkColumns(sk, i);
    const distinct = new Set<number>();
    for (const c of cols) distinct.add(c);
    if (cols.length !== sk.t || distinct.size !== sk.t) {
      bad++;
      if (firstBad === null) firstBad = i;
    }
  }
  return { bad, firstBad };
}

function isBijection(perm: Int32Array, n: number): boolean {
  if (perm.length !== n) return false;
  const seen = new Uint8Array(n);
  for (const p of perm) {
    if (p < 0 || p >= n || seen[p] === 1) return false;
    seen[p] = 1;
  }
  return true;
}

describe('check A — the key is the object the construction describes', () => {
  for (const n of OFFERED_N) {
    for (const t of ALL_T) {
      it(`n = ${n}, t = ${t}: ${KEYS_PER_CONFIG} keys all satisfy row weight t, P G = 0, G shape, bijection`, () => {
        const params = makeParams({ n, t, eta: 0.05 });
        for (let trial = 0; trial < KEYS_PER_CONFIG; trial++) {
          const key = generateKey(params);

          // Row weight exactly t: t - 1 from s_i plus the check's own unit column.
          const weights = rowWeightsAreExactlyT(key);
          expect(weights.bad, `row ${weights.firstBad} of P does not have weight exactly ${t}`).toBe(0);

          // P G = 0, over every row. This is also checked inside generateKey,
          // which refuses to return a key that fails it; asserting it here is
          // what would catch that refusal being removed.
          const check = verifyParityCheck(key);
          expect(check.ok, `P G != 0 at row ${check.failedRow}`).toBe(true);
          expect(check.rows).toBe(params.r);

          // G has n rows and g columns.
          expect(key.pk.G.length).toBe(n * wordsFor(params.g));
          expect(key.pk.n).toBe(n);
          expect(key.pk.g).toBe(64);

          expect(isBijection(key.perm, n), 'the permutation must be a bijection on the n positions').toBe(true);
        }
      });
    }
  }

  it('r = floor(0.99 n) and k = n - r at both offered sizes', () => {
    // 4096 * 0.99 = 4055.04 and 8192 * 0.99 = 8110.08, so the floor matters.
    expect(makeParams({ n: 4096, t: 3, eta: 0 }).r).toBe(4055);
    expect(makeParams({ n: 4096, t: 3, eta: 0 }).k).toBe(41);
    expect(makeParams({ n: 8192, t: 3, eta: 0 }).r).toBe(8110);
    expect(makeParams({ n: 8192, t: 3, eta: 0 }).k).toBe(82);
  });

  it('every check owns exactly one position that no other check mentions', () => {
    // The unit column is what makes P G = 0 instead of P G = (the appended
    // row), and the construction gives each check its own. Mutation (2) in the
    // brief removes it.
    const params = makeParams({ n: 4096, t: 4, eta: 0.05 });
    const key = generateKey(params);
    const owners = new Map<number, number>();
    for (let i = 0; i < params.r; i++) {
      const unit = unitColumn(key.sk, i);
      expect(owners.has(unit), `position ${unit} is the unit column of two checks`).toBe(false);
      owners.set(unit, i);
    }
    expect(owners.size).toBe(params.r);

    // And each of those positions appears in exactly one row of P.
    const degree = new Int32Array(params.n);
    for (let idx = 0; idx < key.sk.P.length; idx++) degree[key.sk.P[idx]]++;
    for (const unit of owners.keys()) expect(degree[unit]).toBe(1);
  });
});

describe('check A — the hand-sized worked example', () => {
  // k = 4, g = 3, t = 3, so n = k + r = 7 with r = 3 checks. These are not
  // offered sizes — makeParams refuses them, deliberately — so the Params are
  // written out. The arithmetic is checkable with a pencil, which is the point:
  // this test does not depend on any sampler at all.
  //
  //   G0 rows: (1,0,1) (0,1,1) (1,1,0) (0,0,1)
  //   s = (1,0,1,0) -> rows 0 + 2 -> (1,0,1) + (1,1,0) = (0,1,1)
  //   s = (0,1,0,1) -> rows 1 + 3 -> (0,1,1) + (0,0,1) = (0,1,0)
  //   s = (1,1,0,0) -> rows 0 + 1 -> (1,0,1) + (0,1,1) = (1,1,0)
  const params: Params = { n: 7, g: 3, t: 3, r: 3, k: 4, eta: 0 };
  // Bit i of a packed row is column i, so (1,0,1) is 0b101 = 5.
  const g0Rows = Uint32Array.from([0b101, 0b110, 0b011, 0b100]);
  const sVectors = Int32Array.from([0, 2, 1, 3, 0, 1]);
  const z = Uint32Array.from([0]);

  function rowBits(key: KeyPair, row: number): string {
    const out = new Uint32Array(1);
    readRow(key.pk, row, out);
    return [0, 1, 2].map((i) => ((out[0] >>> i) & 1).toString()).join('');
  }

  it('the three appended rows are (0,1,1), (0,1,0) and (1,1,0)', () => {
    const identity = Int32Array.from([0, 1, 2, 3, 4, 5, 6]);
    const key = buildKey(params, { g0Rows, sVectors, perm: identity, z });

    // The information positions carry G0 unchanged.
    expect(rowBits(key, 0)).toBe('101');
    expect(rowBits(key, 1)).toBe('011');
    expect(rowBits(key, 2)).toBe('110');
    expect(rowBits(key, 3)).toBe('001');

    // The appended rows, in order, are the sums named above.
    expect(rowBits(key, 4)).toBe('011');
    expect(rowBits(key, 5)).toBe('010');
    expect(rowBits(key, 6)).toBe('110');
  });

  it('P is [s_i, 0.., 1, 0..] with the unit entry on the appended position', () => {
    const identity = Int32Array.from([0, 1, 2, 3, 4, 5, 6]);
    const key = buildKey(params, { g0Rows, sVectors, perm: identity, z });
    expect(Array.from(checkColumns(key.sk, 0))).toEqual([0, 2, 4]);
    expect(Array.from(checkColumns(key.sk, 1))).toEqual([1, 3, 5]);
    expect(Array.from(checkColumns(key.sk, 2))).toEqual([0, 1, 6]);
    expect(unitColumn(key.sk, 0)).toBe(4);
    expect(unitColumn(key.sk, 1)).toBe(5);
    expect(unitColumn(key.sk, 2)).toBe(6);
    expect(verifyParityCheck(key).ok).toBe(true);
  });

  it('P G = 0 survives the permutation, which moves G rows and P columns together', () => {
    // A deliberately scrambling permutation: newIndex = perm[oldIndex].
    const perm = Int32Array.from([3, 6, 0, 5, 1, 4, 2]);
    const key = buildKey(params, { g0Rows, sVectors, perm, z });

    // Row of G0 index 0 now lives at position 3, and so on.
    expect(rowBits(key, 3)).toBe('101');
    expect(rowBits(key, 6)).toBe('011');
    expect(rowBits(key, 0)).toBe('110');
    expect(rowBits(key, 5)).toBe('001');
    // Appended row i (construction position 4 + i) moved to perm[4 + i].
    expect(rowBits(key, 1)).toBe('011');
    expect(rowBits(key, 4)).toBe('010');
    expect(rowBits(key, 2)).toBe('110');

    // P's columns followed: check 0 referenced 0, 2, 4 and now references
    // perm[0] = 3, perm[2] = 0, perm[4] = 1.
    expect(Array.from(checkColumns(key.sk, 0)).sort((a, b) => a - b)).toEqual([0, 1, 3]);
    expect(verifyParityCheck(key).ok).toBe(true);
  });

  it('the pad z is carried identically by both halves of the key', () => {
    // sk and pk must hold the SAME pad: Decode computes wt(P(x + z)) with the
    // z that Encode added, and two pads that merely started equal would drift.
    const key = generateKey(makeParams({ n: 4096, t: 3, eta: 0.05 }));
    expect(key.pk.z).toBe(key.sk.z);
    expect(getBit(key.pk.z, 0)).toBe(getBit(key.sk.z, 0));
  });
});
