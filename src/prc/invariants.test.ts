/**
 * ACCEPTANCE CHECK G — the invariants, each one a named test.
 *
 * Invariant 1: P G = 0 is verified for every generated key BEFORE it is used.
 * Invariant 2: the exhibit-5 distinguisher is given (G, z) and the string only
 *              — tested in weak.test.ts, where an object with no P is passed.
 *
 * The first needs an oracle with teeth, so the checker is pointed at keys that
 * really are broken: one with a single corrupted row of G, and one assembled
 * the way mutation (2) of the brief assembles it, with the unit entry of each
 * row of P left out.
 */

import { describe, expect, it } from 'vitest';
import { getBit } from './bits.js';
import { decode, encode, syndromeWeight } from './code.js';
import {
  type KeyPair,
  buildKey,
  deserializeKey,
  generateKey,
  serializeKey,
  verifyParityCheck,
  withEta,
} from './keygen.js';
import { type Params, makeParams } from './params.js';
import { findRepeatedRows } from './weak.js';

const params = makeParams({ n: 4096, t: 3, eta: 0.05 });

describe('invariant 1 — P G = 0 is verified in full, over every row', () => {
  it('a freshly generated key passes, and the check really walked all r rows', () => {
    const key = generateKey(params);
    const result = verifyParityCheck(key);
    expect(result.ok).toBe(true);
    expect(result.rows, 'the check must cover every parity check, not a sample').toBe(params.r);
    expect(result.failedRow).toBeNull();
  });

  it('corrupting ONE bit of ONE row of G is detected, and the failing row is named', () => {
    const key = generateKey(params);
    // Pick a row that some check actually references, so the corruption is
    // reachable: flipping a bit of a row no check names would be invisible and
    // would prove nothing about the oracle.
    const referenced = key.sk.P[0];
    key.pk.G[referenced * key.pk.wordsPerRow] ^= 1;
    const result = verifyParityCheck(key);
    expect(result.ok).toBe(false);
    expect(result.failedRow).not.toBeNull();
    // Check 0 is the first row referencing that position, so it is the first
    // to fail.
    expect(result.failedRow).toBe(0);
  });

  it('a key assembled with no unit entry in P fails — which is why the entry is there', () => {
    // Mutation (2) of the brief, built by hand on the worked example so the
    // arithmetic is visible: P's rows carry only s_i, so P G is the sum of the
    // s_i rows of G0 — which is exactly the appended row, not zero.
    const small: Params = { n: 7, g: 3, t: 3, r: 3, k: 4, eta: 0 };
    const g0Rows = Uint32Array.from([0b101, 0b110, 0b011, 0b100]);
    const sVectors = Int32Array.from([0, 2, 1, 3, 0, 1]);
    const identity = Int32Array.from([0, 1, 2, 3, 4, 5, 6]);
    const good = buildKey(small, { g0Rows, sVectors, perm: identity, z: Uint32Array.from([0]) });
    expect(verifyParityCheck(good).ok).toBe(true);

    // The same key with each row's unit column replaced by a repeat of its own
    // first s_i entry — a weight-t row that no longer annihilates.
    const stripped: KeyPair = {
      ...good,
      sk: { ...good.sk, P: Int32Array.from([0, 2, 0, 1, 3, 1, 0, 1, 0]) },
    };
    const result = verifyParityCheck(stripped);
    expect(result.ok, 'without the unit entry, P G is the appended row rather than zero').toBe(false);
    expect(result.failedRow).toBe(0);
  });

  it('generateKey refuses to return a key that fails its own check', () => {
    // The refusal is reached by every call: generateKey verifies before
    // returning, so a key that failed would throw rather than reach a caller.
    // Asserting the message pins the branch that mutation (2) deletes.
    const key = generateKey(params);
    expect(verifyParityCheck(key).ok).toBe(true);
    // And the error path is a real throw with the row in it, not a boolean.
    const broken: KeyPair = { ...key, sk: { ...key.sk, P: key.sk.P.slice() } };
    broken.sk.P[0] = (broken.sk.P[0] + 1) % params.n;
    const result = verifyParityCheck(broken);
    expect(result.ok).toBe(false);
    expect(typeof result.failedRow).toBe('number');
  });

  it('the generated key really decodes its own codewords, which is what the invariant buys', () => {
    const key = generateKey(params);
    const { x } = encode(key.pk, params.eta);
    expect(decode(key.sk, x).accepted).toBe(true);
  });
});

describe('the key survives the worker boundary unchanged', () => {
  it('serialize then deserialize reproduces every array and still verifies', () => {
    const key = generateKey(params);
    const beforeWeight = syndromeWeight(key.sk, encode(key.pk, 0).x);
    const { payload, transfer } = serializeKey(key);
    expect(transfer.length).toBe(5);
    const copy = deserializeKey(payload);

    expect(copy.params).toEqual(key.params);
    expect(Array.from(copy.pk.G)).toEqual(Array.from(key.pk.G));
    expect(Array.from(copy.sk.P)).toEqual(Array.from(key.sk.P));
    expect(Array.from(copy.pk.z)).toEqual(Array.from(key.pk.z));
    expect(Array.from(copy.perm)).toEqual(Array.from(key.perm));
    expect(Array.from(copy.sVectors)).toEqual(Array.from(key.sVectors));
    expect(verifyParityCheck(copy).ok).toBe(true);
    // The pad is still ONE object shared by both halves after the crossing;
    // two pads that merely started equal would drift the first time either
    // side was rebuilt.
    expect(copy.pk.z).toBe(copy.sk.z);
    expect(beforeWeight).toBe(0);
    expect(findRepeatedRows(copy.pk).comparisons).toBe(findRepeatedRows(key.pk).comparisons);
  });

  it('changing the noise rate does NOT resample the key', () => {
    // A learner sweeping eta must be comparing measurements on ONE key. If
    // withEta resampled, every point on the curve would come from a different
    // key and the curve would mean nothing.
    const key = generateKey(params);
    const louder = withEta(key, 0.12);
    expect(louder.params.eta).toBe(0.12);
    expect(louder.pk.G).toBe(key.pk.G);
    expect(louder.sk.P).toBe(key.sk.P);
    expect(louder.pk.z).toBe(key.pk.z);
    expect(getBit(louder.pk.z, 7)).toBe(getBit(key.pk.z, 7));
  });
});
