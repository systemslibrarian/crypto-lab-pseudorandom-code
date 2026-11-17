/**
 * Exhibit 4 — Does it look random?
 *
 * Two standard statistics on the codeword that is on screen, and the same two
 * on a uniformly random string for comparison. Both come out unremarkable for
 * both strings, which is the exhibit's entire finding — and the exhibit says,
 * in the page's own words and not only in a README, that passing them shows
 * nothing about whether the strings can be told from noise.
 *
 * This is the setup for exhibit 5, where a distinguisher holding nothing but
 * the public key tells the very same strings apart.
 */

import { encode, randomString } from '../prc/code.js';
import { frequencyTest, runsTest, unpack } from '../prc/randomness.js';
import type { KeyPair } from '../prc/keygen.js';
import {
  clear,
  h,
  learnerCheck,
  note,
  num,
  panelIntro,
  section,
  table,
  verdict,
} from './dom.js';
import { type LabState, store } from './store.js';

/** Tag a rendered element so a test can address it without matching on copy. */
function withClass(name: string, element: HTMLElement): HTMLElement {
  element.classList.add(name);
  return element;
}
import { publishStrings } from './testHook.js';

export function renderRandomnessPanel(root: HTMLElement): void {
  const out = h('div', {});

  root.append(
    panelIntro(
      '4 · Does it look random?',
      'Two of the standard statistical tests, run on the bits themselves. The frequency (monobit) test ' +
        'asks whether there are about as many ones as zeros. The runs test asks whether the string ' +
        'switches between ones and zeros at the rate a random string would — a string can be perfectly ' +
        'balanced and still be a block of zeros followed by a block of ones, which the first test cannot ' +
        'see at all. (NIST SP 800-22 Rev 1a, sections 2.1 and 2.3.)',
      'Both tests report a p-value, and by convention a p-value of 0.01 or more is unremarkable: the ' +
        'string is as irregular as chance would make it.',
    ),
    h(
      'div',
      { class: 'controls' },
      h(
        'button',
        {
          type: 'button',
          class: 'btn btn-primary',
          id: 'rerun-randomness',
          onclick: () => paint(store.current),
        },
        'Draw fresh strings and test again',
      ),
    ),
    out,
  );

  function paint(state: LabState): void {
    clear(out);
    if (state.key === null) {
      out.append(verdict('none', 'Waiting for a key…', { claim: 'randomness-pending' }));
      return;
    }
    const key: KeyPair = state.key;
    const { params } = state;
    const codeword = encode(key.pk, params.eta).x;
    const noise = randomString(params.n);
    publishStrings({ codeword, random: noise });

    const rows: (string | HTMLElement)[][] = [];
    const verdicts: { label: string; unremarkable: boolean }[] = [];
    for (const [label, bits] of [
      ['Codeword', unpack(codeword, params.n)],
      ['Random string', unpack(noise, params.n)],
    ] as [string, Uint8Array][]) {
      const freq = frequencyTest(bits);
      const runs = runsTest(bits);
      verdicts.push({ label: `${label} — frequency`, unremarkable: freq.unremarkable });
      verdicts.push({ label: `${label} — runs`, unremarkable: runs.unremarkable });
      rows.push([
        label,
        'Frequency (monobit)',
        `${num(freq.ones)} ones / ${num(freq.zeros)} zeros`,
        freq.statistic.toFixed(3),
        freq.pValue.toFixed(4),
        freq.unremarkable ? 'unremarkable' : 'remarkable',
      ]);
      rows.push([
        label,
        'Runs',
        `${num(runs.runs)} runs (expected ${runs.expectedRuns.toFixed(0)})`,
        Math.abs(runs.runs - runs.expectedRuns).toFixed(1),
        runs.applicable ? runs.pValue.toFixed(4) : 'not run',
        runs.applicable ? (runs.unremarkable ? 'unremarkable' : 'remarkable') : 'proportion too skewed',
      ]);
    }

    const allUnremarkable = verdicts.every((v) => v.unremarkable);

    out.append(
      withClass(
        'test-results',
        table(
          `Both tests on both strings, n = ${num(params.n)} bits each`,
        ['String', 'Test', 'What it counted', 'Statistic', 'p-value', 'Reading'],
          rows,
          { numeric: [3, 4], label: 'Statistical test results' },
        ),
      ),
      verdict(
        allUnremarkable ? 'pass' : 'fail',
        allUnremarkable
          ? 'UNREMARKABLE — both tests read the codeword the same way they read the random string'
          : 'One test came out remarkable on this draw — redraw and look again',
        {
          claim: 'randomness-verdict',
          sub: allUnremarkable
            ? 'Which is what should happen, and what it is worth is the subject of the note below.'
            : 'At the 0.01 line about one test in a hundred comes out remarkable on genuinely random ' +
              'bits, so a single remarkable reading is itself unremarkable.',
        },
      ),
      note(
        'danger',
        h('strong', {}, 'Passing these tests shows nothing about pseudorandomness. '),
        'Pseudorandomness is a claim about every efficient adversary. These two statistics are two ' +
          'particular adversaries, and they are weak ones: they count ones and they count switches. ' +
          'A string can pass both and still be trivially recognisable to somebody who knows what to ' +
          'correlate — which is exactly what exhibit 5 does, with the public key and nothing else.',
      ),
      section(
        'What a test like this can and cannot rule out',
        h(
          'div',
          { class: 'card' },
          h('h3', {}, 'Two different questions'),
          table(
            'A statistical test and a cryptographic property are not the same claim',
            ['Question', 'Answered by', 'Answer here'],
            [
              [
                'Are these bits irregular in the two ways these tests measure?',
                'the table above',
                allUnremarkable ? 'yes' : 'this draw says otherwise — redraw',
              ],
              [
                'Can an efficient adversary distinguish these strings from uniform?',
                'exhibit 5, and the proofs in the 2024 paper',
                'for this key: yes, with the public key alone',
              ],
            ],
            { label: 'Statistical irregularity against cryptographic indistinguishability' },
          ),
        ),
      ),
      learnerCheck(
        'Suppose a codeword failed the frequency test badly. What would that tell you?',
        [
          { label: 'That the construction is broken', correct: false },
          { label: 'That this particular string is unusual — one draw in a hundred is, at p = 0.01', correct: true },
          { label: 'Nothing at all, ever', correct: false },
        ],
        'A single remarkable p-value is evidence about one string, not about a construction: at the 0.01 ' +
          'line roughly one uniform string in a hundred fails. It would take a rate of failures well above ' +
          'chance across many strings to say anything about the code — and even a clean pass across ' +
          'thousands would not establish pseudorandomness, because these tests only look for the two ' +
          'patterns they are built to look for.',
      ),
    );
  }

  store.subscribe(paint);
  paint(store.current);
}
