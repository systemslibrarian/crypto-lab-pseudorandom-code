/**
 * Invariant 3 — all randomness comes from `crypto.getRandomValues`, and the
 * weight-(t-1) vectors and the permutation are sampled without bias.
 *
 * "Without bias" is the part worth testing rather than asserting. A chi-square
 * over enough draws will not prove uniformity, but it does catch the two
 * mistakes that actually happen: a modulo that favours the low end of the
 * range, and a Fisher-Yates whose inner index is drawn from the wrong bound
 * (`randomBelow(n)` instead of `randomBelow(i + 1)`), which cannot produce
 * some permutations at all.
 */

import { describe, expect, it } from 'vitest';
import {
  RandomStream,
  bernoulliBits,
  bitString,
  flipBit,
  getBit,
  hexPreview,
  makePool,
  parity32,
  popcount32,
  randomBelow,
  randomBits,
  randomPermutation,
  sampleDistinct,
  setBit,
  weight,
  wordsFor,
  xorInto,
  zeroBits,
} from './bits.js';

describe('packed bit vectors', () => {
  it('wordsFor rounds up, and the tail of the last word is masked', () => {
    expect(wordsFor(0)).toBe(0);
    expect(wordsFor(1)).toBe(1);
    expect(wordsFor(32)).toBe(1);
    expect(wordsFor(33)).toBe(2);
    expect(wordsFor(4096)).toBe(128);
    // A stray high bit in the pad would survive xorInto and make two vectors
    // that should be equal compare unequal word-wise.
    for (let i = 0; i < 20; i++) {
      const v = randomBits(100);
      expect(weight(v, 100)).toBe(weight(v, 128));
    }
  });

  it('get, set and flip address the bit the index names', () => {
    const v = zeroBits(70);
    setBit(v, 0);
    setBit(v, 31);
    setBit(v, 32);
    setBit(v, 69);
    expect(bitString(v, 33)).toBe('1'.padEnd(31, '0') + '11');
    expect(getBit(v, 69)).toBe(1);
    expect(getBit(v, 68)).toBe(0);
    expect(weight(v, 70)).toBe(4);
    flipBit(v, 69);
    expect(getBit(v, 69)).toBe(0);
    expect(weight(v, 70)).toBe(3);
  });

  it('popcount and parity agree with a naive count on every byte value', () => {
    for (let x = 0; x < 256; x++) {
      let ones = 0;
      for (let b = 0; b < 8; b++) ones += (x >>> b) & 1;
      expect(popcount32(x)).toBe(ones);
      expect(parity32(x)).toBe(ones & 1);
    }
    // And on the words where a signed shift would go wrong.
    expect(popcount32(0xffffffff)).toBe(32);
    expect(popcount32(0x80000000)).toBe(1);
    expect(parity32(0xffffffff)).toBe(0);
    expect(parity32(0x80000000)).toBe(1);
  });

  it('xorInto is XOR, word for word', () => {
    const a = Uint32Array.from([0xffffffff, 0]);
    xorInto(a, Uint32Array.from([0x0f0f0f0f, 0xdeadbeef]));
    expect(a[0]).toBe(0xf0f0f0f0);
    expect(a[1]).toBe(0xdeadbeef);
  });

  it('hexPreview reads bytes little-endian within each word', () => {
    expect(hexPreview(Uint32Array.from([0x04030201]), 4)).toBe('01020304');
  });
});

