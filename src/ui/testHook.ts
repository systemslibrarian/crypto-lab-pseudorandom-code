/**
 * The claims suite's window onto what the page rendered from.
 *
 * §4.1b of the master template asks for claims tests that RE-DERIVE a
 * displayed number from the page's raw inputs by a different route, rather
 * than re-running the expression the source uses. A syndrome weight cannot be
 * re-derived from the DOM: it is a sum over 4,055 parity checks and the page
 * shows eight of them. So the page publishes the exact arrays it rendered
 * from — references, not copies, so the two cannot drift — and the test
 * recomputes from those by a dense-mask route and compares against the text on
 * screen.
 *
 * The public and secret halves are published SEPARATELY and under separate
 * names, and that is the point rather than tidiness: the exhibit-5 claims test
 * reproduces the comparison count, the agreement fraction and the verdict from
 * `__prcPublicKey` ALONE. That is invariant 2 — "the distinguisher is given
 * (G, z) and the string only" — asserted at the rendered surface as well as at
 * the function signature.
 *
 * This is a test seam, not a data path: nothing in `src/` reads it back, and
 * the key material it names is the same per-session in-memory key the page is
 * already holding. It is never persisted and there is no server to send it to.
 */

import type { KeyPair } from '../prc/keygen.js';

export interface PublicHook {
  readonly n: number;
  readonly g: number;
  readonly t: number;
  readonly r: number;
  readonly k: number;
  readonly eta: number;
  readonly wordsPerRow: number;
  readonly G: Uint32Array;
  readonly z: Uint32Array;
}

export interface SecretHook {
  readonly n: number;
  readonly r: number;
  readonly t: number;
  readonly P: Int32Array;
  readonly z: Uint32Array;
}

export interface StringsHook {
  codeword: Uint32Array | null;
  random: Uint32Array | null;
}

declare global {
  interface Window {
    __prcPublicKey?: PublicHook;
    __prcSecretKey?: SecretHook;
    __prcStrings?: StringsHook;
  }
}

export function publishKey(key: KeyPair): void {
  const { params, pk, sk } = key;
  window.__prcPublicKey = {
    n: params.n,
    g: params.g,
    t: params.t,
    r: params.r,
    k: params.k,
    eta: params.eta,
    wordsPerRow: pk.wordsPerRow,
    G: pk.G,
    z: pk.z,
  };
  window.__prcSecretKey = { n: sk.n, r: sk.r, t: sk.t, P: sk.P, z: sk.z };
  window.__prcStrings = { codeword: null, random: null };
}

export function publishStrings(strings: Partial<StringsHook>): void {
  const current = window.__prcStrings ?? { codeword: null, random: null };
  window.__prcStrings = { ...current, ...strings };
}
