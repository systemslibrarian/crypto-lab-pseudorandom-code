/**
 * Packed bit vectors over F2, and the unbiased sampling every other module
 * draws from.
 *
 * Everything here is a `Uint32Array`: bit `i` of a vector lives in word
 * `i >>> 5` at offset `i & 31`. That is invariant 5 of the build brief — a
 * 4096-bit string is 128 words, and the generator matrix for n = 8192 is
 * 16,384 words rather than half a million booleans. It also makes the one
 * operation this lab performs most, "XOR these two rows", a two-instruction
 * loop instead of a 64-iteration one.
 *
 * All randomness comes from `crypto.getRandomValues` (invariant 3). Where a
 * uniform value in a range is needed, it is drawn by REJECTION rather than by
 * `% k`, and the permutation is a real Fisher-Yates. Both choices matter here
 * more than they usually do: this lab's whole subject is whether a key
 * distribution behaves the way its paper says, so a biased sampler would not
 * produce a wrong answer, it would produce a plausible one.
 */

/**
 * A buffered source of uniform 32-bit words from `crypto.getRandomValues`.
 *
 * Key generation at n = 8192, t = 8 needs roughly 57,000 uniform draws, and
 * one `getRandomValues` call per draw spends almost all of its time in the
 * call rather than the entropy. Refilling a block at a time keeps the source
 * identical — the same CSPRNG, the same bits, in the same order — while making
 * keygen fast enough to run on every parameter change.
 *
 * The block is capped at `MAX_BLOCK_WORDS`. `crypto.getRandomValues` refuses
 * any request over 65,536 BYTES — a hard limit in the Web Crypto spec, not a
 * tunable — and a stream asking for more throws `QuotaExceededError` on its
 * first refill rather than on construction, which is a long way from the line
 * that chose the size.
 */
export class RandomStream {
  /** 65,536 bytes, the Web Crypto per-call ceiling, expressed in 32-bit words. */
  static readonly MAX_BLOCK_WORDS = 16384;

  // Annotated `Uint32Array<ArrayBuffer>`, not the bare alias: the bare form
  // widens to ArrayBufferLike, which admits a SharedArrayBuffer, and
  // `crypto.getRandomValues` refuses one.
  private readonly buf: Uint32Array<ArrayBuffer>;
  private pos: number;

  constructor(blockWords = 4096) {
    if (!Number.isInteger(blockWords) || blockWords < 1) {
      throw new RangeError(`RandomStream block must be a positive integer word count, got ${blockWords}`);
    }
    const words = Math.min(blockWords, RandomStream.MAX_BLOCK_WORDS);
    this.buf = new Uint32Array(words);
    this.pos = words; // empty: the first next() refills
  }

  next(): number {
    if (this.pos >= this.buf.length) {
      crypto.getRandomValues(this.buf);
      this.pos = 0;
    }
    return this.buf[this.pos++];
  }
}

/** The process-wide stream. Callers may pass their own for isolation. */
export const defaultStream = new RandomStream();

/** Words needed to hold `bits` bits. */
export function wordsFor(bits: number): number {
  return (bits + 31) >>> 5;
}

/** Read bit `i` (0 or 1). */
export function getBit(v: Uint32Array, i: number): number {
  return (v[i >>> 5] >>> (i & 31)) & 1;
}

/** Set bit `i` to 1. */
export function setBit(v: Uint32Array, i: number): void {
  v[i >>> 5] |= 1 << (i & 31);
}

/** XOR bit `i` with 1. */
export function flipBit(v: Uint32Array, i: number): void {
  v[i >>> 5] ^= 1 << (i & 31);
}

/** `a ^= b`, word for word. Both must be the same length. */
export function xorInto(a: Uint32Array, b: Uint32Array): void {
  for (let i = 0; i < a.length; i++) a[i] ^= b[i];
}