describe('invariant 3 — unbiased sampling', () => {
  it('randomBelow refuses a non-positive or non-integer bound', () => {
    expect(() => randomBelow(0)).toThrow(RangeError);
    expect(() => randomBelow(-5)).toThrow(RangeError);
    expect(() => randomBelow(2.5)).toThrow(RangeError);
  });

  it('randomBelow stays in range and spreads across it', () => {
    const counts = new Int32Array(41);
    const draws = 41 * 400;
    for (let i = 0; i < draws; i++) {
      const x = randomBelow(41);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(41);
      counts[x]++;
    }
    // Chi-square with 40 degrees of freedom: the 0.9999 critical value is
    // about 96. A modulo bias over a range this small would not show here, but
    // a sampler stuck on a subrange would.
    const expected = draws / 41;
    let chi = 0;
    for (const c of counts) chi += ((c - expected) * (c - expected)) / expected;
    expect(chi, `chi-square ${chi.toFixed(1)} over 40 d.f.`).toBeLessThan(96);
    for (const c of counts) expect(c).toBeGreaterThan(0);
  });

  it('randomPermutation is a bijection, and reaches every permutation of three', () => {
    for (const n of [1, 2, 41, 4096]) {
      const perm = randomPermutation(n);
      const seen = new Set<number>();
      for (const p of perm) {
        expect(p).toBeGreaterThanOrEqual(0);
        expect(p).toBeLessThan(n);
        seen.add(p);
      }
      expect(seen.size).toBe(n);
    }
    // All six orderings of three elements must be reachable. A Fisher-Yates
    // drawing from the full range instead of [0, i] produces some orderings
    // more often than others and misses none, so this is a liveness check
    // rather than a uniformity one — the chi-square below is the other half.
    const seen = new Map<string, number>();
    for (let i = 0; i < 6000; i++) {
      const key = Array.from(randomPermutation(3)).join('');
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    expect(seen.size).toBe(6);
    let chi = 0;
    for (const count of seen.values()) chi += ((count - 1000) * (count - 1000)) / 1000;
    // 5 d.f., 0.9999 critical value about 25.7.
    expect(chi, `permutation chi-square ${chi.toFixed(1)} over 5 d.f.`).toBeLessThan(25.7);
  });

  it('sampleDistinct returns m distinct sorted indices, uniformly over subsets', () => {
    expect(() => sampleDistinct(4, 5)).toThrow(RangeError);
    const pool = makePool(6);
    const counts = new Map<string, number>();
    const draws = 15 * 800; // C(6, 2) = 15 subsets
    for (let i = 0; i < draws; i++) {
      const s = sampleDistinct(6, 2, pool);
      expect(s.length).toBe(2);
      expect(s[0]).toBeLessThan(s[1]);
      counts.set(Array.from(s).join(','), (counts.get(Array.from(s).join(',')) ?? 0) + 1);
    }
    expect(counts.size, 'every 2-subset of 6 must be reachable').toBe(15);
    const expected = draws / 15;
    let chi = 0;
    for (const c of counts.values()) chi += ((c - expected) * (c - expected)) / expected;
    // 14 d.f., 0.9999 critical value about 42.9. This is the assertion that a
    // reused shuffled pool does not cost uniformity.
    expect(chi, `subset chi-square ${chi.toFixed(1)} over 14 d.f.`).toBeLessThan(42.9);
  });

  it('bernoulliBits hits its rate, and is exactly empty at eta = 0', () => {
    expect(weight(bernoulliBits(4096, 0), 4096)).toBe(0);
    let total = 0;
    for (let i = 0; i < 40; i++) total += weight(bernoulliBits(4096, 0.05), 4096);
    const mean = total / 40;
    // 204.8 expected, sd 13.9 per trial so sd 2.2 on the mean of 40.
    expect(mean).toBeGreaterThan(196);
    expect(mean).toBeLessThan(214);
    // eta = 1 sets every bit, which is the other end of the comparison.
    expect(weight(bernoulliBits(256, 1), 256)).toBe(256);
  });
});

describe('RandomStream', () => {
  it('refuses a nonsense block size and caps at the Web Crypto ceiling', () => {
    expect(() => new RandomStream(0)).toThrow(RangeError);
    expect(() => new RandomStream(-1)).toThrow(RangeError);
    // 65,536 BYTES is the spec limit, so a request for more words must not
    // throw QuotaExceededError on first use — it must be clamped here.
    const big = new RandomStream(1 << 20);
    expect(() => big.next()).not.toThrow();
    expect(RandomStream.MAX_BLOCK_WORDS).toBe(16384);
  });

  it('refills across block boundaries without repeating the block', () => {
    const stream = new RandomStream(4);
    const drawn = Array.from({ length: 12 }, () => stream.next());
    // Three blocks of four. If the stream failed to refill, the second block
    // would be identical to the first.
    expect(drawn.slice(0, 4)).not.toEqual(drawn.slice(4, 8));
  });
});
