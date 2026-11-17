/**
 * ACCEPTANCE CHECK C — decoding, and the exact structure of the syndrome.
 *
 * The three claims come from the algebra of Construction 2 rather than from
 * this code: with no noise the syndrome is zero because P G = 0; flipping a
 * check's own unit position disturbs exactly that one check; flipping an
 * information position disturbs exactly the checks whose s_i names it.
 *
 * The third is the one worth having. It is asserted AGAINST THE KEY — the
 * expected set of disturbed checks is read out of `sVectors`, which is the
 * construction's own record of what it sampled, not out of the syndrome the
 * code just computed.
 */

import { describe, expect, it } from 'vitest';
import { getBit, randomBits, weight, zeroBits } from './bits.js';
import {
  CodeError,
  assertLength,
  decode,
  encode,
  encodeWith,
  multiplyGu,
  positionDegrees,
  randomString,
  substitute,
  syndrome,
  syndromeWeight,
} from './code.js';
import { generateKey, unitColumn } from './keygen.js';
import { makeParams, threshold } from './params.js';

const params = makeParams({ n: 4096, t: 3, eta: 0.05 });

/** Positions where two packed vectors differ. */
function differingPositions(a: Uint32Array, b: Uint32Array, bits: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < bits; i++) if (getBit(a, i) !== getBit(b, i)) out.push(i);
  return out;
}

describe('check C — a codeword with no noise has an all-zero syndrome', () => {
  it('P (G u + z + 0 + z) = P G u = 0', () => {
    const key = generateKey(params);
    const u = randomBits(key.pk.g);
    const x = encodeWith(key.pk, u, zeroBits(params.n));
    const s = syndrome(key.sk, x);
    expect(weight(s, params.r), 'not one of the 4055 checks may be unsatisfied').toBe(0);
    expect(syndromeWeight(key.sk, x)).toBe(0);
    expect(decode(key.sk, x).accepted).toBe(true);
  });

  it('and that holds for ten different seeds, including u = 0', () => {
    const key = generateKey(params);
    expect(syndromeWeight(key.sk, encodeWith(key.pk, zeroBits(key.pk.g), zeroBits(params.n)))).toBe(0);
    for (let i = 0; i < 9; i++) {
      const u = randomBits(key.pk.g);
      expect(syndromeWeight(key.sk, encodeWith(key.pk, u, zeroBits(params.n)))).toBe(0);
    }
  });

  it('the pad is what stops the all-zero STRING decoding as a codeword', () => {
    // Christ & Gunn add z precisely for this: without it wt(P 0) = 0 and the
    // zero string decodes for every key. Mutation (4) in the brief drops z
    // from decoding, which makes the zero string accept again.
    const key = generateKey(params);
    const zeros = zeroBits(params.n);
    const weightWithPad = syndromeWeight(key.sk, zeros);
    // wt(P z) for a uniform z is about r/2 — nowhere near the threshold.
    expect(weightWithPad).toBeGreaterThan(threshold(params.r));
    expect(decode(key.sk, zeros).accepted).toBe(false);
  });
});

