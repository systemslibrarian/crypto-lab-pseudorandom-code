/**
 * Exhibit 3 — Robustness, and the shape of the distribution nobody predicts.
 *
 * The slider adds substitutions on top of the encoder's own noise, and the
 * measured acceptance is shown beside what the formula of FACTS 4 predicts for
 * the composed rate η' = η + δ − 2ηδ.
 *
 * The histogram is the part worth building. Acceptance is not a clean step at
 * the threshold, because the syndrome weight is NOT a sum of r small
 * independent terms: each of the k information positions sits in about
 * r(t−1)/k checks — roughly 198 at n = 4096, t = 3 — so a single noise bit
 * landing on one flips about two hundred checks at once. The weight therefore
 * moves in steps of that size and has a long right tail. That is a property of
 * this key distribution at small n, observed here; it is not a claim from
 * either paper.
 */

import {
  effectiveNoise,
  expectedSyndromeWeight,
  informationPositionDegree,
  threshold,
  unsatisfiedRate,
} from '../prc/params.js';
import { histogram } from '../prc/trials.js';
import {
  clear,
  evidenceRetired,
  h,
  histogramView,
  learnerCheck,
  note,
  num,
  panelIntro,
  pct,
  section,
  stat,
  verdict,
} from './dom.js';
import { createRunControl } from './runner.js';
import { type LabState, store } from './store.js';

const TRIALS = 300;

