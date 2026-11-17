/**
 * ACCEPTANCE CHECK E — weak keys and the public-key distinguisher.
 *
 * Attack-II of IACR ePrint 2025/2283, section 4.2, measured. The bounds are
 * the brief's: every key weak at (4096, t = 3); between 0 and 3% of keys weak
 * at (8192, t = 8) against a formula value of 0.86%; and at
 * (4096, t = 3, eta = 0.05) at least 99% of codewords flagged against at most
 * 1% of random strings, over 300 of each, with measured pair agreement in
 * 0.88…0.93 and 0.47…0.53 respectively.
 *
 * This file also holds the invariant-2 test: the distinguisher is handed an
 * object with no P and no route to one.
 */

import { describe, expect, it } from 'vitest';
import { RandomStream, randomBits } from './bits.js';
import { CodeError, encode, randomString } from './code.js';
import { type PublicKey, generateKey } from './keygen.js';
import { makeParams } from './params.js';
import { meanAgreement, runTrialsSync } from './trials.js';
import {
  MIN_COMPARISONS,
  distinguish,
  expectedComparisons,
  findRepeatedRows,
  pairAgreementRate,
  sampleHasRepeatedSparseVector,
  weakKeyProbability,
} from './weak.js';

describe('check E — repeated rows are certain at (4096, t = 3) [slow]', () => {
  it('all ten generated keys have repeated rows, as pigeonhole requires [slow]', () => {
    const params = makeParams({ n: 4096, t: 3, eta: 0.05 });
    // 4055 appended rows drawn from C(41, 2) = 820 possible values: there is
    // no way for them to be distinct, so this is not a probabilistic claim.
    for (let i = 0; i < 10; i++) {
      const key = generateKey(params);
      const repeated = findRepeatedRows(key.pk);
      expect(repeated.comparisons, `key ${i} has no repeated rows`).toBeGreaterThan(0);
      expect(repeated.groups.length).toBeGreaterThan(0);
      // Each group's members really do carry the same row of G.
      for (const group of repeated.groups.slice(0, 5)) {
        const base = group[0] * key.pk.wordsPerRow;
        for (const row of group) {
          for (let w = 0; w < key.pk.wordsPerRow; w++) {
            expect(key.pk.G[row * key.pk.wordsPerRow + w]).toBe(key.pk.G[base + w]);
          }
        }
      }
    }
  });

  it('the comparison count lands near r - N(1 - (1 - 1/N)^r) [slow]', () => {
    const params = makeParams({ n: 4096, t: 3, eta: 0.05 });
    const key = generateKey(params);
    const repeated = findRepeatedRows(key.pk);
    const predicted = expectedComparisons(params.k, params.r, params.t);
    // The brief measured 3,241 and 3,244 on two keys; the formula gives 3,241.
    expect(predicted).toBeCloseTo(3241, 0);
    expect(Math.abs(repeated.comparisons - predicted)).toBeLessThan(60);
    // Comparisons = sum over groups of (size - 1), by construction.
    const fromGroups = repeated.groups.reduce((acc, g) => acc + g.length - 1, 0);
    expect(repeated.comparisons).toBe(fromGroups);
    expect(repeated.pairs.length).toBe(repeated.comparisons * 2);
  });

  it('t = 5 and t = 7 leave far fewer comparisons, as C(41, t-1) grows [slow]', () => {
    // The brief measured 82 at t = 5 and 0 then 2 at t = 7.
    const five = findRepeatedRows(generateKey(makeParams({ n: 4096, t: 5, eta: 0.05 })).pk).comparisons;
    expect(five).toBeGreaterThan(40);
    expect(five).toBeLessThan(140);
    // r - N(1 - (1 - 1/N)^r) with N = C(41, 4) = 101,270 is 80.1 exactly; the
    // familiar r^2/(2N) shorthand gives 81.2, and the brief's measurement on
    // one key was 82. The exact form is what this lab computes and shows.
    expect(expectedComparisons(41, 4055, 5)).toBeCloseTo(80.1, 1);
    expect(expectedComparisons(41, 4055, 7)).toBeLessThan(3);
  });
});

describe('check E — the weak-key rate at (8192, t = 8) [slow]', () => {
  it('between 0% and 3% of 300 keys carry a repeated row, formula 0.86% [slow]', () => {
    const params = makeParams({ n: 8192, t: 8, eta: 0.05 });
    // Sampling only the sparse vectors s_i, which the brief permits: two
    // appended rows of G coincide whenever their s_i do, so this measures the
    // same event without building 300 full keys around it.
    const stream = new RandomStream(1 << 16);
    const KEYS = 300;
    let weak = 0;
    for (let i = 0; i < KEYS; i++) if (sampleHasRepeatedSparseVector(params, stream)) weak++;
    const rate = weak / KEYS;
    expect(weakKeyProbability(params.k, params.r, params.t)).toBeCloseTo(0.0086, 4);
    expect(rate, `${weak}/${KEYS} keys weak`).toBeGreaterThanOrEqual(0);
    expect(rate, `${weak}/${KEYS} keys weak`).toBeLessThanOrEqual(0.03);
  });

  it('and essentially every key is weak at t = 3, where the formula says 1 [slow]', () => {
    // The same sampler on the other end of the table, so a sampler that
    // always answered "no" could not pass both halves of this suite.
    const params = makeParams({ n: 8192, t: 3, eta: 0.05 });
    const stream = new RandomStream(1 << 16);
    for (let i = 0; i < 5; i++) expect(sampleHasRepeatedSparseVector(params, stream)).toBe(true);
  });
});

