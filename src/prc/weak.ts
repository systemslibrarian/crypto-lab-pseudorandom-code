/**
 * Attack-II: the weak-key distinguisher of IACR ePrint 2025/2283, section 4.2.
 *
 * The observation is about the key distribution, not about the code. Every one
 * of the r appended rows of G is the sum of t - 1 rows of G0, so there are
 * only N = C(k, t-1) rows it could possibly be — and r is far bigger than N at
 * every size anyone runs. Rows therefore repeat, by the birthday argument, and
 * two positions carrying the SAME row of G are two positions where G u must
 * agree. A codeword differs there only when the noise flipped one and not the
 * other:
 *
 *     Pr[x_i = x_j] = 1/2 + (1 - 2 eta)^2 / 2      for a codeword
 *     Pr[x_i = x_j] = 1/2                          for an unrelated string
 *
 * At eta = 0.05 that is 0.905 against 0.500. Anyone holding the PUBLIC key can
 * find the repeated rows by hashing and then count agreements, with no access
 * to P at all — which is what `distinguish` takes as its argument type and why
 * invariant 2 is a signature rather than a promise.
 *
 * The weak-key PROBABILITY formulas live in `params.ts`, because they depend
 * on (n, t) alone and the "Choosing t" exhibit tabulates them for parameters
 * no key has been generated for. They are re-exported here so Attack-II reads
 * as one module.
 */

import { type RandomStream, defaultStream, getBit, makePool, sampleDistinct } from './bits.js';
import { assertLength } from './code.js';
import type { PublicKey } from './keygen.js';
import {
  type Params,
  distinctRowSpace,
  distinguisherThreshold,
  expectedComparisons,
  pairAgreementRate,
  weakKeyProbability,
} from './params.js';

export { distinctRowSpace, expectedComparisons, pairAgreementRate, weakKeyProbability };

/**
 * Below this many comparisons a single string says nothing.
 *
 * One pair gives one bit. Thirty comparisons at the codeword rate of 0.905
 * separate from thirty at 0.5 by about four standard deviations IF they are
 * independent, which is the least that can carry a verdict about ONE string;
 * the paper's own analysis assumes ml = r comparisons, pooled across many
 * strings. Below this the page shows the measured overlap and refuses to call
 * it.
 *
 * They are not quite independent, and the floor is the brief's rather than a
 * derivation: the m - 1 comparisons inside a group all share the anchor
 * position, so they turn on one noise bit together and the independent unit is
 * really the GROUP. At the parameters where this attack bites there are
 * hundreds of groups — 814 of them at (4096, t = 3) — so the full-key
 * measurement is unaffected; it is a truncated handful of comparisons that is
 * noisier than its count suggests, which is an argument for the floor rather
 * than against it. `weak.test.ts` measures the effect directly.
 */
export const MIN_COMPARISONS = 30;

export interface RepeatedRows {
  /** Positions sharing one row value, groups of size >= 2, largest group first. */
  readonly groups: Int32Array[];
  /** Flat (anchor, member) pairs: 2 entries per comparison. */
  readonly pairs: Int32Array;
  /** Number of comparisons, i.e. sum over groups of (size - 1). */
  readonly comparisons: number;
  /** Distinct row values across all n rows of G. */
  readonly distinctRows: number;
}

/**
 * Group the rows of G by value and derive the comparison list.
 *
 * Every member of a group is compared against the group's FIRST member, which
 * is what makes a group of size m contribute m - 1 comparisons rather than
 * C(m, 2). The comparisons within a group are not independent, so counting all
 * pairs would inflate the evidence without adding any.
 *
 * Takes a `PublicKey`. This is Stage-I of the attack and it is the public key
 * that carries it.
 */
export function findRepeatedRows(pk: PublicKey): RepeatedRows {
  const { n, G, wordsPerRow } = pk;
  const byValue = new Map<string, number[]>();
  for (let row = 0; row < n; row++) {
    const base = row * wordsPerRow;
    let key = String(G[base]);
    for (let w = 1; w < wordsPerRow; w++) key += ',' + G[base + w];
    const bucket = byValue.get(key);
    if (bucket === undefined) byValue.set(key, [row]);
    else bucket.push(row);
  }

  const groups: Int32Array[] = [];
  let comparisons = 0;
  for (const rows of byValue.values()) {
    if (rows.length < 2) continue;
    groups.push(Int32Array.from(rows));
    comparisons += rows.length - 1;
  }
  groups.sort((a, b) => b.length - a.length);

  const pairs = new Int32Array(comparisons * 2);
  let at = 0;
  for (const group of groups) {
    const anchor = group[0];
    for (let i = 1; i < group.length; i++) {
      pairs[at++] = anchor;
      pairs[at++] = group[i];
    }
  }

  return { groups, pairs, comparisons, distinctRows: byValue.size };
}

