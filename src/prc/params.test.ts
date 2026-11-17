/**
 * ACCEPTANCE CHECK B — every number in the brief's formula table, and
 * ACCEPTANCE CHECK G — the fail-closed parameter paths, each a named test.
 *
 * The expected values are the brief's own, independently recomputed by the
 * brief author before this lab existed. They are written as literals rather
 * than as expressions, because a test that re-derives `0.5 - (1-2eta)^t/2`
 * agrees with an implementation that got the formula wrong in the same way.
 *
 * Sources: threshold and the unsatisfied rate from Christ & Gunn (IACR ePrint
 * 2024/235), Construction 2 / Lemma 4 and the sparsity discussion in section
 * 2.2; the weak-key probability from Wang et al. (IACR ePrint 2025/2283),
 * Equation (2).
 */

import { describe, expect, it } from 'vitest';
import { sampleDistinct } from './bits.js';
import {
  MAX_ETA,
  MAX_T,
  MIN_T,
  ParameterError,
  assertSparseVectorExists,
  binomial,
  distinctRowSpace,
  distinguisherThreshold,
  effectiveNoise,
  expectedSyndromeWeight,
  informationPositionDegree,
  makeParams,
  maxSubstitutionRate,
  pairAgreementRate,
  threshold,
  unsatisfiedRate,
  weakKeyProbability,
} from './params.js';

describe('check B — the acceptance threshold, (1/2 - r^(-1/4)) r', () => {
  it('n = 4096: r = 4055 gives 1519.3', () => {
    expect(threshold(4055)).toBeCloseTo(1519.3, 1);
  });

  it('n = 8192: r = 8110 gives 3200.4', () => {
    expect(threshold(8110)).toBeCloseTo(3200.4, 1);
  });

  it('the threshold is a fraction of r just under one half', () => {
    // zeta = r^(-1/4) is 0.125 at r = 4055, so the line sits at 0.375 r. This
    // is the shape mutation (5) in the brief breaks by using r^(-1/2): that
    // would put zeta at 0.0157 and the line at 0.484 r, accepting far more.
    expect(threshold(4055) / 4055).toBeCloseTo(0.3747, 4);
    expect((0.5 - Math.pow(4055, -0.5)) * 4055 / 4055).toBeCloseTo(0.4843, 4);
  });
});

describe('check B — unsatisfied-check probability for a codeword', () => {
  // 1/2 - (1 - 2 eta)^t / 2.
  const cases: [number, number, number][] = [
    [0.05, 3, 0.1355],
    [0.05, 5, 0.2048],
    [0.05, 7, 0.2609],
    [0.1, 3, 0.244],
    [0.1, 5, 0.3362],
    [0.1, 7, 0.3951],
  ];
  for (const [eta, t, expected] of cases) {
    it(`eta = ${eta}, t = ${t} gives ${expected}`, () => {
      expect(unsatisfiedRate(t, eta)).toBeCloseTo(expected, 4);
    });
  }

  it('an unrelated string fails every check with probability exactly one half', () => {
    // The limit as the codeword's correlation vanishes. Written as eta = 1/2
    // because that IS a codeword with no information left in it.
    expect(unsatisfiedRate(3, 0.5)).toBe(0.5);
    expect(unsatisfiedRate(8, 0.5)).toBe(0.5);
  });

  it('mean syndrome weight is r times that rate: 549 at (4096, t = 3, eta = 0.05)', () => {
    expect(expectedSyndromeWeight(4055, 3, 0.05)).toBeCloseTo(549.5, 1);
    expect(expectedSyndromeWeight(4055, 3, 0.1)).toBeCloseTo(989.4, 1);
    expect(expectedSyndromeWeight(4055, 5, 0.05)).toBeCloseTo(830.3, 1);
    expect(expectedSyndromeWeight(4055, 7, 0.03)).toBeCloseTo(712.7, 1);
    expect(expectedSyndromeWeight(4055, 7, 0.05)).toBeCloseTo(1057.8, 1);
  });
});

describe('check B — pair agreement and the distinguisher line', () => {
  // 1/2 + (1 - 2 eta)^2 / 2.
  const cases: [number, number][] = [
    [0.03, 0.9418],
    [0.05, 0.905],
    [0.1, 0.82],
  ];
  for (const [eta, expected] of cases) {
    it(`eta = ${eta}: two identical rows agree with probability ${expected}`, () => {
      expect(pairAgreementRate(eta)).toBeCloseTo(expected, 4);
    });
  }

  it('the decision line is the midpoint between chance and the codeword rate', () => {
    for (const eta of [0.03, 0.05, 0.1]) {
      expect(distinguisherThreshold(eta)).toBeCloseTo((0.5 + pairAgreementRate(eta)) / 2, 10);
    }
    expect(distinguisherThreshold(0.05)).toBeCloseTo(0.7025, 4);
  });
});

