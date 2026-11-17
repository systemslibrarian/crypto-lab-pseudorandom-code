/**
 * Key generation for the zero-bit public-key pseudorandom LDPC code.
 *
 * This is the key distribution of the 2024/235 technical overview (section
 * 2.2), restated as Algorithm 1 of 2025/2283 — NOT the formal Definition 3,
 * which samples P first and then a random G in its kernel. The difference is
 * the whole subject of the "public key gives it away" exhibit: sampling G by
 * appending sums of t - 1 rows of G0 confines every appended row to a set of
 * only C(k, t-1) possibilities, and at the sizes anyone runs there are far
 * more rows than possibilities.
 *
 *   1. Sample G0 uniformly in F2^(k x g), where k = n - r.
 *   2. For i = 1 … r: sample a weight-(t-1) vector s_i in F2^k and append the
 *      row s_i * G0 to G. The i-th row of P is [s_i, 0^(i-1), 1, 0^(r-i)].
 *   3. Apply one random permutation to the n positions: G's rows and P's
 *      columns together, so that P G = 0 survives it.
 *
 * P G = 0 by construction — row i of P sums the s_i rows of G0 and then the
 * appended row, which IS that sum — and it is verified in full for every key
 * before the key is used (invariant 1), because "by construction" is a claim
 * about the code rather than about the object in memory.
 */

import {
  type RandomStream,
  defaultStream,
  makePool,
  randomBits,
  randomPermutation,
  sampleDistinct,
  wordsFor,
} from './bits.js';
import { type Params, ParameterError } from './params.js';

/**
 * What an adversary holds. There is no `P` field and there is no route to one:
 * invariant 2 says the Attack-II distinguisher gets the public key and a
 * string, and this type is how that is enforced rather than promised.
 */
export interface PublicKey {
  readonly n: number;
  readonly g: number;
  /** Row-major, `wordsPerRow` words per row, in permuted position order. */
  readonly G: Uint32Array;
  readonly wordsPerRow: number;
  /** The one-time pad z, packed over n bits. */
  readonly z: Uint32Array;
}

/**
 * What the key holder adds. `P` is stored as COLUMN INDICES, t per row, not as
 * a dense r x n matrix: at n = 8192 the dense form is 66 million bits of which
 * 65,000 are set, and the syndrome is a sum over the set ones either way
 * (invariant 5).
 *
 * Within a row the first t - 1 entries are the positions of s_i, sorted, and
 * the LAST entry is the position of that check's own unit column. Keeping them
 * apart is what lets the decoding exhibit say which single check a flip at a
 * given position disturbs.
 */
export interface SecretKey {
  readonly n: number;
  readonly r: number;
  readonly t: number;
  /** r * t column indices, row-major; entry t-1 of each row is the unit column. */
  readonly P: Int32Array;
  readonly z: Uint32Array;
}

export interface KeyPair {
  readonly params: Params;
  readonly pk: PublicKey;
  readonly sk: SecretKey;
  /**
   * `perm[j]` is the final position of construction-order position j:
   * positions 0 … k-1 are the information positions (the rows of G0) and
   * k + i is the unit position of check i.
   */
  readonly perm: Int32Array;
  /** The sparse vectors s_i, r rows of t-1 information indices each. */
  readonly sVectors: Int32Array;
}

/** Read row `row` of G into `out` (length `wordsPerRow`). */
export function readRow(pk: PublicKey, row: number, out: Uint32Array): void {
  const base = row * pk.wordsPerRow;
  for (let w = 0; w < pk.wordsPerRow; w++) out[w] = pk.G[base + w];
}

/** XOR row `row` of G into `out`. */
export function xorRow(pk: PublicKey, row: number, out: Uint32Array): void {
  const base = row * pk.wordsPerRow;
  for (let w = 0; w < pk.wordsPerRow; w++) out[w] ^= pk.G[base + w];
}

