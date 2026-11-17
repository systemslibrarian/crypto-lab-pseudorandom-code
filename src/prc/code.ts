/**
 * Encode and detect — Construction 2 of IACR ePrint 2024/235.
 *
 *   Encode(pk = (G, z)):  u <- F2^g, e <- Ber(n, eta), output G u + z + e.
 *   Decode(sk = (P, z), x): accept iff wt(P (x + z)) < (1/2 - r^(-1/4)) r.
 *
 * The whole trapdoor is one line of algebra: P G = 0, so for a codeword
 * x = G u + z + e,
 *
 *     P (x + z) = P G u + P e = P e.
 *
 * The syndrome never sees the message seed at all — it sees the NOISE, which
 * is sparse, so each weight-t check is unsatisfied with probability
 * 1/2 - (1-2 eta)^t / 2 rather than the 1/2 an unrelated string gives. The
 * detector is counting that gap across r checks.
 */

import { bernoulliBits, getBit, parity32, randomBits, wordsFor } from './bits.js';
import type { PublicKey, SecretKey } from './keygen.js';
import { threshold } from './params.js';

export class CodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CodeError';
  }
}

/** Refuse a string that is not n bits wide (fail closed, with the reason). */
export function assertLength(x: Uint32Array, n: number, what = 'string'): void {
  const expected = wordsFor(n);
  if (x.length !== expected) {
    throw new CodeError(
      `This ${what} is ${x.length * 32} bits wide; this key decodes ${n}-bit strings ` +
        `(${expected} packed words, not ${x.length}). Nothing was decoded.`,
    );
  }
}

/**
 * G u: the codeword before pad and noise.
 *
 * Row j of the output is the parity of (row j of G) AND u — a g-bit dot
 * product over F2, which at g = 64 is two word ANDs and two parities.
 */
export function multiplyGu(pk: PublicKey, u: Uint32Array): Uint32Array {
  const { n, G, wordsPerRow } = pk;
  const out = new Uint32Array(wordsFor(n));
  for (let row = 0; row < n; row++) {
    const base = row * wordsPerRow;
    let acc = 0;
    for (let w = 0; w < wordsPerRow; w++) acc ^= parity32(G[base + w] & u[w]);
    if ((acc & 1) === 1) out[row >>> 5] |= 1 << (row & 31);
  }
  return out;
}

export interface Codeword {
  /** The emitted string, G u + z + e. */
  readonly x: Uint32Array;
  /** The seed, for the teaching panels. */
  readonly u: Uint32Array;
  /** The encoder's own noise, for the teaching panels. */
  readonly e: Uint32Array;
  /** Hamming weight of e — how many bits the encoder actually flipped. */
  readonly noiseWeight: number;
}

/** Encode with a caller-supplied seed and noise. Used by the hand-checked tests. */
export function encodeWith(pk: PublicKey, u: Uint32Array, e: Uint32Array): Uint32Array {
  const x = multiplyGu(pk, u);
  for (let w = 0; w < x.length; w++) x[w] ^= pk.z[w] ^ e[w];
  return x;
}

/** Encode: sample u and Bernoulli(eta) noise, emit G u + z + e. */
export function encode(pk: PublicKey, eta: number): Codeword {
  const u = randomBits(pk.g);
  const e = bernoulliBits(pk.n, eta);
  const x = encodeWith(pk, u, e);
  let noiseWeight = 0;
  for (let i = 0; i < pk.n; i++) noiseWeight += getBit(e, i);
  return { x, u, e, noiseWeight };
}

/** A uniformly random n-bit string — what a codeword is supposed to look like. */
export function randomString(n: number): Uint32Array {
  return randomBits(n);
}

/**
 * wt(P (x + z)): how many of the r parity checks the string fails.
 *
 * Each check is read through its t stored column indices (invariant 5); there
 * is no dense matrix product anywhere in this lab. At n = 8192, t = 8 that is
 * 65,000 bit reads, which is why a 300-trial run finishes in well under a
 * second.
 */
export function syndromeWeight(sk: SecretKey, x: Uint32Array): number {
  assertLength(x, sk.n);
  const { P, t, r, z } = sk;
  let unsatisfied = 0;
  for (let i = 0; i < r; i++) {
    const base = i * t;
    let bit = 0;
    for (let a = 0; a < t; a++) {
      const col = P[base + a];
      // x + z, read one position at a time: materialising y costs an n-bit
      // allocation per trial and buys nothing.
      bit ^= getBit(x, col) ^ getBit(z, col);
    }
    unsatisfied += bit;
  }
  return unsatisfied;
}

/**
 * Which checks a string fails, as a packed r-bit vector.
 *
 * Only the key panel needs this — the detector needs the weight alone — so it
 * is separate rather than making every trial pay for an r-bit allocation.
 */
export function syndrome(sk: SecretKey, x: Uint32Array): Uint32Array {
  assertLength(x, sk.n);
  const { P, t, r, z } = sk;
  const out = new Uint32Array(wordsFor(r));
  for (let i = 0; i < r; i++) {
    const base = i * t;
    let bit = 0;
    for (let a = 0; a < t; a++) {
      const col = P[base + a];
      bit ^= getBit(x, col) ^ getBit(z, col);
    }
    if (bit === 1) out[i >>> 5] |= 1 << (i & 31);
  }
  return out;
}

export interface Decision {
  readonly weight: number;
  readonly threshold: number;
  readonly accepted: boolean;
  readonly checks: number;
}

/**
 * Decode: accept iff the syndrome weight is BELOW (1/2 - r^(-1/4)) r.
 *
 * Strictly below, as Construction 2 writes it. The threshold is irrational so
 * no integer weight lands on it, and the 2025 restatement's `<=` decides every
 * reachable case identically.
 */
export function decode(sk: SecretKey, x: Uint32Array): Decision {
  const weight = syndromeWeight(sk, x);
  const limit = threshold(sk.r);
  return { weight, threshold: limit, accepted: weight < limit, checks: sk.r };
}

/**
 * Flip each position independently with probability `delta` — the channel the
 * robustness exhibit puts between the encoder and the detector.
 *
 * Composed with the encoder's own eta this is a Bernoulli channel at
 * eta + delta - 2 eta delta: a position is wrong when exactly one of the two
 * flipped it.
 */
export function substitute(x: Uint32Array, n: number, delta: number): Uint32Array {
  const flips = bernoulliBits(n, delta);
  const out = new Uint32Array(x.length);
  for (let w = 0; w < x.length; w++) out[w] = x[w] ^ flips[w];
  return out;
}

/**
 * How many checks each position sits in, for the whole key.
 *
 * The shape of this array is the explanation for the heavy tail the
 * robustness exhibit shows: the r positions that are some check's unit column
 * have degree exactly 1, while the k information positions share the other
 * r(t-1) incidences — about 198 checks each at n = 4096, t = 3. One noise bit
 * landing on an information position therefore flips about two hundred checks
 * at once, and the syndrome weight is a sum of a few hundred such jumps rather
 * than of r small independent ones.
 */
export function positionDegrees(sk: SecretKey): Int32Array {
  const degrees = new Int32Array(sk.n);
  for (let i = 0; i < sk.r * sk.t; i++) degrees[sk.P[i]]++;
  return degrees;
}