describe('check B — extra substitutions compose as a Bernoulli channel', () => {
  // eta' = eta + delta - 2 eta delta.
  it('delta = 0.20 on top of eta = 0.05 is an effective rate of 0.23', () => {
    expect(effectiveNoise(0.05, 0.2)).toBeCloseTo(0.23, 10);
  });
  it('and the resulting mean syndrome weight clears the threshold', () => {
    // 1708 against a line at 1519: this is why acceptance collapses at delta = 0.20.
    expect(expectedSyndromeWeight(4055, 3, effectiveNoise(0.05, 0.2))).toBeCloseTo(1708.2, 1);
    expect(expectedSyndromeWeight(4055, 3, effectiveNoise(0.05, 0.05))).toBeCloseTo(950.0, 1);
  });
});

describe('check B — N = C(k, t-1), the whole of Attack-II', () => {
  it('binomial is exact at the sizes this lab asks for', () => {
    expect(binomial(41, 2)).toBe(820);
    expect(binomial(41, 7)).toBe(22481940);
    expect(binomial(82, 2)).toBe(3321);
    expect(binomial(82, 7)).toBe(3801756816);
    expect(binomial(5, 0)).toBe(1);
    expect(binomial(5, 6)).toBe(0);
  });

  it('at (4096, t = 3) there are 820 possible appended rows against 4055 of them', () => {
    // More rows than row values: a repeat is certain by pigeonhole, before any
    // birthday argument is needed at all.
    expect(distinctRowSpace(41, 3)).toBe(820);
    expect(distinctRowSpace(41, 3)).toBeLessThan(4055);
  });

  it('N uses t - 1, not t', () => {
    // Mutation (8) in the brief. Each appended row is the sum of t - 1 rows of
    // G0 — the t-th entry of the check is its own unit column, which is not a
    // row of G0 at all.
    expect(distinctRowSpace(41, 3)).toBe(binomial(41, 2));
    expect(distinctRowSpace(41, 3)).not.toBe(binomial(41, 3));
  });
});

describe('check B — weak-key probability, 1 - prod (1 - i/N)', () => {
  const table: [number, number, number, number][] = [
    // n, k, r, t -> expected
    [4096, 41, 4055, 3],
    [4096, 41, 4055, 4],
    [4096, 41, 4055, 5],
    [4096, 41, 4055, 6],
    [8192, 82, 8110, 3],
    [8192, 82, 8110, 4],
    [8192, 82, 8110, 5],
  ];
  for (const [n, k, r, t] of table) {
    it(`n = ${n}, t = ${t}: 1.0000`, () => {
      expect(weakKeyProbability(k, r, t)).toBeCloseTo(1.0, 4);
    });
  }

  it('n = 4096, t = 7: 0.8394', () => {
    expect(weakKeyProbability(41, 4055, 7)).toBeCloseTo(0.8394, 4);
  });
  it('n = 4096, t = 8: 0.3062', () => {
    expect(weakKeyProbability(41, 4055, 8)).toBeCloseTo(0.3062, 4);
  });
  it('n = 8192, t = 6: 0.7004', () => {
    expect(weakKeyProbability(82, 8110, 6)).toBeCloseTo(0.7004, 4);
  });
  it('n = 8192, t = 7: 0.0896', () => {
    expect(weakKeyProbability(82, 8110, 7)).toBeCloseTo(0.0896, 4);
  });
  it('n = 8192, t = 8: 0.0086', () => {
    expect(weakKeyProbability(82, 8110, 8)).toBeCloseTo(0.0086, 4);
  });

  it('the small answers survive, which is what log space buys', () => {
    // The product itself is exp(-4000) at (4096, t = 3) and underflows to zero
    // in a double, so a direct product cannot tell 0.0086 from 1.0000. The
    // 0.0086 above is the assertion that catches that; this one states the
    // reason as a measurement.
    const smallest = weakKeyProbability(82, 8110, 8);
    expect(smallest).toBeGreaterThan(0.008);
    expect(smallest).toBeLessThan(0.009);
    // Nothing saturates to exactly 1 unless it is pigeonhole-certain.
    expect(weakKeyProbability(82, 8110, 6)).toBeLessThan(1);
    expect(weakKeyProbability(41, 4055, 3)).toBe(1);
  });

  it('P_weak rises with r and falls with N, monotonically in t', () => {
    const byT = [3, 4, 5, 6, 7, 8].map((t) => weakKeyProbability(82, 8110, t));
    for (let i = 1; i < byT.length; i++) expect(byT[i]).toBeLessThanOrEqual(byT[i - 1]);
  });
});

describe('check B — how many checks an information position sits in', () => {
  it('about 198 at n = 4096, t = 3', () => {
    // r(t-1)/k = 4055 * 2 / 41. This is the number behind the heavy tail.
    expect(informationPositionDegree(4055, 3, 41)).toBeCloseTo(197.8, 1);
  });
  it('and about 198 at n = 8192, t = 3 as well, because k scales with n', () => {
    expect(informationPositionDegree(8110, 3, 82)).toBeCloseTo(197.8, 1);
  });
});