/** The t column indices of check `i`. */
export function checkColumns(sk: SecretKey, i: number): Int32Array {
  return sk.P.subarray(i * sk.t, (i + 1) * sk.t);
}

/** The position of check `i`'s own unit column. */
export function unitColumn(sk: SecretKey, i: number): number {
  return sk.P[i * sk.t + sk.t - 1];
}

/**
 * Assemble a key from material supplied by the caller.
 *
 * Split out from `generateKey` so the construction can be checked against a
 * worked example small enough to verify by hand, with no randomness in the
 * way. `g0Rows` is k rows of `wordsPerRow` words; `sVectors` is r rows of
 * t - 1 information indices; `perm` maps construction order to final order.
 */
export function buildKey(params: Params, material: {
  g0Rows: Uint32Array;
  sVectors: Int32Array;
  perm: Int32Array;
  z: Uint32Array;
}): KeyPair {
  const { n, g, t, r, k } = params;
  const wordsPerRow = wordsFor(g);
  const { g0Rows, sVectors, perm, z } = material;

  if (g0Rows.length !== k * wordsPerRow) {
    throw new ParameterError(`G0 must be ${k} rows of ${wordsPerRow} words, got ${g0Rows.length} words`);
  }
  if (sVectors.length !== r * (t - 1)) {
    throw new ParameterError(`expected ${r} sparse vectors of weight ${t - 1}, got ${sVectors.length} indices`);
  }
  if (perm.length !== n) throw new ParameterError(`permutation must cover all ${n} positions`);

  const G = new Uint32Array(n * wordsPerRow);
  const P = new Int32Array(r * t);

  // The information positions carry G0's rows unchanged.
  for (let j = 0; j < k; j++) {
    const dst = perm[j] * wordsPerRow;
    const src = j * wordsPerRow;
    for (let w = 0; w < wordsPerRow; w++) G[dst + w] = g0Rows[src + w];
  }

  // Each check appends the sum of its s_i rows and claims one position of its own.
  for (let i = 0; i < r; i++) {
    const appended = perm[k + i];
    const dst = appended * wordsPerRow;
    const sBase = i * (t - 1);
    const pBase = i * t;
    for (let a = 0; a < t - 1; a++) {
      const info = sVectors[sBase + a];
      if (info < 0 || info >= k) {
        throw new ParameterError(`sparse vector ${i} names information position ${info}, outside 0…${k - 1}`);
      }
      const src = info * wordsPerRow;
      for (let w = 0; w < wordsPerRow; w++) G[dst + w] ^= g0Rows[src + w];
      P[pBase + a] = perm[info];
    }
    // The unit entry, kept last. It is what makes the row's weight t rather
    // than t - 1, and what makes P G = 0 rather than P G = (the appended row).
    P[pBase + t - 1] = appended;
  }

  const pk: PublicKey = { n, g, G, wordsPerRow, z };
  const sk: SecretKey = { n, r, t, P, z };
  return { params, pk, sk, perm, sVectors };
}

/**
 * Verify P G = 0 over F2, in full, for every row (invariant 1).
 *
 * r rows of t index lookups and t row-XORs — 65,000 word operations at the
 * larger size, which is cheap enough that there is no reason to check a sample
 * instead. Returns the first offending row rather than a bare boolean so a
 * failure can say WHICH check does not annihilate.
 */
export function verifyParityCheck(key: KeyPair): { ok: boolean; rows: number; failedRow: number | null } {
  const { pk, sk } = key;
  const acc = new Uint32Array(pk.wordsPerRow);
  for (let i = 0; i < sk.r; i++) {
    acc.fill(0);
    const base = i * sk.t;
    for (let a = 0; a < sk.t; a++) xorRow(pk, sk.P[base + a], acc);
    for (let w = 0; w < pk.wordsPerRow; w++) {
      if (acc[w] !== 0) return { ok: false, rows: sk.r, failedRow: i };
    }
  }
  return { ok: true, rows: sk.r, failedRow: null };
}

