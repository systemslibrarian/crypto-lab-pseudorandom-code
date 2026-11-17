/**
 * The trial runner: that it is resumable, that the arms are independent, and
 * that the histogram bins what it is given.
 *
 * Resumability is not a nicety. The runner is a generator precisely so the
 * worker can return to its event loop between chunks and notice a cancel
 * message — a `for` loop inside one message handler cannot be interrupted,
 * however many flags it checks. If the generator stopped yielding, the lab
 * would still produce correct numbers and the cancel button would quietly
 * stop working.
 */

import { describe, expect, it } from 'vitest';
import { generateKey } from './keygen.js';
import { makeParams, threshold } from './params.js';
import { histogram, meanAgreement, runTrials, runTrialsSync } from './trials.js';

const params = makeParams({ n: 4096, t: 3, eta: 0.05 });

describe('the runner yields, so a run can be cancelled', () => {
  it('yields once per chunk and returns the result at the end', () => {
    const key = generateKey(params);
    const iterator = runTrials(key, { trials: 20, delta: 0, includeRandom: false, includeDistinguisher: false }, 5);
    const progress: number[] = [];
    let step = iterator.next();
    while (!step.done) {
      progress.push(step.value.done);
      expect(step.value.total).toBe(20);
      step = iterator.next();
    }
    expect(progress).toEqual([5, 10, 15, 20]);
    expect(step.value.codeword.trials).toBe(20);
  });

  it('abandoning the generator early leaves no half-counted result behind', () => {
    const key = generateKey(params);
    const iterator = runTrials(key, { trials: 100, delta: 0, includeRandom: false, includeDistinguisher: false }, 10);
    expect(iterator.next().value).toEqual({ done: 10, total: 100 });
    // What a cancel does: stop pulling. The caller gets no TrialResult at all,
    // which is the point — a partial count rendered as a rate would be a lie
    // about how many runs it came from.
    const ended = iterator.return(undefined as never);
    expect(ended.done).toBe(true);
  });

  it('the control arm is only run when it is asked for', () => {
    const key = generateKey(params);
    const without = runTrialsSync(key, { trials: 5, delta: 0, includeRandom: false, includeDistinguisher: false });
    expect(without.random).toBeNull();
    const withControl = runTrialsSync(key, { trials: 5, delta: 0, includeRandom: true, includeDistinguisher: false });
    expect(withControl.random?.trials).toBe(5);
  });

  it('every reported rate carries the run count it came from', () => {
    const key = generateKey(params);
    const result = runTrialsSync(key, { trials: 37, delta: 0, includeRandom: true, includeDistinguisher: true });
    expect(result.codeword.trials).toBe(37);
    expect(result.codeword.weights.length).toBe(37);
    expect(result.random?.trials).toBe(37);
    expect(result.codeword.accepted).toBeLessThanOrEqual(37);
    expect(result.threshold).toBeCloseTo(threshold(params.r), 6);
  });

  it('meanAgreement is NaN rather than 0 when no trial had comparisons', () => {
    // 0 would read as "they agreed never", which is the opposite of "we did
    // not measure".
    const key = generateKey(params);
    const result = runTrialsSync(key, { trials: 3, delta: 0, includeRandom: false, includeDistinguisher: false });
    expect(result.codeword.agreementTrials).toBe(0);
    expect(Number.isNaN(meanAgreement(result.codeword))).toBe(true);
  });
});

describe('histogram', () => {
  it('bins the observed range and reports the tallest bin', () => {
    const h = histogram(Int32Array.from([10, 10, 11, 20, 100]), 10);
    expect(h.first).toBe(10);
    expect(h.counts.reduce((a, b) => a + b, 0)).toBe(5);
    expect(h.max).toBe(3);
    expect(h.binWidth).toBeGreaterThanOrEqual(1);
  });

  it('spans the whole range, so a tail cannot be clipped off the picture', () => {
    // The heavy tail IS the exhibit: a histogram scaled to the mean would
    // simply drop the thing worth seeing.
    const weights = Int32Array.from([...Array(99).fill(550), 1491]);
    const h = histogram(weights, 24);
    expect(h.first).toBe(550);
    const span = h.first + h.counts.length * h.binWidth;
    expect(span).toBeGreaterThan(1491);
    expect(h.counts[h.counts.length - 1]).toBe(1);
  });

  it('survives an empty input', () => {
    const h = histogram(new Int32Array(0));
    expect(h.counts.length).toBe(0);
    expect(h.max).toBe(0);
  });

  it('puts every weight in exactly one bin', () => {
    const key = generateKey(params);
    const result = runTrialsSync(key, { trials: 50, delta: 0.1, includeRandom: false, includeDistinguisher: false });
    const h = histogram(result.codeword.weights);
    expect(h.counts.reduce((a, b) => a + b, 0)).toBe(50);
  });
});
