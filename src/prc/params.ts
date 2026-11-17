/**
 * The parameter set, and the arithmetic that follows from it alone.
 *
 * Everything in here is a closed-form consequence of (n, g, t, eta) with no
 * key involved, which is why the "Choosing t" exhibit can tabulate a weak-key
 * probability for a configuration nobody has generated a key for.
 *
 * Sources: Christ & Gunn, "Pseudorandom Error-Correcting Codes" (IACR ePrint
 * 2024/235), Construction 2 and Lemma 4; Wang, Wang, Cong, Ran, Liu & Wang,
 * "Cryptanalysis of LDPC-Based Pseudorandom Error-Correcting Codes" (IACR
 * ePrint 2025/2283), Algorithm 1 and section 4.2.
 */

/** The code lengths this lab offers. Both run in a browser in well under a second. */
export const OFFERED_N = [4096, 8192] as const;

/** Row weight of the parity-check matrix. Christ & Gunn take t = Theta(log n). */
export const MIN_T = 3;
export const MAX_T = 8;

/** The noise rate the encoder may use. */
export const MIN_ETA = 0;
export const MAX_ETA = 0.25;

/**
 * Columns of the generator matrix.
 *
 * Fixed at 64 so a row of G is exactly two machine words. The papers take
 * g = c*log^2(n) (Lemma 9) or leave it free (Construction 2); 64 sits in that
 * range for both offered sizes and is not a claim about either.
 */
export const G_COLUMNS = 64;

export interface Params {
  /** Code length: the number of bit positions in a codeword. */
  readonly n: number;
  /** Columns of G — the dimension of the seed u the encoder draws. */
  readonly g: number;
  /** Row weight of P: each parity check touches exactly this many positions. */
  readonly t: number;
  /** Number of parity checks, floor(0.99 n). */
  readonly r: number;
  /** Information positions, n - r. These are the rows of G0. */
  readonly k: number;
  /** Bernoulli noise rate used by the encoder. */
  readonly eta: number;
}

export class ParameterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParameterError';
  }
}

/**
 * Validate and complete a parameter set, or refuse.
 *
 * Every branch here is one of the EDGE CASES the brief enumerates, and each
 * refusal carries the reason rather than a generic "invalid": the message is
 * what the page prints, so it has to teach.
 */
export function makeParams(input: { n: number; t: number; eta: number; g?: number }): Params {
  const { n, t, eta } = input;
  const g = input.g ?? G_COLUMNS;

  if (!(OFFERED_N as readonly number[]).includes(n)) {
    throw new ParameterError(
      `Code length n = ${n} is not offered. This lab runs n = ${OFFERED_N.join(' or n = ')}; ` +
        `both are small enough to generate a key and run hundreds of trials in the browser.`,
    );
  }
  if (!Number.isInteger(t) || t < MIN_T || t > MAX_T) {
    throw new ParameterError(
      `Row weight t = ${t} is outside ${MIN_T}…${MAX_T}. Below ${MIN_T} the checks carry almost no ` +
        `signal; above ${MAX_T} a codeword's checks are too close to chance for the detector at these sizes.`,
    );
  }
  if (!Number.isFinite(eta) || eta < MIN_ETA || eta > MAX_ETA) {
    throw new ParameterError(
      `Noise rate eta = ${eta} is outside [${MIN_ETA}, ${MAX_ETA}]. At eta = 1/2 a codeword is a uniform ` +
        `string and nothing can decode it; this lab stops well short of that.`,
    );
  }
  if (!Number.isInteger(g) || g <= 0) {
    throw new ParameterError(`Seed dimension g = ${g} must be a positive integer.`);
  }

  const r = Math.floor(0.99 * n);
  const k = n - r;

  assertSparseVectorExists(t, k);

  return { n, g, t, r, k, eta };
}

