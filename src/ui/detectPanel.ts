/**
 * Exhibit 2 — Encode and detect.
 *
 * A codeword and a uniformly random string, side by side, with the one number
 * that tells them apart computed for both. The point a reader should leave
 * with is how UNDRAMATIC the gap is: a codeword fails about 13.5% of its
 * parity checks and a random string about 50%, and the detector is a threshold
 * between two counts rather than any kind of signature check.
 */

import { hexPreview } from '../prc/bits.js';
import { decode, encode, randomString } from '../prc/code.js';
import type { KeyPair } from '../prc/keygen.js';
import { expectedSyndromeWeight, threshold, unsatisfiedRate } from '../prc/params.js';
import {
  clear,
  evidenceRetired,
  field,
  h,
  learnerCheck,
  note,
  num,
  panelIntro,
  pct,
  section,
  stat,
  table,
  verdict,
} from './dom.js';
import { createRunControl } from './runner.js';
import { type LabState, store } from './store.js';
import { publishStrings } from './testHook.js';

interface Sample {
  readonly codeword: Uint32Array;
  readonly random: Uint32Array;
  readonly noiseWeight: number;
}

const TRIALS = 300;

export function renderDetectPanel(root: HTMLElement): void {
  let sample: Sample | null = null;
  let resultSerial = -1;
  const evidence = h('div', {});
  const trialsOut = h('div', {});

  const control = createRunControl({
    id: 'detect',
    label: `Run ${num(TRIALS)} of each`,
    spec: () => ({ trials: TRIALS, delta: 0, includeRandom: true, includeDistinguisher: false }),
    onCleared: () => clear(trialsOut),
    onResult: (result, serial) => {
      resultSerial = serial;
      clear(trialsOut);
      const { params } = store.current;
      const code = result.codeword;
      const ctrl = result.random!;
      trialsOut.append(
        table(
          `Counted from ${num(code.trials)} codewords and ${num(ctrl.trials)} random strings on this key`,
          ['', 'Accepted', 'Rate', 'Mean syndrome weight', 'Lowest', 'Highest'],
          [
            [
              'Codewords',
              `${num(code.accepted)} / ${num(code.trials)}`,
              pct(code.accepted, code.trials),
              code.meanWeight.toFixed(1),
              num(code.minWeight),
              num(code.maxWeight),
            ],
            [
              'Random strings',
              `${num(ctrl.accepted)} / ${num(ctrl.trials)}`,
              pct(ctrl.accepted, ctrl.trials),
              ctrl.meanWeight.toFixed(1),
              num(ctrl.minWeight),
              num(ctrl.maxWeight),
            ],
          ],
          { numeric: [1, 2, 3, 4, 5], label: 'Acceptance counts over many trials' },
        ),
        h(
          'p',
          { class: 'card-note', 'data-claim': 'trial-prediction' },
          `The formula predicts a mean of r·(1/2 − (1−2η)^t/2) = ` +
            `${expectedSyndromeWeight(params.r, params.t, params.eta).toFixed(1)} for codewords and ` +
            `r/2 = ${(params.r / 2).toFixed(1)} for random strings. Both counts above are from runs, not ` +
            `from that formula.`,
        ),
      );
    },
  });

  root.append(
    panelIntro(
      '2 · Encoding, and the one number that tells a codeword from noise',
      'To encode, draw a random seed u, draw a noise vector e that flips each position with ' +
        'probability η, and send G·u ⊕ z ⊕ e. There is no header, no tag and no redundancy a reader ' +
        'could point at — the output is n bits.',
      'To detect, the key holder computes P·(x ⊕ z). Because P·G = 0, the seed cancels completely and ' +
        'what is left is P·e: the parity checks read the noise. A codeword fails each check slightly ' +
        'less than half the time; a string unrelated to the key fails each one exactly half the time. ' +
        'Count the failures and compare against a threshold.',
    ),
    h(
      'div',
      { class: 'controls' },
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-primary',
          id: 'new-sample',
          onclick: () => {
            if (store.current.key === null) return;
            sample = draw(store.current.key);
            paintEvidence(store.current);
          },
        },
        'Draw a new codeword and a new random string',
      ),
    ),
    evidence,
    section(
      'The same question, asked many times',
      h(
        'p',
        { class: 'card-note' },
        'One string is one sample. The counts below are from real encode-and-decode cycles on this key, ' +
          'with the number of runs shown beside every rate.',
      ),
      control.element,
      trialsOut,
    ),
    note(
      'scope',
      'Not production crypto, and not a watermark. There is no language model and no image model here: ' +
        'this exhibit encodes and detects bit strings at toy sizes. What a real scheme does with those ' +
        'bits — biasing a token sampler, choosing the signs of an initial latent — is out of scope and ' +
        'is named in exhibit 6.',
    ),
    learnerCheck(
      'The detector accepts when fewer than about 37% of the checks fail. Why not accept when ZERO ' +
        'checks fail?',
      [
        { label: 'Because the arithmetic is approximate', correct: false },
        { label: 'Because the encoder adds noise on purpose, so some checks always fail', correct: true },
        { label: 'Because P·G is only approximately zero', correct: false },
      ],
      'P·G = 0 exactly, and with no noise the syndrome is exactly zero — you can see that by setting ' +
        'η to 0.00. The noise is what makes codewords look random: without it, every codeword would ' +
        'satisfy every one of its key\'s parity checks, and anyone could test a guessed low-weight ' +
        'check against a handful of samples. The threshold is the price of that noise.',
    ),
  );

  function draw(key: KeyPair): Sample {
    const word = encode(key.pk, key.params.eta);
    const noise = randomString(key.params.n);
    publishStrings({ codeword: word.x, random: noise });
    return { codeword: word.x, random: noise, noiseWeight: word.noiseWeight };
  }

  function paintEvidence(state: LabState): void {
    clear(evidence);
    if (state.key === null || sample === null) {
      evidence.append(verdict('none', 'Waiting for a key…', { claim: 'detect-pending' }));
      return;
    }
    const key = state.key;
    const { params } = state;
    const limit = threshold(params.r);
    const codewordDecision = decode(key.sk, sample.codeword);
    const randomDecision = decode(key.sk, sample.random);

    evidence.append(
      h(
        'div',
        { class: 'two-up' },
        card('A codeword from this key', 'codeword', sample.codeword, codewordDecision, params, {
          extra: `Its noise vector e flipped ${num(sample.noiseWeight)} of the ${num(params.n)} positions ` +
            `(η·n = ${(params.eta * params.n).toFixed(0)} expected).`,
        }),
        card('A uniformly random string', 'random', sample.random, randomDecision, params, {
          extra: 'Drawn straight from crypto.getRandomValues. It has nothing to do with this key.',
        }),
      ),
      h(
        'div',
        { class: 'card' },
        h('h3', {}, 'The decision, both sides'),
        table(
          'Syndrome weight against the acceptance threshold',
          ['String', 'wt(P·(x ⊕ z))', 'Fraction of checks failed', 'Threshold', 'Verdict'],
          [
            [
              'Codeword',
              num(codewordDecision.weight),
              (codewordDecision.weight / params.r).toFixed(4),
              limit.toFixed(1),
              codewordDecision.accepted ? 'accepted' : 'rejected',
            ],
            [
              'Random string',
              num(randomDecision.weight),
              (randomDecision.weight / params.r).toFixed(4),
              limit.toFixed(1),
              randomDecision.accepted ? 'accepted' : 'rejected',
            ],
          ],
          { numeric: [1, 2, 3], label: 'Syndrome weights against the threshold' },
        ),
        h(
          'p',
          { class: 'card-note' },
          `Predicted fractions: ${unsatisfiedRate(params.t, params.eta).toFixed(4)} for a codeword ` +
            `(1/2 − (1−2η)^t / 2 at t = ${params.t}, η = ${params.eta.toFixed(2)}), and 0.5000 for anything ` +
            `unrelated to the key. The threshold sits at ` +
            `${(limit / params.r).toFixed(4)} = 1/2 − r^(−1/4).`,
        ),
      ),
    );

    if (resultSerial !== -1 && resultSerial !== state.serial) {
      clear(trialsOut);
      trialsOut.append(
        evidenceRetired(
          'Those counts were measured under the parameters that were on screen before the last change, ' +
            'so they have been retired. Run them again to measure this key.',
        ),
      );
      resultSerial = -1;
    }
  }

  function paint(state: LabState): void {
    control.setEnabled(state.status === 'ready');
    if (state.key === null) {
      sample = null;
      clear(trialsOut);
      paintEvidence(state);
      return;
    }
    // A fresh key gets a fresh sample immediately: encoding one string is a
    // few thousand word operations, so there is no reason to make a reader
    // press a button to see the exhibit's subject.
    sample = draw(state.key);
    paintEvidence(state);
  }

  store.subscribe(paint);
  paint(store.current);
}

function card(
  title: string,
  claim: string,
  x: Uint32Array,
  decision: { weight: number; accepted: boolean; threshold: number },
  params: { n: number; r: number },
  opts: { extra: string },
): HTMLElement {
  return h(
    'div',
    { class: 'card' },
    h('h3', {}, title),
    field('First 24 bytes', `${hexPreview(x, 24)}…`),
    h(
      'div',
      { class: 'field-row' },
      stat('Syndrome weight', num(decision.weight), `of ${num(params.r)} checks`, `${claim}-weight`),
      stat('Accept below', decision.threshold.toFixed(1), '(1/2 − r^(−1/4))·r', `${claim}-threshold`),
    ),
    verdict(
      decision.accepted ? 'pass' : 'fail',
      decision.accepted ? 'ACCEPTED — the detector claims this one' : 'REJECTED — not one of this key’s',
      { claim: `${claim}-verdict` },
    ),
    h('p', { class: 'card-note' }, opts.extra),
  );
}