export function renderRobustPanel(root: HTMLElement): void {
  let delta = 0.1;
  let resultSerial = -1;
  let autoRun = false;
  const out = h('div', {});
  const deltaValue = h('span', { class: 'range-value', id: 'delta-value' }, 'δ = 0.10');
  const predicted = h('p', { class: 'card-note', id: 'delta-prediction' });

  const deltaRange = h('input', {
    type: 'range',
    id: 'delta-range',
    min: '0',
    max: '25',
    step: '1',
    value: '10',
    oninput: () => {
      delta = Number(deltaRange.value) / 100;
      deltaValue.textContent = `δ = ${delta.toFixed(2)}`;
      paintPrediction(store.current);
      retire();
    },
  }) as HTMLInputElement;

  const control = createRunControl({
    id: 'robust',
    label: `Run ${num(TRIALS)} codewords through the channel`,
    spec: () => ({ trials: TRIALS, delta, includeRandom: false, includeDistinguisher: false }),
    onCleared: () => clear(out),
    onResult: (result, serial) => {
      resultSerial = serial;
      const { params } = store.current;
      const arm = result.codeword;
      const limit = result.threshold;
      const bins = histogram(arm.weights, 26);
      const view = Array.from(bins.counts).map((count, i) => {
        const lo = bins.first + i * bins.binWidth;
        const hi = lo + bins.binWidth - 1;
        return {
          label: bins.binWidth === 1 ? num(lo) : `${num(lo)}–${num(hi)}`,
          count,
          over: lo >= limit,
        };
      });
      const etaPrime = effectiveNoise(params.eta, delta);

      clear(out);
      out.append(
        h(
          'div',
          { class: 'card' },
          h('h3', {}, `Measured over ${num(arm.trials)} codewords at δ = ${delta.toFixed(2)}`),
          h(
            'div',
            { class: 'field-row' },
            stat('Accepted', `${num(arm.accepted)} / ${num(arm.trials)}`, pct(arm.accepted, arm.trials), 'robust-accepted'),
            stat('Mean syndrome weight', arm.meanWeight.toFixed(1), `formula ${expectedSyndromeWeight(params.r, params.t, etaPrime).toFixed(1)}`, 'robust-mean'),
            stat('Lowest', num(arm.minWeight), 'of this run', 'robust-min'),
            stat('Highest', num(arm.maxWeight), 'of this run', 'robust-max'),
            stat('Accept below', limit.toFixed(1), 'threshold', 'robust-threshold'),
          ),
          verdict(
            arm.accepted / arm.trials > 0.5 ? 'pass' : 'fail',
            arm.accepted / arm.trials > 0.5
              ? `Still robust here: most codewords survive δ = ${delta.toFixed(2)}`
              : `Past the edge: most codewords no longer decode at δ = ${delta.toFixed(2)}`,
            { claim: 'robust-verdict' },
          ),
        ),
        section(
          'Where the weights actually fell',
          histogramView(view, {
            summary:
              `Histogram of syndrome weight over ${num(arm.trials)} codewords: lowest ${num(arm.minWeight)}, ` +
              `mean ${arm.meanWeight.toFixed(0)}, highest ${num(arm.maxWeight)}, acceptance threshold ` +
              `${limit.toFixed(0)}. The bulk sits near the mean and a thin tail reaches far to the right.`,
            axisLow: num(bins.first),
            axisHigh: num(bins.first + bins.counts.length * bins.binWidth - 1),
            thresholdNote: `at or above the threshold of ${limit.toFixed(0)} — rejected`,
          }),
          h(
            'p',
            { class: 'card-note', 'data-claim': 'tail-summary' },
            `The mean is ${arm.meanWeight.toFixed(0)} and the heaviest syndrome in this run was ` +
              `${num(arm.maxWeight)} — a gap of ${num(Math.round(arm.maxWeight - arm.meanWeight))}, or about ` +
              `${((arm.maxWeight - arm.meanWeight) / informationPositionDegree(params.r, params.t, params.k)).toFixed(1)} ` +
              `times the ${informationPositionDegree(params.r, params.t, params.k).toFixed(0)} checks a single ` +
              `information position sits in. If the ${num(params.r)} checks failed independently the spread would ` +
              `be a few tens of counts; it is not, because the checks share those ${num(params.k)} positions.`,
          ),
        ),
        note(
          'caveat',
          'That tail is why acceptance is not a sharp step at the threshold, and why a codeword can be ' +
            'rejected at a noise rate where the average codeword is accepted comfortably. It is a ' +
            'property of this key distribution at these small sizes, measured here — neither paper ' +
            'states it.',
        ),
      );
    },
  });

  root.append(
    panelIntro(
      '3 · Robustness: flipping bits on the way through',
      'A watermark is only useful if it survives editing. Flip each position of a codeword with ' +
        'probability δ before handing it to the detector; the detector never learns that you did.',
      'The two noise sources compose: a position is wrong when exactly one of them flipped it, so the ' +
        'channel the detector faces is Bernoulli at η′ = η + δ − 2ηδ, and every check is unsatisfied ' +
        'with probability 1/2 − (1−2η′)^t / 2. Watch the predicted mean climb toward the threshold as ' +
        'you raise δ.',
    ),
    h(
      'div',
      { class: 'controls' },
      h(
        'div',
        { class: 'key-control' },
        h('label', { for: 'delta-range' }, 'Extra substitution rate δ'),
        h('div', { class: 'range-row' }, deltaRange, deltaValue),
      ),
    ),
    predicted,
    control.element,
    out,
    learnerCheck(
      'Raising t makes each parity check touch more positions. What does that do to robustness?',
      [
        { label: 'Improves it — more positions means more evidence per check', correct: false },
        { label: 'Hurts it — a wider check is more likely to swallow a flipped bit', correct: true },
      ],
      'A weight-t check is unsatisfied with probability 1/2 − (1−2η)^t / 2, which climbs toward 1/2 as t ' +
        'grows: at η = 0.05 it is 0.136 for t = 3 and 0.261 for t = 7. Wider checks see more noise, so ' +
        'the gap the detector lives in narrows. Exhibit 6 puts that loss beside what raising t buys.',
    ),
  );

  function retire(): void {
    if (resultSerial === -1) return;
    clear(out);
    out.append(
      evidenceRetired(
        'The substitution rate changed, so those counts no longer describe the control on screen. ' +
          'Run them again at the new δ.',
      ),
    );
    resultSerial = -1;
  }

  function paintPrediction(state: LabState): void {
    const { params } = state;
    const etaPrime = effectiveNoise(params.eta, delta);
    const mean = expectedSyndromeWeight(params.r, params.t, etaPrime);
    const limit = threshold(params.r);
    predicted.textContent =
      `At η = ${params.eta.toFixed(2)} and δ = ${delta.toFixed(2)} the composed rate is ` +
      `η′ = ${etaPrime.toFixed(4)}, so each check should fail with probability ` +
      `${unsatisfiedRate(params.t, etaPrime).toFixed(4)} and the mean syndrome weight should be about ` +
      `${mean.toFixed(0)} against a threshold of ${limit.toFixed(1)} — ` +
      `${mean < limit ? 'below it, so most codewords should still decode' : 'above it, so most codewords should now be rejected'}.`;
  }

  function paint(state: LabState): void {
    control.setEnabled(state.status === 'ready');
    paintPrediction(state);
    if (resultSerial !== -1 && resultSerial !== state.serial) retire();
    // One automatic run, the first time this exhibit has a key to run on. The
    // histogram IS the exhibit, so arriving at an empty panel would hide the
    // thing the tab is named for — but every later run is the reader's, so a
    // changed delta or a new key retires the counts and waits.
    if (!autoRun && state.status === 'ready') {
      autoRun = true;
      control.trigger();
    }
  }

  store.subscribe(paint);
  paint(store.current);
}
