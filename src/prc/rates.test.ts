/**
 * ACCEPTANCE CHECK D — the rates, measured over real runs.
 *
 * Slow by construction: every number here is counted from at least 300
 * encode-and-decode cycles on a freshly generated key, because invariant 4
 * says rates are counted from runs and not read off a formula. The bounds are
 * the brief's, set from an independent measurement before this lab existed —
 * they are deliberately loose enough to survive sampling noise and tight
 * enough that a broken detector cannot pass.
 *
 * Tagged `slow` so `vitest run -t slow` and `--exclude` can address them.
 */

import { describe, expect, it } from 'vitest';
import { decode, encode, randomString, substitute, syndromeWeight } from './code.js';
import { generateKey } from './keygen.js';
import { expectedSyndromeWeight, makeParams, threshold } from './params.js';
import { runTrialsSync } from './trials.js';

const TRIALS = 300;

describe('check D — detection rates at n = 4096, t = 3, eta = 0.05 [slow]', () => {
  const params = makeParams({ n: 4096, t: 3, eta: 0.05 });

  it(`accepts at least 97% of ${TRIALS} codewords and 0 of ${TRIALS} random strings [slow]`, () => {
    const key = generateKey(params);
    let accepted = 0;
    let randomAccepted = 0;
    let weightSum = 0;
    let maxWeight = 0;

    for (let i = 0; i < TRIALS; i++) {
      const { x } = encode(key.pk, params.eta);
      const decision = decode(key.sk, x);
      if (decision.accepted) accepted++;
      weightSum += decision.weight;
      if (decision.weight > maxWeight) maxWeight = decision.weight;

      if (decode(key.sk, randomString(params.n)).accepted) randomAccepted++;
    }

    expect(accepted / TRIALS, `codewords accepted (${accepted}/${TRIALS})`).toBeGreaterThanOrEqual(0.97);
    expect(randomAccepted, `random strings accepted (${randomAccepted}/${TRIALS})`).toBe(0);

    // Mean syndrome weight between 480 and 640; the formula says 549.
    const mean = weightSum / TRIALS;
    expect(mean, `mean syndrome weight ${mean.toFixed(1)}`).toBeGreaterThan(480);
    expect(mean, `mean syndrome weight ${mean.toFixed(1)}`).toBeLessThan(640);
    expect(mean).toBeGreaterThan(expectedSyndromeWeight(params.r, params.t, params.eta) - 80);
    expect(mean).toBeLessThan(expectedSyndromeWeight(params.r, params.t, params.eta) + 80);
  });

  it('a random string fails about half its checks, far above the threshold [slow]', () => {
    const key = generateKey(params);
    let sum = 0;
    for (let i = 0; i < 50; i++) sum += syndromeWeight(key.sk, randomString(params.n));
    const mean = sum / 50;
    // r/2 = 2027.5, against a threshold of 1519.3.
    expect(mean).toBeGreaterThan(1960);
    expect(mean).toBeLessThan(2095);
    expect(mean).toBeGreaterThan(threshold(params.r));
  });

  it('extra substitutions at delta = 0.20 drop acceptance to at most 25% [slow]', () => {
    const key = generateKey(params);
    let accepted = 0;
    for (let i = 0; i < TRIALS; i++) {
      const { x } = encode(key.pk, params.eta);
      if (decode(key.sk, substitute(x, params.n, 0.2)).accepted) accepted++;
    }
    expect(accepted / TRIALS, `accepted under delta = 0.20 (${accepted}/${TRIALS})`).toBeLessThanOrEqual(0.25);
  });

  it('acceptance falls monotonically as delta rises [slow]', () => {
    // The brief measured 199, 172, 106, 19 of 200 at delta = 0.05 … 0.20.
    const key = generateKey(params);
    const rates = [0.05, 0.1, 0.15, 0.2].map((delta) => {
      const result = runTrialsSync(key, { trials: 200, delta, includeRandom: false, includeDistinguisher: false });
      return result.codeword.accepted / 200;
    });
    for (let i = 1; i < rates.length; i++) {
      expect(rates[i], `delta step ${i}: ${rates.map((r) => r.toFixed(2)).join(' ')}`).toBeLessThanOrEqual(rates[i - 1]);
    }
    expect(rates[0]).toBeGreaterThan(0.9);
    expect(rates[3]).toBeLessThan(0.3);
  });

  it('the syndrome weight has the heavy tail the page describes [slow]', () => {
    // FACTS 9 of the brief, and an observation about this key distribution at
    // small n rather than a statement from either paper: one noise bit on an
    // information position flips about 198 checks at once, so the maximum over
    // a few hundred trials sits far above the mean rather than a few standard
    // deviations above it. The brief measured a maximum of 1,491 against a
    // mean of 559.
    const key = generateKey(params);
    const result = runTrialsSync(key, { trials: TRIALS, delta: 0, includeRandom: false, includeDistinguisher: false });
    const mean = result.codeword.meanWeight;
    const max = result.codeword.maxWeight;
    // A binomial(4055, 0.1355) would have sd 21.8, so a Gaussian tail would
    // put the maximum of 300 draws near mean + 65. The real tail is far wider.
    expect(max - mean, `max ${max} against mean ${mean.toFixed(0)}`).toBeGreaterThan(150);
    // The gap is a multiple of ~198, the information-position degree.
    expect(max).toBeGreaterThan(mean + 150);
  });
});

describe('check D — the rates the brief measured at other settings [slow]', () => {
  const cases: { t: number; eta: number; minAccept: number }[] = [
    { t: 3, eta: 0.1, minAccept: 0.9 },
    { t: 5, eta: 0.05, minAccept: 0.88 },
    { t: 7, eta: 0.03, minAccept: 0.88 },
  ];
  for (const { t, eta, minAccept } of cases) {
    it(`t = ${t}, eta = ${eta}: codewords accepted, random strings never [slow]`, () => {
      const params = makeParams({ n: 4096, t, eta });
      const key = generateKey(params);
      const result = runTrialsSync(key, {
        trials: TRIALS,
        delta: 0,
        includeRandom: true,
        includeDistinguisher: false,
      });
      expect(result.codeword.accepted / TRIALS).toBeGreaterThanOrEqual(minAccept);
      expect(result.random?.accepted).toBe(0);
      // The measured mean tracks r * (1/2 - (1-2eta)^t/2) within sampling noise.
      const predicted = expectedSyndromeWeight(params.r, t, eta);
      expect(Math.abs(result.codeword.meanWeight - predicted)).toBeLessThan(120);
    });
  }

  it('n = 8192 behaves the same way, with its own threshold [slow]', () => {
    const params = makeParams({ n: 8192, t: 3, eta: 0.05 });
    const key = generateKey(params);
    const result = runTrialsSync(key, {
      trials: 100,
      delta: 0,
      includeRandom: true,
      includeDistinguisher: false,
    });
    expect(result.codeword.accepted / 100).toBeGreaterThanOrEqual(0.95);
    expect(result.random?.accepted).toBe(0);
    expect(result.threshold).toBeCloseTo(3200.4, 1);
    expect(Math.abs(result.codeword.meanWeight - expectedSyndromeWeight(params.r, 3, 0.05))).toBeLessThan(160);
  });
});
