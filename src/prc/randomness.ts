/**
 * Two standard statistical tests, run on whatever string is on screen.
 *
 * The frequency (monobit) and runs tests of NIST SP 800-22 Rev 1a, sections
 * 2.1 and 2.3. They are here to be PASSED, and the exhibit says so in as many
 * words: a codeword of this construction sails through both, and that fact
 * carries no information whatever about whether it can be told from noise.
 * Pseudorandomness is a statement about every efficient adversary; these two
 * statistics are two particular adversaries, and the weak-key distinguisher in
 * the next exhibit is a third that succeeds on the same strings.
 */

/**
 * The complementary error function, by the Chebyshev expansion of Numerical
 * Recipes 3rd ed. (6.2.2). Accurate to near double precision across the whole
 * range, which the series of p-values this lab prints does not need — but a
 * test pins it against known values anyway, because an approximation nobody
 * checked is how a "p = 0.4" that should read "p = 1e-40" gets shipped.
 */
export function erfc(x: number): number {
  const COF = [
    -1.3026537197817094, 6.4196979235649026e-1, 1.9476473204185836e-2, -9.561514786808631e-3,
    -9.46595344482036e-4, 3.66839497852761e-4, 4.2523324806907e-5, -2.0278578112534e-5,
    -1.624290004647e-6, 1.30365583558e-6, 1.5626441722e-8, -8.5238095915e-8, 6.529054439e-9,
    5.059343495e-9, -9.91364156e-10, -2.27365122e-10, 9.6467911e-11, 2.394038e-11,
    -6.886027e-12, -2.68052e-12, 8.5614e-13, 1.3922e-13, -5.65e-14, -7.6e-15, 3.3e-15,
    2.0e-15, -2.0e-16,
  ];
  const z = Math.abs(x);
  const tt = 2 / (2 + z);
  const ty = 4 * tt - 2;
  let d = 0;
  let dd = 0;
  for (let j = COF.length - 1; j > 0; j--) {
    const tmp = d;
    d = ty * d - dd + COF[j];
    dd = tmp;
  }
  const ans = tt * Math.exp(-z * z + 0.5 * (COF[0] + ty * d) - dd);
  return x >= 0 ? ans : 2 - ans;
}

export interface FrequencyResult {
  readonly ones: number;
  readonly zeros: number;
  readonly n: number;
  /** |S_n| / sqrt(n), the normalised excess of ones over zeros. */
  readonly statistic: number;
  readonly pValue: number;
  /** p >= 0.01, the conventional SP 800-22 line. */
  readonly unremarkable: boolean;
}

/**
 * Frequency (monobit) test: are there about as many ones as zeros?
 *
 * S_n = sum of (2 b_i - 1); the p-value is erfc(|S_n| / sqrt(2n)).
 */
export function frequencyTest(bits: Uint8Array): FrequencyResult {
  const n = bits.length;
  let ones = 0;
  for (let i = 0; i < n; i++) ones += bits[i];
  const zeros = n - ones;
  const statistic = Math.abs(2 * ones - n) / Math.sqrt(n);
  const pValue = erfc(statistic / Math.SQRT2);
  return { ones, zeros, n, statistic, pValue, unremarkable: pValue >= 0.01 };
}

export interface RunsResult {
  /** Number of maximal blocks of equal bits. */
  readonly runs: number;
  readonly expectedRuns: number;
  readonly n: number;
  readonly proportion: number;
  readonly pValue: number;
  readonly unremarkable: boolean;
  /**
   * SP 800-22 refuses to run this test unless the monobit proportion is within
   * 2/sqrt(n) of one half; `false` means the frequency test already decided.
   */
  readonly applicable: boolean;
}

/**
 * Runs test: does the string switch between ones and zeros at the rate a
 * random string would?
 *
 * A string can hold exactly n/2 ones and still be 000…0111…1, which the
 * monobit test cannot see and this one rejects outright.
 */
export function runsTest(bits: Uint8Array): RunsResult {
  const n = bits.length;
  let ones = 0;
  for (let i = 0; i < n; i++) ones += bits[i];
  const pi = ones / n;

  if (Math.abs(pi - 0.5) >= 2 / Math.sqrt(n)) {
    return { runs: 0, expectedRuns: 0, n, proportion: pi, pValue: 0, unremarkable: false, applicable: false };
  }

  let runs = 1;
  for (let i = 1; i < n; i++) if (bits[i] !== bits[i - 1]) runs++;

  const expectedRuns = 2 * n * pi * (1 - pi);
  const pValue = erfc(Math.abs(runs - expectedRuns) / (2 * Math.sqrt(2 * n) * pi * (1 - pi)));
  return { runs, expectedRuns, n, proportion: pi, pValue, unremarkable: pValue >= 0.01, applicable: true };
}

/** Unpack a bit vector into one byte per bit, which both tests walk. */
export function unpack(v: Uint32Array, n: number): Uint8Array {
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = (v[i >>> 5] >>> (i & 31)) & 1;
  return out;
}
