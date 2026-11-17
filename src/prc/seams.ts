/**
 * Extension seams. Shaped, not built.
 *
 * Two things are likely to be wanted next, and both would otherwise mean
 * rewriting the engine rather than adding to it. They are declared here, each
 * with exactly one implementation today, so the shape is fixed while there is
 * still only one case to fit it to — and named on the page (exhibit 6) as not
 * built, so an empty seam is never mistaken for a feature.
 *
 * NOTHING in this file adds a second implementation. A seam with one
 * implementation is a seam; a seam with a stub is a lie.
 */

import { type RandomStream, defaultStream } from './bits.js';
import { type KeyPair, generateKey } from './keygen.js';
import type { PublicKey } from './keygen.js';
import type { Params } from './params.js';

/**
 * [extension] point — how a key is sampled.
 *
 * The 2025 paper (section 6, "Mitigation Methods") proposes a REVISED key
 * generation function as one of its three defences. Comparing it against the
 * original is the obvious next exhibit: generate a key under each
 * distribution, run exhibit 5 against both, and show the comparison count
 * collapse. That needs the engine to stop assuming there is only one way to
 * sample a key, which is what this interface is for.
 *
 * It is NOT implemented here. The defences were not read for this lab beyond
 * their names, and a stub that resampled the same distribution under a second
 * label would make the page claim a comparison it had not made.
 */
export interface KeyDistribution {
  /** A short label, shown wherever a key's provenance matters. */
  readonly id: string;
  readonly name: string;
  /** What the distribution is, and where it comes from. */
  readonly source: string;
  sample(params: Params, stream?: RandomStream): KeyPair;
}

/** The one distribution this lab implements: 2024/235 section 2.2, as 2025/2283 Algorithm 1. */
export const LDPC_APPENDED_ROWS: KeyDistribution = {
  id: 'appended-rows',
  name: 'Appended sums of G0 rows, then one permutation',
  source:
    'Christ & Gunn, IACR ePrint 2024/235, the sampling procedure of section 2.2; restated with the ' +
    'permutation as Algorithm 1 of IACR ePrint 2025/2283.',
  sample(params: Params, stream: RandomStream = defaultStream): KeyPair {
    return generateKey(params, stream);
  },
};

export interface AttackFinding {
  /** Whether the attack reached a verdict at all. */
  readonly conclusive: boolean;
  /** What it measured, for the page to render. */
  readonly summary: string;
}

/**
 * [extension] point — an attack that is handed the PUBLIC key and strings.
 *
 * The signature is the interesting part, and it is deliberately narrow: an
 * `Attack` receives a `PublicKey` and candidate strings, never a `SecretKey`.
 * That is invariant 2 expressed as a type, so a future Attack-I or Attack-III
 * cannot quietly read P the way a function taking a whole `KeyPair` could.
 *
 * Neither of the other two attacks in the 2025 paper is implemented here.
 * Attack-I needs a meet-in-the-middle search over low-weight parity checks and
 * Attack-III needs an information-set decoder; both were read only by name and
 * contribution for this lab, and exhibit 6 says so on the page.
 */
export interface Attack {
  readonly id: string;
  readonly name: string;
  readonly source: string;
  run(pk: PublicKey, strings: readonly Uint32Array[], eta: number): AttackFinding;
}