/** Population count of one 32-bit word (Hamming weight). */
export function popcount32(x: number): number {
  // The standard SWAR sequence. `x - ((x >>> 1) & 0x55555555)` leaves each
  // 2-bit field holding its own popcount, and the rest folds those upward.
  let v = x - ((x >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  v = (v + (v >>> 4)) & 0x0f0f0f0f;
  return (v * 0x01010101) >>> 24;
}

/** Hamming weight of a packed vector over its first `bits` bits. */
export function weight(v: Uint32Array, bits: number): number {
  const full = bits >>> 5;
  let total = 0;
  for (let i = 0; i < full; i++) total += popcount32(v[i]);
  const rest = bits & 31;
  if (rest !== 0) total += popcount32(v[full] & ((1 << rest) - 1));
  return total;
}

/** Parity (XOR of all bits) of one 32-bit word. */
export function parity32(x: number): number {
  let v = x;
  v ^= v >>> 16;
  v ^= v >>> 8;
  v ^= v >>> 4;
  v ^= v >>> 2;
  v ^= v >>> 1;
  return v & 1;
}

/** A fresh zero vector able to hold `bits` bits. */
export function zeroBits(bits: number): Uint32Array {
  return new Uint32Array(wordsFor(bits));
}

/**
 * `bits` uniformly random bits, with the unused tail of the last word zeroed.
 *
 * The tail matters: `weight()` masks it, but `xorInto` does not, and a stray
 * high bit in the pad `z` would survive into a codeword's final word and make
 * two vectors that should be equal compare unequal word-wise.
 */
export function randomBits(bits: number): Uint32Array {
  const v = new Uint32Array(wordsFor(bits));
  crypto.getRandomValues(v);
  const rest = bits & 31;
  if (rest !== 0) v[v.length - 1] &= (1 << rest) - 1;
  return v;
}

/**
 * A uniform integer in [0, max), by rejection.
 *
 * `crypto.getRandomValues(u32) % max` is the tempting one-liner and it is
 * biased whenever `max` does not divide 2^32 — the first `2^32 mod max` values
 * come up one time more often than the rest. Here `max` is a code length or a
 * dimension (4096, 41, 82 …), so for the powers of two the bias is nil and for
 * the rest it is tiny; it is rejected anyway because "tiny bias in the key
 * sampler" is exactly the kind of thing this lab exists to be sceptical of.
 */
export function randomBelow(max: number, stream: RandomStream = defaultStream): number {
  if (!Number.isInteger(max) || max <= 0) throw new RangeError(`randomBelow: max must be a positive integer, got ${max}`);
  // The largest multiple of `max` that fits in 2^32; anything at or above it
  // is in the short final block and is redrawn.
  const limit = Math.floor(0x100000000 / max) * max;
  for (;;) {
    const x = stream.next();
    if (x < limit) return x % max;
  }
}

/**
 * A uniformly random permutation of [0, n), by Fisher-Yates.
 *
 * Read as `newIndex = perm[oldIndex]` everywhere in this lab: `keygen` builds
 * the key in the paper's index order (information positions first, then one
 * appended position per check) and then scatters it, so `perm` is the map from
 * that construction order to the positions a reader actually sees.
 */
export function randomPermutation(n: number, stream: RandomStream = defaultStream): Int32Array {
  const perm = new Int32Array(n);
  for (let i = 0; i < n; i++) perm[i] = i;
  for (let i = n - 1; i > 0; i--) {
    const j = randomBelow(i + 1, stream);
    const tmp = perm[i];
    perm[i] = perm[j];
    perm[j] = tmp;
  }
  return perm;
}

/**
 * `m` distinct indices drawn uniformly from [0, k), as a sorted array.
 *
 * This is how the sparse vector s_i is sampled: the construction wants a
 * uniformly random weight-(t-1) vector in F2^k, and a uniformly random
 * weight-m vector IS a uniformly random m-subset. A partial Fisher-Yates over
 * a scratch array gives that exactly, with no rejection loop and no bias from
 * re-drawing a collision.
 *
 * Sorted, because `weak.ts` compares two sparse vectors for equality and a
 * canonical order makes that a plain element-wise comparison.
 *
 * `scratch` may be a pool a previous call already shuffled, and reusing it is
 * not a shortcut that costs uniformity: the pool still holds exactly the set
 * {0, …, k-1}, and a partial Fisher-Yates over ANY arrangement of that set
 * yields a uniform m-subset. Key generation draws r of these — 8,110 of them
 * at the larger size — so allocating a fresh k-element pool each time is the
 * only part of it that would show up in a profile.
 */
export function sampleDistinct(
  k: number,
  m: number,
  scratch?: Int32Array,
  stream: RandomStream = defaultStream,
): Int32Array {
  if (m > k) throw new RangeError(`cannot draw ${m} distinct indices from ${k}`);
  const pool = scratch ?? makePool(k);
  const out = new Int32Array(m);
  for (let i = 0; i < m; i++) {
    const j = i + randomBelow(k - i, stream);
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
    out[i] = pool[i];
  }
  out.sort();
  return out;
}

/** A reusable pool for `sampleDistinct`, left in identity order. */
export function makePool(k: number): Int32Array {
  const pool = new Int32Array(k);
  for (let i = 0; i < k; i++) pool[i] = i;
  return pool;
}

/**
 * `n` independent Bernoulli(eta) bits, packed.
 *
 * Each bit is decided by one uniform 32-bit draw against `round(eta * 2^32)`,
 * so the realised rate is a multiple of 2^-32 rather than eta exactly. At
 * eta = 0.05 that is 0.05000000005 — an error of 5e-11, against a lab whose
 * tightest measurement is a rate over a few hundred trials. Stated rather than
 * hidden, because everything else here is sampled without bias on purpose.
 */
export function bernoulliBits(n: number, eta: number): Uint32Array {
  const out = new Uint32Array(wordsFor(n));
  if (eta <= 0) return out;
  const threshold = Math.round(eta * 0x100000000);
  const draws = new Uint32Array(n);
  crypto.getRandomValues(draws);
  for (let i = 0; i < n; i++) {
    if (draws[i] < threshold) out[i >>> 5] |= 1 << (i & 31);
  }
  return out;
}

/** A hex preview of the first `bytes` bytes of a packed vector. */
export function hexPreview(v: Uint32Array, bytes: number): string {
  const out: string[] = [];
  for (let i = 0; i < bytes; i++) {
    const byte = (v[i >>> 2] >>> ((i & 3) * 8)) & 0xff;
    out.push(byte.toString(16).padStart(2, '0'));
  }
  return out.join('');
}

/** A 0/1 string of the first `count` bits, for the teaching panels. */
export function bitString(v: Uint32Array, count: number): string {
  let s = '';
  for (let i = 0; i < count; i++) s += getBit(v, i) === 1 ? '1' : '0';
  return s;
}