/**
 * Refuse a (t, k) pair for which the sparse vector s_i does not exist.
 *
 * s_i is a weight-(t-1) vector in F2^k, so t - 1 > k is unsatisfiable rather
 * than merely unwise. It is a separate exported function BECAUSE the call
 * `makeParams` makes is currently unreachable: k is 41 or 82 at the offered
 * sizes against t <= 8, so no accepted n and t can reach it. That is a fact
 * about the source worth stating rather than hiding behind a test that
 * reimplements the comparison and then agrees with itself — so the guard is
 * tested here, directly, and `makeParams` is where it will start mattering the
 * first time someone adds a smaller n to OFFERED_N.
 */
export function assertSparseVectorExists(t: number, k: number): void {
  if (t - 1 > k) {
    throw new ParameterError(
      `Cannot sample a weight-${t - 1} vector in ${k} information positions: t - 1 = ${t - 1} exceeds k = ${k}.`,
    );
  }
}

/**
 * The decoder's acceptance threshold, (1/2 - zeta) * r with zeta = r^(-1/4).
 *
 * Lemma 4 of 2024/235 fixes zeta at r^(-1/4); Construction 2 accepts on a
 * STRICT inequality and the 2025 restatement writes `<=`. The threshold is
 * irrational, so no attainable integer weight sits on it and the two agree —
 * this lab takes the original's strict `<`.
 */
export function threshold(r: number): number {
  return (0.5 - Math.pow(r, -0.25)) * r;
}

/**
 * The probability that one weight-t parity check is UNSATISFIED by a codeword
 * carrying Bernoulli(eta) noise: 1/2 - (1 - 2 eta)^t / 2.
 *
 * The check sees t independent noise bits and reports their XOR, so this is
 * the classic piling-up lemma. For an unrelated string the same quantity is
 * exactly 1/2, which is the whole gap the detector lives in.
 */
export function unsatisfiedRate(t: number, eta: number): number {
  return 0.5 - Math.pow(1 - 2 * eta, t) / 2;
}

/** Expected syndrome weight for a codeword: r * unsatisfiedRate(t, eta). */
export function expectedSyndromeWeight(r: number, t: number, eta: number): number {
  return r * unsatisfiedRate(t, eta);
}

/**
 * Extra substitutions at rate delta compose with the encoder's own noise:
 * a position is wrong if exactly one of the two flipped it.
 */
export function effectiveNoise(eta: number, delta: number): number {
  return eta + delta - 2 * eta * delta;
}

/**
 * The probability that two positions carrying IDENTICAL rows of G agree in a
 * codeword: 1/2 + (1 - 2 eta)^2 / 2.
 *
 * Identical rows force G*u to agree at both positions, so the two bits differ
 * exactly when the noise flipped one of them and not the other. For a string
 * unrelated to the key the same quantity is 1/2. (2025/2283 section 4.2.)
 */
export function pairAgreementRate(eta: number): number {
  return 0.5 + Math.pow(1 - 2 * eta, 2) / 2;
}

/**
 * The distinguisher's decision line: halfway between chance and the codeword
 * rate above.
 *
 * The paper takes tau = 1/2 + r^(-1/4) over ml = r comparisons, which assumes
 * far more comparisons than one string of one key provides. The midpoint is
 * this lab's own choice for the one-string case, and it is stated as such on
 * the page.
 */
export function distinguisherThreshold(eta: number): number {
  return 0.5 + Math.pow(1 - 2 * eta, 2) / 4;
}

/**
 * C(n, m) as an exact double.
 *
 * The multiplicative form keeps every partial result an integer (the product
 * of any m consecutive integers is divisible by m!), so this is exact as long
 * as the answer is. The largest value this lab asks for is C(82, 7) = 3.8e9,
 * comfortably inside 2^53.
 */
export function binomial(n: number, m: number): number {
  if (m < 0 || m > n) return 0;
  const j = Math.min(m, n - m);
  let result = 1;
  for (let i = 0; i < j; i++) result = (result * (n - i)) / (i + 1);
  return Math.round(result);
}

