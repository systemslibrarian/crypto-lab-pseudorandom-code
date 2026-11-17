/**
 * The two statistical tests of the "does it look random?" exhibit, and the
 * erfc they both rest on.
 *
 * The erfc values are known answers from an independent implementation
 * (CPython's `math.erfc`, which is the platform libm), because an
 * approximation nobody checked is how a p-value of 1e-40 gets printed as 0.4.
 *
 * NIST SP 800-22 Rev 1a sections 2.1 (frequency) and 2.3 (runs).
 */

import { describe, expect, it } from 'vitest';
import { randomBits } from './bits.js';
import { encode } from './code.js';
import { generateKey } from './keygen.js';
import { makeParams } from './params.js';
import { erfc, frequencyTest, runsTest, unpack } from './randomness.js';

describe('erfc, against known values', () => {
  const KNOWN: [number, number][] = [
    [0, 1.0],
    [0.5, 4.795001221869535e-1],
    [1, 1.572992070502852e-1],
    [1.5, 3.389485352468927e-2],
    [2, 4.677734981047264e-3],
    [3, 2.209049699858544e-5],
    [4, 1.541725790028002e-8],
    [5, 1.537459794428035e-12],
    [-1, 1.842700792949715],
    [-2, 1.995322265018953],
  ];
  for (const [x, expected] of KNOWN) {
    it(`erfc(${x}) = ${expected.toExponential(6)}`, () => {
      const got = erfc(x);
      expect(Math.abs(got - expected) / Math.max(expected, 1e-300)).toBeLessThan(1e-9);
    });
  }

  it('is monotone decreasing and brackets [0, 2]', () => {
    let previous = 2;
    for (let x = -4; x <= 6; x += 0.25) {
      const value = erfc(x);
      expect(value).toBeLessThanOrEqual(previous + 1e-15);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(2);
      previous = value;
    }
  });
});

describe('frequency (monobit) test', () => {
  it('passes a uniform string', () => {
    const result = frequencyTest(unpack(randomBits(4096), 4096));
    expect(result.n).toBe(4096);
    expect(result.ones + result.zeros).toBe(4096);
    expect(result.pValue).toBeGreaterThan(0.001);
  });

  it('rejects an all-ones string outright', () => {
    const result = frequencyTest(new Uint8Array(1024).fill(1));
    expect(result.ones).toBe(1024);
    expect(result.statistic).toBeCloseTo(32, 6);
    expect(result.pValue).toBeLessThan(1e-200);
    expect(result.unremarkable).toBe(false);
  });

  it('a perfectly balanced string gives p = 1', () => {
    const bits = new Uint8Array(1000);
    for (let i = 0; i < 500; i++) bits[i] = 1;
    const result = frequencyTest(bits);
    expect(result.statistic).toBe(0);
    expect(result.pValue).toBeCloseTo(1, 9);
  });
});

describe('runs test', () => {
  it('passes a uniform string', () => {
    const result = runsTest(unpack(randomBits(4096), 4096));
    expect(result.applicable).toBe(true);
    expect(result.pValue).toBeGreaterThan(0.001);
    // About n/2 runs in a uniform string.
    expect(result.runs).toBeGreaterThan(1900);
    expect(result.runs).toBeLessThan(2200);
  });

  it('rejects a balanced string that never switches', () => {
    // 500 zeros then 500 ones: the monobit test cannot see this at all, which
    // is the whole reason the runs test is the second one here.
    const bits = new Uint8Array(1000);
    for (let i = 500; i < 1000; i++) bits[i] = 1;
    expect(frequencyTest(bits).pValue).toBeCloseTo(1, 9);
    const result = runsTest(bits);
    expect(result.runs).toBe(2);
    expect(result.applicable).toBe(true);
    expect(result.pValue).toBeLessThan(1e-200);
    expect(result.unremarkable).toBe(false);
  });

  it('rejects a string that alternates every bit', () => {
    const bits = new Uint8Array(1000);
    for (let i = 0; i < 1000; i += 2) bits[i] = 1;
    const result = runsTest(bits);
    expect(result.runs).toBe(1000);
    expect(result.pValue).toBeLessThan(1e-200);
  });

  it('declines to run when the proportion is already far from one half', () => {
    // SP 800-22 gates the runs test on |pi - 1/2| < 2/sqrt(n); the frequency
    // test has already decided such a string.
    const bits = new Uint8Array(1024);
    for (let i = 0; i < 700; i++) bits[i] = 1;
    const result = runsTest(bits);
    expect(result.applicable).toBe(false);
    expect(result.unremarkable).toBe(false);
  });
});

describe('a codeword passes both tests — which proves nothing [slow]', () => {
  it('ten codewords at (4096, t = 3, eta = 0.05) are unremarkable to both [slow]', () => {
    // This is the exhibit's point stated as a test: the construction's output
    // is statistically unremarkable to these two particular adversaries, and
    // the weak-key distinguisher in weak.test.ts flags the very same strings.
    const params = makeParams({ n: 4096, t: 3, eta: 0.05 });
    const key = generateKey(params);
    let frequencyPassed = 0;
    let runsPassed = 0;
    for (let i = 0; i < 10; i++) {
      const bits = unpack(encode(key.pk, params.eta).x, params.n);
      if (frequencyTest(bits).unremarkable) frequencyPassed++;
      if (runsTest(bits).unremarkable) runsPassed++;
    }
    // At the 0.01 line, ten independent uniform strings pass both about 90% of
    // the time; 8 of 10 is the honest floor for a test that must not flake.
    expect(frequencyPassed).toBeGreaterThanOrEqual(8);
    expect(runsPassed).toBeGreaterThanOrEqual(8);
  });
});