describe('check C — one flipped bit disturbs exactly the checks that name it', () => {
  it('a flip at a check unit position flips exactly that one check', () => {
    const key = generateKey(params);
    const u = randomBits(key.pk.g);
    const clean = encodeWith(key.pk, u, zeroBits(params.n));
    const before = syndrome(key.sk, clean);

    for (const check of [0, 1, 17, 2000, params.r - 1]) {
      const unit = unitColumn(key.sk, check);
      const flipped = clean.slice();
      flipped[unit >>> 5] ^= 1 << (unit & 31);
      const after = syndrome(key.sk, flipped);
      expect(
        differingPositions(before, after, params.r),
        `a flip at position ${unit} must disturb check ${check} and nothing else`,
      ).toEqual([check]);
      expect(syndromeWeight(key.sk, flipped)).toBe(1);
    }
  });

  it('a flip at an information position flips exactly the checks whose s_i contains it', () => {
    const key = generateKey(params);
    const { k, t, r } = params;
    const u = randomBits(params.g);
    const clean = encodeWith(key.pk, u, zeroBits(params.n));
    const before = syndrome(key.sk, clean);

    for (const info of [0, 1, 7, k - 1]) {
      // The expected set, read out of the construction's own record of what it
      // sampled rather than out of the syndrome.
      const expected: number[] = [];
      for (let i = 0; i < r; i++) {
        for (let a = 0; a < t - 1; a++) {
          if (key.sVectors[i * (t - 1) + a] === info) {
            expected.push(i);
            break;
          }
        }
      }

      const position = key.perm[info];
      const flipped = clean.slice();
      flipped[position >>> 5] ^= 1 << (position & 31);
      const after = syndrome(key.sk, flipped);
      expect(differingPositions(before, after, r)).toEqual(expected);

      // And this is the heavy tail in one line: one bit, about 198 checks.
      expect(expected.length).toBeGreaterThan(120);
      expect(expected.length).toBeLessThan(290);
    }
  });

  it('position degrees are 1 for every check position and large for every information position', () => {
    const key = generateKey(params);
    const degrees = positionDegrees(key.sk);
    let ones = 0;
    let heavy = 0;
    for (let i = 0; i < params.n; i++) {
      if (degrees[i] === 1) ones++;
      else if (degrees[i] > 100) heavy++;
    }
    expect(ones, 'each of the r checks owns one degree-1 position').toBe(params.r);
    expect(heavy, 'each of the k information positions is in many checks').toBe(params.k);
    // Every incidence is accounted for: r rows of weight t.
    let total = 0;
    for (let i = 0; i < params.n; i++) total += degrees[i];
    expect(total).toBe(params.r * params.t);
  });
});

describe('check C — encode and the channel', () => {
  it('G u is linear: G(u1 + u2) = G u1 + G u2', () => {
    const key = generateKey(params);
    const u1 = randomBits(params.g);
    const u2 = randomBits(params.g);
    const sum = u1.map((w, i) => w ^ u2[i]);
    const a = multiplyGu(key.pk, u1);
    const b = multiplyGu(key.pk, u2);
    const both = multiplyGu(key.pk, sum);
    // `>>> 0` because `a[w] ^ b[w]` is a SIGNED 32-bit JS number while a
    // Uint32Array element is unsigned: without it, every word with the high
    // bit set compares unequal to itself.
    for (let w = 0; w < both.length; w++) expect(both[w]).toBe((a[w] ^ b[w]) >>> 0);
  });

  it('the encoder flips about eta n bits', () => {
    const key = generateKey(params);
    let total = 0;
    for (let i = 0; i < 20; i++) total += encode(key.pk, 0.05).noiseWeight;
    const mean = total / 20;
    // 0.05 * 4096 = 204.8, with a standard deviation of about 14 per trial.
    expect(mean).toBeGreaterThan(185);
    expect(mean).toBeLessThan(225);
  });

  it('eta = 0 encodes with no noise at all', () => {
    const key = generateKey(makeParams({ n: 4096, t: 3, eta: 0 }));
    const word = encode(key.pk, 0);
    expect(word.noiseWeight).toBe(0);
    expect(syndromeWeight(key.sk, word.x)).toBe(0);
  });

  it('substitution at delta flips about delta n bits and leaves the length alone', () => {
    const x = randomString(4096);
    const y = substitute(x, 4096, 0.1);
    expect(y.length).toBe(x.length);
    const flips = differingPositions(x, y, 4096).length;
    expect(flips).toBeGreaterThan(330);
    expect(flips).toBeLessThan(490);
  });
});

describe('check G — a string of the wrong length is refused', () => {
  it('decode refuses a shorter string, naming both widths', () => {
    const key = generateKey(params);
    const short = randomBits(2048);
    expect(() => decode(key.sk, short)).toThrow(CodeError);
    expect(() => decode(key.sk, short)).toThrow(/2048 bits wide; this key decodes 4096-bit strings/);
  });

  it('decode refuses a longer string', () => {
    const key = generateKey(params);
    expect(() => decode(key.sk, randomBits(8192))).toThrow(CodeError);
  });

  it('syndromeWeight and syndrome refuse it too, not just decode', () => {
    const key = generateKey(params);
    const wrong = randomBits(8192);
    expect(() => syndromeWeight(key.sk, wrong)).toThrow(CodeError);
    expect(() => syndrome(key.sk, wrong)).toThrow(CodeError);
  });

  it('assertLength names what it was given', () => {
    expect(() => assertLength(randomBits(64), 4096, 'candidate')).toThrow(/This candidate is 64 bits wide/);
    expect(() => assertLength(randomBits(4096), 4096)).not.toThrow();
  });
});