/**
 * Sample a fresh key pair, and refuse to return one whose P G is not zero.
 *
 * The verification is not a debug assertion: a key that fails it is a key
 * whose "codewords" are not in the kernel of its own parity checks, and every
 * number the rest of this lab prints would be a measurement of nothing.
 */
export function generateKey(params: Params, stream: RandomStream = defaultStream): KeyPair {
  const { g, t, r, k, n } = params;
  const wordsPerRow = wordsFor(g);

  const g0Rows = new Uint32Array(k * wordsPerRow);
  crypto.getRandomValues(g0Rows);
  // g = 64 fills both words; a g that is not a multiple of 32 would need the
  // tail masked here, exactly as randomBits() does.
  const rest = g & 31;
  if (rest !== 0) {
    for (let j = 0; j < k; j++) g0Rows[(j + 1) * wordsPerRow - 1] &= (1 << rest) - 1;
  }

  const sVectors = new Int32Array(r * (t - 1));
  const pool = makePool(k);
  for (let i = 0; i < r; i++) {
    const s = sampleDistinct(k, t - 1, pool, stream);
    sVectors.set(s, i * (t - 1));
  }

  const perm = randomPermutation(n, stream);
  const z = randomBits(n);

  const key = buildKey(params, { g0Rows, sVectors, perm, z });

  const check = verifyParityCheck(key);
  if (!check.ok) {
    throw new Error(
      `Generated key failed its own parity check at row ${check.failedRow}: P G != 0. ` +
        `The key was discarded rather than used.`,
    );
  }
  return key;
}

// ── Crossing the worker boundary ────────────────────────────────────────────

/**
 * A key as plain transferable buffers.
 *
 * Key generation runs in a Web Worker (invariant 5), so the key has to cross a
 * `postMessage`. The typed arrays are sent as their underlying buffers and
 * TRANSFERRED rather than copied, which is also why the worker keeps its own
 * key as the source of truth for trials: a transferred buffer is detached on
 * the sending side, so there is exactly one owner of each array at any moment.
 */
export interface SerializedKey {
  readonly params: Params;
  readonly wordsPerRow: number;
  readonly G: ArrayBuffer;
  readonly P: ArrayBuffer;
  readonly z: ArrayBuffer;
  readonly perm: ArrayBuffer;
  readonly sVectors: ArrayBuffer;
}

/** Copy a key into transferable buffers. */
export function serializeKey(key: KeyPair): { payload: SerializedKey; transfer: ArrayBuffer[] } {
  const G = key.pk.G.slice().buffer;
  const P = key.sk.P.slice().buffer;
  const z = key.pk.z.slice().buffer;
  const perm = key.perm.slice().buffer;
  const sVectors = key.sVectors.slice().buffer;
  return {
    payload: { params: key.params, wordsPerRow: key.pk.wordsPerRow, G, P, z, perm, sVectors },
    transfer: [G, P, z, perm, sVectors],
  };
}

/** Rebuild a key from transferred buffers. Does not re-verify P G = 0; the sender did. */
export function deserializeKey(payload: SerializedKey): KeyPair {
  const { params, wordsPerRow } = payload;
  const z = new Uint32Array(payload.z);
  const pk: PublicKey = {
    n: params.n,
    g: params.g,
    G: new Uint32Array(payload.G),
    wordsPerRow,
    z,
  };
  const sk: SecretKey = {
    n: params.n,
    r: params.r,
    t: params.t,
    P: new Int32Array(payload.P),
    z,
  };
  return { params, pk, sk, perm: new Int32Array(payload.perm), sVectors: new Int32Array(payload.sVectors) };
}

/**
 * The same key under a different noise rate.
 *
 * eta is an encoder parameter, not key material: changing it must NOT silently
 * resample G, P and z, or a learner sweeping the noise rate would be comparing
 * measurements taken on different keys. The matrices are shared by reference.
 */
export function withEta(key: KeyPair, eta: number): KeyPair {
  return { ...key, params: { ...key.params, eta } };
}