/**
 * The number of distinct rows the construction can possibly append:
 * N = C(k, t - 1), the number of weight-(t-1) vectors in F2^k.
 *
 * This single number is the whole of Attack-II. Every one of the r appended
 * rows of G is the sum of t - 1 rows of G0, so the r rows are drawn from an
 * urn of size N — and at the sizes anyone actually runs, r is far larger than N.
 */
export function distinctRowSpace(k: number, t: number): number {
  return binomial(k, t - 1);
}

/**
 * P(at least two of the r appended rows coincide) = 1 - prod_{i<r} (1 - i/N).
 *
 * Equation (2) of 2025/2283, computed in log space. The product underflows a
 * double long before it stops being interesting — at (n = 4096, t = 3) it is
 * exp(-4000-ish) — so the sum of log1p terms is the only form that keeps the
 * small answers (0.0086 at n = 8192, t = 8) and the saturated ones apart.
 *
 * When r > N the product has a zero factor and the answer is exactly 1: more
 * rows than there are rows to draw, so a repeat is certain by pigeonhole.
 */
export function weakKeyProbability(k: number, r: number, t: number): number {
  const N = distinctRowSpace(k, t);
  if (N <= 0) return 1;
  if (r > N) return 1;
  let logProduct = 0;
  for (let i = 0; i < r; i++) logProduct += Math.log1p(-i / N);
  return 1 - Math.exp(logProduct);
}

/**
 * Expected number of repeated-row COMPARISONS a key yields: r minus the
 * expected number of distinct values among the r appended rows.
 *
 * Grouping r draws from N equally likely values leaves N(1 - (1 - 1/N)^r)
 * values occupied, and a group of size m contributes m - 1 comparisons.
 * Used only to tell a learner what to expect before they press the button.
 */
export function expectedComparisons(k: number, r: number, t: number): number {
  const N = distinctRowSpace(k, t);
  if (N <= 0) return r;
  const occupied = N * (1 - Math.pow(1 - 1 / N, r));
  return r - occupied;
}

/**
 * How many checks an average information position sits in: r(t-1)/k.
 *
 * This is the number behind the heavy tail in the robustness exhibit. The r
 * appended positions each sit in exactly ONE check; the k information
 * positions share all the remaining r(t-1) incidences between them, so at
 * n = 4096, t = 3 each one carries about 198 checks on its own.
 */
export function informationPositionDegree(r: number, t: number, k: number): number {
  return (r * (t - 1)) / k;
}

/**
 * The largest extra substitution rate delta at which the MEAN syndrome weight
 * is still below the acceptance threshold.
 *
 * This is the number that makes the trade-off in the "Choosing t" exhibit
 * visible. Asking only "is the mean below the threshold at the current delta?"
 * answers yes for every t at a low noise rate, which hides the squeeze; asking
 * how much more noise each t could take shows it at a glance — at
 * (n = 4096, eta = 0.05) the answer falls from 0.150 at t = 3 to 0.033 at t = 8.
 *
 * Solved rather than searched. Acceptance of the mean needs
 *
 *     r (1/2 - (1 - 2 eta')^t / 2) < (1/2 - r^(-1/4)) r
 *
 * which rearranges to (1 - 2 eta')^t > 2 r^(-1/4), so
 * eta' < (1 - (2 r^(-1/4))^(1/t)) / 2, and delta follows from
 * eta' = eta + delta (1 - 2 eta).
 *
 * Returns 0 when the mean is already over the threshold with no substitutions
 * at all, and NaN when the threshold is unreachable for any eta' (2 r^(-1/4)
 * at or above 1, which needs an r below about 16).
 *
 * It is a statement about the MEAN, not about acceptance: the heavy tail of
 * exhibit 3 means real acceptance is already well under 100% as delta
 * approaches this value.
 */
export function maxSubstitutionRate(r: number, t: number, eta: number): number {
  const floor = 2 * Math.pow(r, -0.25);
  if (floor >= 1) return Number.NaN;
  const etaPrime = (1 - Math.pow(floor, 1 / t)) / 2;
  const delta = (etaPrime - eta) / (1 - 2 * eta);
  return Math.max(0, delta);
}