describe('check G — parameters that are refused, each one named', () => {
  it('refuses a code length this lab does not offer', () => {
    expect(() => makeParams({ n: 1024, t: 3, eta: 0.05 })).toThrow(ParameterError);
    expect(() => makeParams({ n: 1024, t: 3, eta: 0.05 })).toThrow(/not offered/);
    expect(() => makeParams({ n: 4097, t: 3, eta: 0.05 })).toThrow(ParameterError);
  });

  it(`refuses t below ${MIN_T}`, () => {
    expect(() => makeParams({ n: 4096, t: 2, eta: 0.05 })).toThrow(/outside 3…8/);
  });

  it(`refuses t above ${MAX_T}`, () => {
    expect(() => makeParams({ n: 4096, t: 9, eta: 0.05 })).toThrow(/outside 3…8/);
  });

  it('refuses a non-integer t', () => {
    expect(() => makeParams({ n: 4096, t: 3.5, eta: 0.05 })).toThrow(ParameterError);
  });

  it('refuses a negative noise rate', () => {
    expect(() => makeParams({ n: 4096, t: 3, eta: -0.01 })).toThrow(/outside \[0, 0.25\]/);
  });

  it(`refuses a noise rate above ${MAX_ETA}`, () => {
    expect(() => makeParams({ n: 4096, t: 3, eta: 0.26 })).toThrow(/outside \[0, 0.25\]/);
    expect(() => makeParams({ n: 4096, t: 3, eta: 0.5 })).toThrow(ParameterError);
  });

  it('refuses a non-finite noise rate', () => {
    expect(() => makeParams({ n: 4096, t: 3, eta: Number.NaN })).toThrow(ParameterError);
  });

  it('refuses a non-positive seed dimension g', () => {
    expect(() => makeParams({ n: 4096, t: 3, eta: 0.05, g: 0 })).toThrow(/positive integer/);
  });

  it('refuses t - 1 > k, where the sparse vector cannot exist', () => {
    // The guard makeParams calls, called directly. At the offered sizes k is
    // 41 or 82 against t <= 8, so no accepted (n, t) can reach it through
    // makeParams — which is why it is a separate exported function and why
    // this test calls it rather than reimplementing the comparison and then
    // agreeing with itself. See the note on assertSparseVectorExists.
    expect(() => assertSparseVectorExists(6, 4)).toThrow(ParameterError);
    expect(() => assertSparseVectorExists(6, 4)).toThrow(/t - 1 = 5 exceeds k = 4/);
    expect(() => assertSparseVectorExists(5, 4)).not.toThrow();
    // And the sampler underneath refuses it too, independently.
    expect(() => sampleDistinct(4, 5)).toThrow(/cannot draw 5 distinct indices from 4/);
  });

  it('accepts the boundaries it is documented to accept', () => {
    expect(makeParams({ n: 4096, t: 3, eta: 0 }).eta).toBe(0);
    expect(makeParams({ n: 8192, t: 8, eta: 0.25 }).eta).toBe(0.25);
  });
});

describe('check B — the robustness margin, solved rather than searched', () => {
  it('t = 3 at (4096, eta = 0.05) tolerates substitutions up to delta = 0.150', () => {
    // This is the value the brief's own delta sweep straddles: it measured 106
    // of 200 accepted at delta = 0.15, which is what "the mean sits on the
    // threshold" looks like from the other side.
    expect(maxSubstitutionRate(4055, 3, 0.05)).toBeCloseTo(0.1497, 4);
  });

  it('and t = 8 tolerates only 0.033 — the squeeze, in one column', () => {
    expect(maxSubstitutionRate(4055, 8, 0.05)).toBeCloseTo(0.0327, 4);
  });

  it('the margin it reports really is where the mean crosses the threshold', () => {
    // Re-derived the other way round: feed the answer back through the mean
    // formula and confirm it lands on the line from below.
    for (const t of [3, 5, 8]) {
      const delta = maxSubstitutionRate(4055, t, 0.05);
      const under = expectedSyndromeWeight(4055, t, effectiveNoise(0.05, delta - 0.001));
      const over = expectedSyndromeWeight(4055, t, effectiveNoise(0.05, delta + 0.001));
      expect(under).toBeLessThan(threshold(4055));
      expect(over).toBeGreaterThan(threshold(4055));
    }
  });

  it('falls monotonically as t rises, and is zero when the noise already breaks it', () => {
    const margins = [3, 4, 5, 6, 7, 8].map((t) => maxSubstitutionRate(4055, t, 0.05));
    for (let i = 1; i < margins.length; i++) expect(margins[i]).toBeLessThan(margins[i - 1]);
    // At eta = 0.25 and t = 8 the mean is already over the line.
    expect(maxSubstitutionRate(4055, 8, 0.25)).toBe(0);
  });
});
