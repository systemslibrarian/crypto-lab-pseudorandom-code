/**
 * The trial loops, as a resumable generator.
 *
 * Every rate this lab prints is counted from runs, never read off a formula
 * (invariant 4), and the number of runs is printed beside it. The loops are
 * written as a generator yielding after each chunk so that the worker driving
 * them can return to its event loop between chunks and notice a cancel
 * message — a `for` loop over 2,000 trials inside one message handler cannot
 * be interrupted, however many flags it checks.
 *
 * One pass feeds three exhibits: the detector's accept counts, the syndrome
 * weight distribution behind the heavy-tail histogram, and the public-key
 * distinguisher's flag counts and measured agreement. They share the same
 * runs on purpose — three exhibits quoting three different samples of the same
 * key invites the reader to compare numbers that were never comparable.
 */

import { decode, encode, randomString, substitute, syndromeWeight } from './code.js';
import type { KeyPair } from './keygen.js';
import { type RepeatedRows, distinguish, findRepeatedRows } from './weak.js';

export interface TrialSpec {
  readonly trials: number;
  /** Extra substitutions applied after encoding, on top of the encoder's eta. */
  readonly delta: number;
  /** Also run the same count of uniformly random strings as a control. */
  readonly includeRandom: boolean;
  /** Also run the public-key distinguisher on every string. */
  readonly includeDistinguisher: boolean;
}

export interface ArmResult {
  readonly trials: number;
  /** How many the secret-key detector accepted. */
  readonly accepted: number;
  /** Syndrome weight of every trial, in order. */
  readonly weights: Int32Array;
  readonly meanWeight: number;
  readonly minWeight: number;
  readonly maxWeight: number;
  /** How many the public-key distinguisher flagged. */
  readonly flagged: number;
  /** Sum of measured agreement fractions, over trials that had enough comparisons. */
  readonly agreementSum: number;
  readonly agreementTrials: number;
}

export interface TrialResult {
  readonly spec: TrialSpec;
  readonly codeword: ArmResult;
  /** Null when the control arm was not requested. */
  readonly random: ArmResult | null;
  /** Comparisons available from this key's repeated rows. */
  readonly comparisons: number;
  readonly threshold: number;
}

export interface TrialProgress {
  readonly done: number;
  readonly total: number;
}

interface Accumulator {
  accepted: number;
  weights: number[];
  flagged: number;
  agreementSum: number;
  agreementTrials: number;
}

function emptyAccumulator(): Accumulator {
  return { accepted: 0, weights: [], flagged: 0, agreementSum: 0, agreementTrials: 0 };
}

function finish(acc: Accumulator): ArmResult {
  const weights = Int32Array.from(acc.weights);
  let sum = 0;
  let min = weights.length === 0 ? 0 : weights[0];
  let max = weights.length === 0 ? 0 : weights[0];
  for (const w of weights) {
    sum += w;
    if (w < min) min = w;
    if (w > max) max = w;
  }
  return {
    trials: weights.length,
    accepted: acc.accepted,
    weights,
    meanWeight: weights.length === 0 ? 0 : sum / weights.length,
    minWeight: min,
    maxWeight: max,
    flagged: acc.flagged,
    agreementSum: acc.agreementSum,
    agreementTrials: acc.agreementTrials,
  };
}

/** Mean measured agreement, or NaN when no trial had enough comparisons. */
export function meanAgreement(arm: ArmResult): number {
  return arm.agreementTrials === 0 ? Number.NaN : arm.agreementSum / arm.agreementTrials;
}

/**
 * Run `spec.trials` codewords and (optionally) the same number of uniformly
 * random strings, yielding progress every `chunk` trials.
 *
 * The encoder's noise is Bernoulli(eta) and `spec.delta` adds independent
 * substitutions on top, so the channel the detector faces is Bernoulli at
 * eta + delta - 2 eta delta. The random arm gets NO substitutions: flipping
 * bits of a uniform string leaves a uniform string, and pretending otherwise
 * would suggest the control was handicapped.
 */
export function* runTrials(key: KeyPair, spec: TrialSpec, chunk = 25): Generator<TrialProgress, TrialResult> {
  const { pk, sk, params } = key;
  const repeated: RepeatedRows = spec.includeDistinguisher
    ? findRepeatedRows(pk)
    : { groups: [], pairs: new Int32Array(0), comparisons: 0, distinctRows: 0 };

  const code = emptyAccumulator();
  const ctrl = emptyAccumulator();
  let threshold = 0;

  for (let i = 0; i < spec.trials; i++) {
    const { x } = encode(pk, params.eta);
    const received = spec.delta > 0 ? substitute(x, params.n, spec.delta) : x;
    const decision = decode(sk, received);
    threshold = decision.threshold;
    code.weights.push(decision.weight);
    if (decision.accepted) code.accepted++;
    if (spec.includeDistinguisher) {
      const d = distinguish(pk, received, params.eta, repeated);
      if (d.flagged) code.flagged++;
      if (d.comparisons > 0) {
        code.agreementSum += d.agreement;
        code.agreementTrials++;
      }
    }

    if (spec.includeRandom) {
      const u = randomString(params.n);
      const weight = syndromeWeight(sk, u);
      ctrl.weights.push(weight);
      if (weight < threshold) ctrl.accepted++;
      if (spec.includeDistinguisher) {
        const d = distinguish(pk, u, params.eta, repeated);
        if (d.flagged) ctrl.flagged++;
        if (d.comparisons > 0) {
          ctrl.agreementSum += d.agreement;
          ctrl.agreementTrials++;
        }
      }
    }

    if ((i + 1) % chunk === 0) yield { done: i + 1, total: spec.trials };
  }

  return {
    spec,
    codeword: finish(code),
    random: spec.includeRandom ? finish(ctrl) : null,
    comparisons: repeated.comparisons,
    threshold,
  };
}

/** Drive the generator to completion on the current thread (used by the tests). */
export function runTrialsSync(key: KeyPair, spec: TrialSpec): TrialResult {
  const it = runTrials(key, spec, Number.MAX_SAFE_INTEGER);
  let step = it.next();
  while (!step.done) step = it.next();
  return step.value;
}

export interface Histogram {
  readonly binWidth: number;
  readonly first: number;
  readonly counts: Int32Array;
  readonly max: number;
}

/**
 * Bin syndrome weights for the robustness exhibit.
 *
 * The bins span the observed range rather than a fixed window, because the
 * point of the picture is the DISTANCE between the bulk and the tail: at
 * (n = 4096, t = 3, eta = 0.05) the mean is about 550 and the largest weight
 * observed is near 1,500, and a histogram scaled to the mean would simply clip
 * the thing worth seeing.
 */
export function histogram(weights: Int32Array, bins = 24): Histogram {
  if (weights.length === 0) return { binWidth: 1, first: 0, counts: new Int32Array(0), max: 0 };
  let lo = weights[0];
  let hi = weights[0];
  for (const w of weights) {
    if (w < lo) lo = w;
    if (w > hi) hi = w;
  }
  const span = Math.max(1, hi - lo + 1);
  const binWidth = Math.max(1, Math.ceil(span / bins));
  const counts = new Int32Array(Math.ceil(span / binWidth));
  for (const w of weights) counts[Math.min(counts.length - 1, Math.floor((w - lo) / binWidth))]++;
  let max = 0;
  for (const c of counts) if (c > max) max = c;
  return { binWidth, first: lo, counts, max };
}