describe('check E — the distinguisher at (4096, t = 3, eta = 0.05) [slow]', () => {
  const params = makeParams({ n: 4096, t: 3, eta: 0.05 });
  const TRIALS = 300;

  it(`flags at least 99% of ${TRIALS} codewords and at most 1% of ${TRIALS} random strings [slow]`, () => {
    const key = generateKey(params);
    const result = runTrialsSync(key, {
      trials: TRIALS,
      delta: 0,
      includeRandom: true,
      includeDistinguisher: true,
    });

    expect(result.comparisons).toBeGreaterThan(MIN_COMPARISONS);
    expect(
      result.codeword.flagged / TRIALS,
      `codewords flagged ${result.codeword.flagged}/${TRIALS}`,
    ).toBeGreaterThanOrEqual(0.99);
    expect(
      (result.random?.flagged ?? -1) / TRIALS,
      `random strings flagged ${result.random?.flagged}/${TRIALS}`,
    ).toBeLessThanOrEqual(0.01);
  });

  it('measured pair agreement is 0.88…0.93 for codewords and 0.47…0.53 for random strings [slow]', () => {
    const key = generateKey(params);
    const result = runTrialsSync(key, {
      trials: TRIALS,
      delta: 0,
      includeRandom: true,
      includeDistinguisher: true,
    });
    const code = meanAgreement(result.codeword);
    const ctrl = meanAgreement(result.random!);
    // The formula says 0.905 and 0.500.
    expect(pairAgreementRate(0.05)).toBeCloseTo(0.905, 4);
    expect(code, `codeword agreement ${code.toFixed(4)}`).toBeGreaterThan(0.88);
    expect(code, `codeword agreement ${code.toFixed(4)}`).toBeLessThan(0.93);
    expect(ctrl, `random agreement ${ctrl.toFixed(4)}`).toBeGreaterThan(0.47);
    expect(ctrl, `random agreement ${ctrl.toFixed(4)}`).toBeLessThan(0.53);
  });

  it('the distinguisher never consults the secret key — invariant 2, by signature [slow]', () => {
    const key = generateKey(params);
    // An object carrying ONLY the public key's fields. If `distinguish` ever
    // reached for P, z-from-sk, or anything else, this call would throw rather
    // than quietly succeed — and TypeScript would have refused it first.
    const publicOnly: PublicKey = {
      n: key.pk.n,
      g: key.pk.g,
      G: key.pk.G,
      wordsPerRow: key.pk.wordsPerRow,
      z: key.pk.z,
    };
    expect(Object.keys(publicOnly).sort()).toEqual(['G', 'g', 'n', 'wordsPerRow', 'z']);
    expect('P' in publicOnly).toBe(false);

    const { x } = encode(key.pk, params.eta);
    const result = distinguish(publicOnly, x, params.eta);
    expect(result.verdict).toBe('flagged');
    expect(result.agreement).toBeGreaterThan(0.8);

    // And the same object says "not distinguished" for noise, which is the
    // half that proves the verdict came from the measurement.
    const noise = distinguish(publicOnly, randomString(params.n), params.eta);
    expect(noise.verdict).toBe('not-distinguished');
    expect(noise.agreement).toBeGreaterThan(0.4);
    expect(noise.agreement).toBeLessThan(0.6);
  });
});

