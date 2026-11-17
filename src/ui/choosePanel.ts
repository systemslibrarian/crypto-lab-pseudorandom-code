/**
 * Exhibit 6 — Choosing t, and what this lab does not show.
 *
 * The two pressures in one table, computed live from the formulas for the n
 * and η on screen. Raising t shrinks the weak-key probability, because the
 * number of possible appended rows C(k, t−1) grows fast; raising t also pushes
 * every parity check closer to chance, because a wider check sees more noise.
 * There is no value of t at the sizes offered here that makes both small.
 *
 * Then the list of things this page does NOT establish, which is the part of
 * an honest demo that has to be as prominent as the attack.
 */

import { MAX_T, MIN_T } from '../prc/params.js';
import {
  distinctRowSpace,
  expectedComparisons,
  expectedSyndromeWeight,
  makeParams,
  maxSubstitutionRate,
  threshold,
  unsatisfiedRate,
  weakKeyProbability,
} from '../prc/params.js';
import { clear, h, learnerCheck, note, num, panelIntro, roleList, section, table } from './dom.js';
import { type LabState, store } from './store.js';

export function renderChoosePanel(root: HTMLElement): void {
  const body = h('div', {});

  root.append(
    panelIntro(
      '6 · Choosing t — and what this lab does not show',
      'The 2024 paper picks t = Θ(log n), and its reasoning is a squeeze from both sides. Too small and ' +
        'the code is not pseudorandom: an adversary can brute-force all C(n, t) weight-t checks and test ' +
        'each against a handful of samples. Too large and it is not robust: each check sees more noise, ' +
        'so the gap the detector lives in closes.',
      'At the sizes you can run in a browser there is a third pressure, and it is the one the 2025 paper ' +
        'found. The table is computed live from the formulas for the n and η currently selected.',
    ),
    body,
  );

  function paint(state: LabState): void {
    clear(body);
    const { params } = state;
    const limit = threshold(params.r);
    const rows: (string | HTMLElement)[][] = [];
    let markRow = -1;

    for (let t = MIN_T; t <= MAX_T; t++) {
      // Each row is a parameter set in its own right, validated the same way
      // the key bar validates the selected one.
      const candidate = makeParams({ n: params.n, t, eta: params.eta });
      const pWeak = weakKeyProbability(candidate.k, candidate.r, t);
      const mean = expectedSyndromeWeight(candidate.r, t, candidate.eta);
      if (t === params.t) markRow = rows.length;
      rows.push([
        String(t),
        num(distinctRowSpace(candidate.k, t)),
        pWeak >= 0.99995 ? '1.0000' : pWeak.toFixed(4),
        expectedComparisons(candidate.k, candidate.r, t).toFixed(1),
        unsatisfiedRate(t, candidate.eta).toFixed(4),
        mean.toFixed(0),
        `δ ≤ ${maxSubstitutionRate(candidate.r, t, candidate.eta).toFixed(3)}`,
      ]);
    }

    body.append(
      section(
        `Both pressures at n = ${num(params.n)} and η = ${params.eta.toFixed(2)}`,
        table(
          `Computed from the formulas, not measured. r = ${num(params.r)}, k = ${num(params.k)}, ` +
            `acceptance threshold ${limit.toFixed(1)}.`,
          [
            't',
            'Possible appended rows C(k, t−1)',
            'P(key is weak)',
            'Expected comparisons',
            'Check failure rate',
            'Mean syndrome weight',
            'Substitutions it can still take',
          ],
          rows,
          { numeric: [0, 1, 2, 3, 4, 5], markRow, label: 'Weak-key probability against robustness, by t' },
        ),
        h(
          'p',
          { class: 'card-note', 'data-claim': 'choose-reading' },
          `Read the weak-key column against the last one. The weak-key probability only becomes small once ` +
            `C(k, t−1) is comfortably larger than r = ${num(params.r)} — and by then each check is failing so ` +
            `close to half the time that the code can barely take any substitutions at all: the last column ` +
            `falls from δ ≤ ${maxSubstitutionRate(params.r, 3, params.eta).toFixed(3)} at t = 3 to ` +
            `δ ≤ ${maxSubstitutionRate(params.r, 8, params.eta).toFixed(3)} at t = 8. That last column is where the ` +
            `MEAN syndrome weight crosses the threshold, so real acceptance is already well under 100% before ` +
            `it — exhibit 3's heavy tail is why. The highlighted row is the configuration currently on screen.`,
        ),
      ),
      note(
        'caveat',
        `The squeeze is a small-n effect and the asymptotics are not in question: k = n − r grows with n, ` +
          `so C(k, t−1) grows with it, and for large enough n a t = Θ(log n) sits comfortably in the middle. ` +
          `At n = ${num(params.n)}, k is only ${num(params.k)}, and that is the whole difference between the ` +
          `2024 paper's theorem and the 2025 paper's measurement.`,
      ),
      section(
        'Larger n moves the table, so look at both',
        table(
          'The same two columns at both offered sizes, for comparison',
          ['t', `P(weak) at n = 4,096`, `P(weak) at n = 8,192`, 'Check failure rate at the current η'],
          Array.from({ length: MAX_T - MIN_T + 1 }, (_, i) => {
            const t = MIN_T + i;
            const small = makeParams({ n: 4096, t, eta: params.eta });
            const large = makeParams({ n: 8192, t, eta: params.eta });
            const ps = weakKeyProbability(small.k, small.r, t);
            const pl = weakKeyProbability(large.k, large.r, t);
            return [
              String(t),
              ps >= 0.99995 ? '1.0000' : ps.toFixed(4),
              pl >= 0.99995 ? '1.0000' : pl.toFixed(4),
              unsatisfiedRate(t, params.eta).toFixed(4),
            ];
          }),
          { numeric: [0, 1, 2, 3], label: 'Weak-key probability at both offered code lengths' },
        ),
      ),
      section(
        'What this lab does NOT show',
        h(
          'p',
          { class: 'card-note' },
          'Each line below is out of scope on purpose. None of it is implemented anywhere in this page, ' +
            'so nothing here is evidence about any of it.',
        ),
        roleList('not-built', [
          item(
            'Attack-I — partial secret key recovery',
            'Recovers rows of P from G by a meet-in-the-middle search over low-weight checks, which lets ' +
              'an adversary emulate the decoder. Not built here; the 2025 paper gives its complexity in ' +
              'its Theorem 1.',
          ),
          item(
            'Attack-III — the noise overlay attack',
            'Recovers the encoder’s noise vector by information-set decoding and then adds a chosen ' +
              'overlay that pushes the string past the decoder’s threshold, where random noise of the ' +
              'same weight would not. Attacks robustness rather than undetectability. Not built here.',
          ),
          item(
            'The defences the 2025 paper proposes',
            'Parameter recommendations, implementation suggestions, and a revised key generation ' +
              'function. This page implements the ORIGINAL key generation — the one with the flaw — ' +
              'because that is what exhibit 5 is about.',
          ),
          item(
            'Any language model or image model',
            'No tokens, no latents, no sampling. The papers’ watermarking schemes embed codeword bits ' +
              'by biasing a token sampler or choosing the signs of an initial latent; this page encodes ' +
              'and detects bit strings and stops there.',
          ),
          item(
            'Multi-bit messages and deletion robustness',
            'This is the zero-bit construction: the detector answers "is this one of mine?" and nothing ' +
              'more. The 2024 paper’s multi-bit and deletion-robust constructions are separate and are ' +
              'not here.',
          ),
          item(
            'Any claim that avoiding repeated rows makes an instance secure',
            'A key with no repeated rows of G defeats Attack-II and says nothing about Attack-I or ' +
              'Attack-III. The page reports "no repeated rows" as a refusal to claim anything, not as a ' +
              'pass.',
          ),
          item(
            'Any claim about a deployed watermark',
            'Nothing on this page was measured against a shipped product, and neither paper is cited here ' +
              'for one. The 2024 paper notes that several companies have pledged to watermark model ' +
              'output; what any of them actually run is outside everything read for this lab.',
          ),
        ]),
      ),
      section(
        'Seams left open, deliberately unbuilt',
        h(
          'p',
          { class: 'card-note' },
          'Two interfaces are shaped in the source so a future comparison would not need the engine ' +
            'rewritten, and neither has a second implementation today: a key-distribution seam (the 2025 ' +
            'paper proposes a revised key generation, which would slot in beside the one built here) and ' +
            'an attack seam (for the two attacks named above). They are named here rather than hidden, ' +
            'so that an empty seam is not mistaken for a built feature.',
        ),
      ),
      learnerCheck(
        'The 2024 paper proves this construction is pseudorandom under standard assumptions. The 2025 ' +
          'paper distinguishes its codewords at the parameters people actually use. Which is wrong?',
        [
          { label: 'The 2024 paper — its proof must have a gap', correct: false },
          { label: 'The 2025 paper — a proof settles it', correct: false },
          { label: 'Neither. An asymptotic guarantee is not a statement about a concrete instance', correct: true },
        ],
        'The proofs are asymptotic: they say that for large enough n, with parameters in a certain range, ' +
          'no efficient adversary wins. The 2025 paper looks at the n and t a browser or a language model ' +
          'actually runs and finds that the key generation there leaves a fingerprint. Both can hold at ' +
          'once, and that gap — between "secure asymptotically" and "secure at the size I shipped" — is ' +
          'the thing worth taking away from this page.',
      ),
    );
  }

  store.subscribe(paint);
  paint(store.current);
}

function item(title: string, detail: string): HTMLElement {
  return h(
    'li',
    {},
    h('span', { class: 'mark', 'aria-hidden': 'true' }, '—'),
    h('span', {}, h('strong', {}, `${title}. `), detail),
  );
}