export type DistinguisherVerdict = 'flagged' | 'not-distinguished' | 'too-few' | 'no-repeats';

export interface DistinguisherResult {
  readonly comparisons: number;
  readonly agreeing: number;
  /** agreeing / comparisons, or NaN when there is nothing to divide. */
  readonly agreement: number;
  /** The decision line, 1/2 + (1 - 2 eta)^2 / 4. */
  readonly threshold: number;
  /** What a codeword is expected to give, 1/2 + (1 - 2 eta)^2 / 2. */
  readonly codewordRate: number;
  readonly enough: boolean;
  readonly flagged: boolean;
  readonly verdict: DistinguisherVerdict;
}

/**
 * Stage-II: count agreements across the repeated-row comparisons.
 *
 * NOTE THE SIGNATURE. `pk` is a `PublicKey`, which has no `P` field and no
 * route to one, so this function cannot consult the secret key even by
 * mistake — invariant 2, enforced by the type rather than by a comment. The
 * pad z IS public (it ships in the public key of Construction 2), and the
 * attack needs it: the comparison is on x + z, because z is the only thing
 * standing between two identical rows and two identical bits.
 *
 * The decision line is the midpoint between chance and the codeword rate.
 * 2025/2283 uses tau = 1/2 + r^(-1/4) over ml = r comparisons pooled across
 * many strings; one string of one key gives far fewer, so the midpoint is this
 * lab's own choice for the single-string case and the page says so.
 */
export function distinguish(
  pk: PublicKey,
  x: Uint32Array,
  eta: number,
  repeated: RepeatedRows = findRepeatedRows(pk),
): DistinguisherResult {
  assertLength(x, pk.n);
  const { pairs, comparisons } = repeated;
  const limit = distinguisherThreshold(eta);
  const codewordRate = pairAgreementRate(eta);

  let agreeing = 0;
  for (let i = 0; i < comparisons; i++) {
    const a = pairs[2 * i];
    const b = pairs[2 * i + 1];
    // (x + z) at both positions. The pad cancels nothing here — it is what
    // makes a fixed string's agreement rate 1/2 rather than whatever the
    // string happens to be.
    const ya = getBit(x, a) ^ getBit(pk.z, a);
    const yb = getBit(x, b) ^ getBit(pk.z, b);
    if (ya === yb) agreeing++;
  }

  const agreement = comparisons === 0 ? Number.NaN : agreeing / comparisons;
  const enough = comparisons >= MIN_COMPARISONS;
  // The verdict comes from the MEASURED agreement, never from the mere
  // existence of comparisons. A key can be weak and a string still be noise.
  const flagged = enough && agreement > limit;

  let verdict: DistinguisherVerdict;
  if (comparisons === 0) verdict = 'no-repeats';
  else if (!enough) verdict = 'too-few';
  else if (flagged) verdict = 'flagged';
  else verdict = 'not-distinguished';

  return { comparisons, agreeing, agreement, threshold: limit, codewordRate, enough, flagged, verdict };
}

/**
 * Sample only the sparse vectors s_1 … s_r and report whether any two coincide.
 *
 * Two appended rows of G are equal whenever their s_i are equal, so this is
 * the same event the weak-key probability describes, at a fraction of the cost
 * of generating the key around it — which is what makes a 300-key measurement
 * of a 0.86% rate practical. (The converse can also happen, two different s_i
 * summing to the same row of G0, but at g = 64 that is a 2^-64 coincidence and
 * contributes nothing to the rate.)
 *
 * The code packs each sorted index list into one integer: k <= 82 fits in 7
 * bits and t - 1 <= 7 indices fit in 49, inside the 53 a double holds exactly.
 * Multiplication rather than shifting, because JavaScript's bitwise operators
 * truncate to 32 bits.
 */
export function sampleHasRepeatedSparseVector(params: Params, stream: RandomStream = defaultStream): boolean {
  const { k, r, t } = params;
  const m = t - 1;
  if (k >= 128 || m > 7) throw new RangeError('sparse-vector packing assumes k < 128 and t - 1 <= 7');
  const seen = new Set<number>();
  const pool = makePool(k);
  for (let i = 0; i < r; i++) {
    const s = sampleDistinct(k, m, pool, stream);
    let code = 0;
    for (let a = 0; a < m; a++) code = code * 128 + s[a];
    if (seen.has(code)) return true;
    seen.add(code);
  }
  return false;
}