describe('check G — the distinguisher fails closed and says why', () => {
  it('a key with NO repeated rows yields the no-repeats verdict, not a result', () => {
    const params = makeParams({ n: 4096, t: 3, eta: 0.05 });
    const key = generateKey(params);
    // A key whose repeated rows have been removed from the comparison list is
    // the reachable form of "this key has none": at t = 3 pigeonhole forbids
    // generating one, and at t = 8 it is a 70% event that cannot be waited for
    // inside a test.
    const empty = { groups: [], pairs: new Int32Array(0), comparisons: 0, distinctRows: params.n };
    const result = distinguish(key.pk, randomString(params.n), params.eta, empty);
    expect(result.verdict).toBe('no-repeats');
    expect(result.flagged).toBe(false);
    expect(Number.isNaN(result.agreement)).toBe(true);
    expect(result.comparisons).toBe(0);
  });

  it('fewer than 30 comparisons refuses a verdict and reports the overlap instead', () => {
    const params = makeParams({ n: 4096, t: 3, eta: 0.05 });
    const key = generateKey(params);
    const full = findRepeatedRows(key.pk);
    // Keep 29 comparisons: one short of the line.
    const few = {
      groups: full.groups,
      pairs: full.pairs.slice(0, 58),
      comparisons: 29,
      distinctRows: full.distinctRows,
    };
    expect(few.comparisons).toBeLessThan(MIN_COMPARISONS);
    const { x } = encode(key.pk, params.eta);
    const result = distinguish(key.pk, x, params.eta, few);
    expect(result.verdict).toBe('too-few');
    expect(result.flagged, 'no verdict may be claimed below the comparison floor').toBe(false);
    expect(result.enough).toBe(false);
    // The measurement is still reported — that is what the page shows instead
    // of a verdict. It is asserted as a real fraction and NOT as "above one
    // half", because at 29 comparisons it is not reliably above one half: see
    // the correlation suite below. An earlier version of this test asserted
    // > 0.5 and went red on a run where two of the three anchors it happened
    // to span had their noise bit flipped.
    expect(result.agreement).toBeGreaterThanOrEqual(0);
    expect(result.agreement).toBeLessThanOrEqual(1);
    expect(Number.isNaN(result.agreement)).toBe(false);
    expect(result.comparisons).toBe(29);
  });

  it('exactly 30 comparisons is enough, so the floor is a floor and not an interval', () => {
    const params = makeParams({ n: 4096, t: 3, eta: 0.05 });
    const key = generateKey(params);
    const full = findRepeatedRows(key.pk);
    const thirty = { ...full, pairs: full.pairs.slice(0, 60), comparisons: 30 };
    const { x } = encode(key.pk, params.eta);
    expect(distinguish(key.pk, x, params.eta, thirty).enough).toBe(true);
  });

  it('refuses a string of the wrong length', () => {
    const key = generateKey(makeParams({ n: 4096, t: 3, eta: 0.05 }));
    expect(() => distinguish(key.pk, randomBits(1024), 0.05)).toThrow(CodeError);
  });
});

describe('the comparisons inside one group are NOT independent [slow]', () => {
  it('they are all conditioned on the anchor position’s own noise bit [slow]', () => {
    // Every member of a group is compared against the group's FIRST member, so
    // a group of m positions yields m - 1 comparisons that all share one
    // endpoint. Two positions carrying the same row of G agree exactly when
    // their noise bits agree — so if the ANCHOR's noise bit is flipped, which
    // happens with probability eta, that group's comparisons mostly DISAGREE,
    // all of them at once.
    //
    // The consequence is about effective sample size: the independent unit is
    // the GROUP, not the comparison. It does not weaken the full-key attack,
    // which has hundreds of groups — the measured agreement there is 0.905 on
    // the nose — but it is exactly why a handful of comparisons cannot carry a
    // verdict about one string, and why the page refuses one below the floor.
    const params = makeParams({ n: 4096, t: 3, eta: 0.05 });
    const key = generateKey(params);
    const full = findRepeatedRows(key.pk);
    const biggest = full.groups[0];
    expect(biggest.length, 'this measurement needs a group with several members').toBeGreaterThan(3);

    const anchor = biggest[0];
    const pairs = new Int32Array((biggest.length - 1) * 2);
    for (let i = 1; i < biggest.length; i++) {
      pairs[(i - 1) * 2] = anchor;
      pairs[(i - 1) * 2 + 1] = biggest[i];
    }
    const oneGroup = { groups: [biggest], pairs, comparisons: biggest.length - 1, distinctRows: params.n };

    const TRIALS = 400;
    let mostlyDisagreed = 0;
    for (let i = 0; i < TRIALS; i++) {
      const { x } = encode(key.pk, params.eta);
      if (distinguish(key.pk, x, params.eta, oneGroup).agreement < 0.5) mostlyDisagreed++;
    }
    const rate = mostlyDisagreed / TRIALS;

    // Independent comparisons at 0.905 each would put a majority on the wrong
    // side essentially never — for a group of 5, under 1 in 2,000. Through a
    // shared anchor it happens at about eta, which is 1 in 20.
    expect(rate, `${mostlyDisagreed}/${TRIALS} strings where the group mostly disagreed`).toBeGreaterThan(0.01);
    expect(rate).toBeLessThan(0.15);

    // And the full key, with hundreds of independent anchors, is unaffected:
    // that is why the attack works at all.
    const full400 = runTrialsSync(key, {
      trials: 100,
      delta: 0,
      includeRandom: false,
      includeDistinguisher: true,
    });
    expect(full400.codeword.flagged).toBe(100);
    expect(meanAgreement(full400.codeword)).toBeGreaterThan(0.88);
  });
});
