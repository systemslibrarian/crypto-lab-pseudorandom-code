/**
 * Exhibit 5 — The public key gives it away. Attack-II of IACR ePrint
 * 2025/2283, section 4.2.
 *
 * Everything in this exhibit is computed from (G, z) and the string. Not by
 * convention: `distinguish()` takes a `PublicKey`, a type with no P field and
 * no route to one, so the secret key is not reachable from this code path even
 * by mistake. That is invariant 2 of the build brief, and the claims suite
 * re-derives this panel's comparison count, agreement fraction and verdict
 * from the public half of the key alone.
 *
 * This panel also carries the lab's NEGATIVE CLAIM (§4.1d of the master
 * template): a state in which every check the page performs reports success
 * and the named property is violated anyway.
 */

import { getBit } from '../prc/bits.js';
import { decode, encode, randomString } from '../prc/code.js';
import type { KeyPair } from '../prc/keygen.js';
import { distinctRowSpace, expectedComparisons, pairAgreementRate, weakKeyProbability } from '../prc/params.js';
import { frequencyTest, runsTest, unpack } from '../prc/randomness.js';
import { meanAgreement } from '../prc/trials.js';
import {
  type DistinguisherResult,
  MIN_COMPARISONS,
  distinguish,
  findRepeatedRows,
} from '../prc/weak.js';
import {
  clear,
  evidenceRetired,
  h,
  learnerCheck,
  note,
  num,
  panelIntro,
  pct,
  rate,
  roleList,
  section,
  stat,
  table,
  verdict,
} from './dom.js';
import { createRunControl } from './runner.js';
import { type LabState, store } from './store.js';
import { publishStrings } from './testHook.js';

const TRIALS = 300;

/** The sentence the negative claim is made of. Asserted verbatim by the claims suite. */
export const NEGATIVE_CLAIM = '';

export function renderWeakPanel(root: HTMLElement): void {
  let resultSerial = -1;
  const findings = h('div', {});
  const trialsOut = h('div', {});

  const control = createRunControl({
    id: 'weak',
    label: `Run the distinguisher over ${num(TRIALS)} of each`,
    spec: () => ({ trials: TRIALS, delta: 0, includeRandom: true, includeDistinguisher: true }),
    onCleared: () => clear(trialsOut),
    onResult: (result, serial) => {
      resultSerial = serial;
      const { params } = store.current;
      const code = result.codeword;
      const ctrl = result.random!;
      clear(trialsOut);
      if (result.comparisons === 0) {
        trialsOut.append(
          verdict('none', 'This key has no repeated rows, so there was nothing to measure.', {
            claim: 'weak-trials-none',
          }),
        );
        return;
      }
      trialsOut.append(
        table(
          `Counted from ${num(code.trials)} codewords and ${num(ctrl.trials)} random strings, using ` +
            `${num(result.comparisons)} comparisons per string`,
          ['', 'Flagged by the public key', 'Rate', 'Mean agreement', 'Accepted by the secret detector'],
          [
            [
              'Codewords',
              `${num(code.flagged)} / ${num(code.trials)}`,
              pct(code.flagged, code.trials),
              rate(meanAgreement(code)),
              `${num(code.accepted)} / ${num(code.trials)}`,
            ],
            [
              'Random strings',
              `${num(ctrl.flagged)} / ${num(ctrl.trials)}`,
              pct(ctrl.flagged, ctrl.trials),
              rate(meanAgreement(ctrl)),
              `${num(ctrl.accepted)} / ${num(ctrl.trials)}`,
            ],
          ],
          { numeric: [1, 2, 3, 4], label: 'Distinguisher rates over many trials' },
        ),
        h(
          'p',
          { class: 'card-note', 'data-claim': 'weak-trials-prediction' },
          `Predicted agreement: ${pairAgreementRate(params.eta).toFixed(4)} for a codeword ` +
            `(1/2 + (1−2η)² / 2) and 0.5000 for anything unrelated to the key. The decision line sits ` +
            `halfway between them. Every count above is from runs.`,
        ),
      );
      if (result.comparisons < MIN_COMPARISONS) {
        trialsOut.append(
          note(
            'caveat',
            `With only ${num(result.comparisons)} comparisons per string, no single string gets a ` +
              `verdict here — the flag counts above are zero by REFUSAL, not by measurement. Look at the ` +
              `mean agreement instead: it still separates the two arms cleanly.`,
          ),
        );
      }
    },
  });

  root.append(
    panelIntro(
      '5 · The public key gives it away',
      'Every appended row of G is the sum of t − 1 rows of G0, so there are only C(k, t−1) rows it ' +
        'could be — and there are r appended rows. When r exceeds that count, two positions must carry ' +
        'the same row of G; well before that, the birthday argument makes it overwhelmingly likely.',
      'Two positions with identical rows of G are two positions where G·u agrees, whatever the seed. A ' +
        'codeword can only differ there if the noise flipped exactly one of the two, so the two bits of ' +
        'x ⊕ z agree with probability η² + (1−η)² = 1/2 + (1−2η)² / 2 — which is 0.905 at η = 0.05. For a ' +
        'string unrelated to the key they agree with probability exactly 1/2. Count the agreements.',
    ),
    note(
      'scope',
      h('strong', {}, 'This exhibit uses the public key only. '),
      'The repeated rows are found by hashing the rows of G; the comparison is made on x ⊕ z, and z ships ' +
        'in the public key of this construction. The parity-check matrix P never enters — the function ' +
        'that computes everything below takes a type that has no P field.',
    ),
    findings,
    section(
      'The same attack, over many strings',
      control.element,
      trialsOut,
    ),
    note(
      'caveat',
      'This lab builds Attack-II and nothing else. The 2025 paper also gives Attack-I (recovering part ' +
        'of the secret key from the public key by a meet-in-the-middle search) and Attack-III (overlaying ' +
        'a chosen noise vector to push a codeword past the decoder), and it proposes defences including a ' +
        'revised key generation. None of those is built here, and finding no repeated rows in a key is ' +
        'not evidence that the key is secure.',
    ),
    learnerCheck(
      'If a key happens to have no repeated rows of G, is it safe?',
      [
        { label: 'Yes — Attack-II is the attack, and it has nothing to work with', correct: false },
        { label: 'No — this is one attack of three, and the others do not need repeated rows', correct: true },
      ],
      'Attack-II is one of three in the 2025 paper, and the other two do not depend on repeated rows at ' +
        'all: Attack-I recovers part of P from G by a meet-in-the-middle search over low-weight checks, ' +
        'and Attack-III attacks robustness rather than undetectability. The paper reports its attacks ' +
        'undermining the claimed guarantees across practically feasible parameter ranges — with watermark ' +
        'detection at about 2²² operations in one of its examples. Neither of those attacks is built here, ' +
        'so this page cannot show you either one.',
    ),
  );

  function paint(state: LabState): void {
    control.setEnabled(state.status === 'ready');
    clear(findings);
    if (state.key === null) {
      findings.append(verdict('none', 'Waiting for a key…', { claim: 'weak-pending' }));
      clear(trialsOut);
      return;
    }

    const key: KeyPair = state.key;
    const { params } = state;
    const repeated = findRepeatedRows(key.pk);
    const codeword = encode(key.pk, params.eta).x;
    const noise = randomString(params.n);
    publishStrings({ codeword, random: noise });

    const codeResult = distinguish(key.pk, codeword, params.eta, repeated);
    const noiseResult = distinguish(key.pk, noise, params.eta, repeated);

    findings.append(
      section(
        'Stage I — find the repeated rows, by hashing the public key',
        h(
          'div',
          { class: 'field-row' },
          stat('Possible appended rows', num(distinctRowSpace(params.k, params.t)), `C(${num(params.k)}, ${params.t - 1})`, 'row-space'),
          stat('Appended rows', num(params.r), 'r = ⌊0.99 n⌋', 'appended-rows'),
          stat('Distinct rows found', num(repeated.distinctRows), `of ${num(params.n)}`, 'distinct-rows'),
          stat('Groups of identical rows', num(repeated.groups.length), 'size 2 or more', 'groups'),
          stat('Comparisons', num(repeated.comparisons), `expected ${expectedComparisons(params.k, params.r, params.t).toFixed(0)}`, 'comparisons'),
          stat('P(a key is weak)', weakKeyProbability(params.k, params.r, params.t).toFixed(4), 'from the formula', 'p-weak-here'),
        ),
        h(
          'p',
          { class: 'card-note' },
          `A group of m positions sharing one row contributes m − 1 comparisons — each member against the ` +
            `group's first — rather than all C(m, 2) pairs. Those m − 1 comparisons are not independent ` +
            `either: they share an endpoint, so they all turn on that one position's noise bit, and when ` +
            `it is flipped the whole group disagrees at once. The independent unit is the GROUP, which is ` +
            `why a handful of comparisons cannot carry a verdict about one string however many of them ` +
            `there are.`,
        ),
      ),
    );

    if (repeated.comparisons > 0) {
      const shown = Math.min(8, repeated.comparisons);
      const items: HTMLElement[] = [];
      // Spread the sample ACROSS groups rather than taking the first eight
      // comparisons, which all come from the single largest group and read as
      // one position compared with eight others. One pair per group shows what
      // the attack actually has: many independent identical-row pairs.
      const chosen: number[] = [];
      let offset = 0;
      for (const group of repeated.groups) {
        if (chosen.length >= shown) break;
        chosen.push(offset);
        offset += group.length - 1;
      }
      for (let slot = chosen.length; slot < shown; slot++) chosen.push(slot);
      for (const i of chosen.slice(0, shown)) {
        const a = repeated.pairs[2 * i];
        const b = repeated.pairs[2 * i + 1];
        const ya = getBit(codeword, a) ^ getBit(key.pk.z, a);
        const yb = getBit(codeword, b) ^ getBit(key.pk.z, b);
        items.push(
          h(
            'li',
            { class: 'pair' },
            h('span', {}, `G[${num(a)}] = G[${num(b)}]   →   (x ⊕ z) at ${num(a)} = ${ya}, at ${num(b)} = ${yb}`),
            ya === yb
              ? h('span', { class: 'pair-agree' }, '✓ agree')
              : h('span', { class: 'pair-differ' }, '✕ differ'),
          ),
        );
      }
      findings.append(
        section(
          `Stage II — count agreements on the codeword (${shown} of ${num(repeated.comparisons)}, one per group)`,
          roleList('pair-list', items),
        ),
      );
    }

    // The two strings, each judged on its own.
    findings.append(
      section(
        'The verdicts on the two strings on screen',
        h(
          'div',
          { class: 'two-up' },
          stringCard('A codeword from this key', 'dist-codeword', codeResult, params.eta),
          stringCard('A uniformly random string', 'dist-random', noiseResult, params.eta),
        ),
      ),
    );

    // ── The negative claim ────────────────────────────────────────────────
    const bits = unpack(codeword, params.n);
    const freq = frequencyTest(bits);
    const runs = runsTest(bits);
    const looksRandom = freq.unremarkable && runs.unremarkable;
    const detectorAccepts = decode(key.sk, codeword).accepted;

    const checks = table(
      'Every check this page performs on that one codeword',
      ['Check', 'Result'],
      [
        ['Frequency (monobit) test', freq.unremarkable ? `unremarkable (p = ${freq.pValue.toFixed(4)})` : `remarkable (p = ${freq.pValue.toFixed(4)})`],
        ['Runs test', runs.applicable ? (runs.unremarkable ? `unremarkable (p = ${runs.pValue.toFixed(4)})` : `remarkable (p = ${runs.pValue.toFixed(4)})`) : 'not applicable'],
        ['Secret-key detector', detectorAccepts ? 'accepted — one of this key’s' : 'rejected'],
        ['Public-key distinguisher (no secret)', describeVerdict(codeResult)],
      ],
      { markRow: 3, label: 'Every check this page performs on the codeword' },
    );
    // Addressable by the claims suite without matching on the copy inside it:
    // §4.1d assertion 2 has to read every check's RENDERED result, and a test
    // that found this table by its caption would fail the day the caption is
    // reworded rather than the day a check starts lying.
    checks.classList.add('all-checks');

    if (looksRandom && detectorAccepts && codeResult.verdict === 'flagged') {
      findings.append(
        section(
          'What that means',
          checks,
          verdict('alarm', 'LOOKS RANDOM TO THE TESTS — AND THE PUBLIC KEY TELLS THEM APART', {
            claim: 'negative-claim',
            sub: h(
              'span',
              { class: 'verdict-sub negative-claim' },
              `${NEGATIVE_CLAIM} It took ${num(repeated.comparisons)} comparisons and no secret key at all.`,
            ),
          }),
          note(
            'danger',
            'Both things on that line are true at once, and that is the exhibit. The randomness checks ' +
              'passed. The secret-key detector accepted. And a distinguisher holding only the public key ' +
              'separated this string from noise. An asymptotic pseudorandomness guarantee says nothing ' +
              'about whether a concrete instance has it.',
          ),
        ),
      );
    } else {
      findings.append(
        section(
          'What that means',
          checks,
          verdict(
            codeResult.verdict === 'flagged' ? 'alarm' : 'none',
            codeResult.verdict === 'flagged'
              ? 'The public key told this string from noise — but not every check on it read clean, so ' +
                'this is not the lab’s headline state'
              : `No claim on this key: ${describeVerdict(codeResult)}`,
            { claim: 'negative-claim-unmet' },
          ),
          note(
            'info',
            `The headline state of this lab needs three things at once: the randomness checks ` +
              `unremarkable, the secret-key detector accepting, and the public-key distinguisher ` +
              `flagging. On this draw ` +
              `${[
                looksRandom ? null : 'the randomness checks did not both read clean',
                detectorAccepts ? null : 'the detector rejected this codeword',
                codeResult.verdict === 'flagged' ? null : `the distinguisher gave no verdict (${describeVerdict(codeResult)})`,
              ]
                .filter(Boolean)
                .join('; ')}. ` +
              `Set n = 4,096 and t = 3 with η = 0.05 to reach it.`,
          ),
        ),
      );
    }

    if (resultSerial !== -1 && resultSerial !== state.serial) {
      clear(trialsOut);
      trialsOut.append(
        evidenceRetired(
          'Those rates were measured on the key and noise rate that were on screen before the last ' +
            'change, so they have been retired. Run them again.',
        ),
      );
      resultSerial = -1;
    }
  }

  store.subscribe(paint);
  paint(store.current);
}

function describeVerdict(result: DistinguisherResult): string {
  switch (result.verdict) {
    case 'no-repeats':
      return 'this key has no repeated rows of G, so Attack-II has nothing to work with';
    case 'too-few':
      return `only ${num(result.comparisons)} comparisons — fewer than the ${MIN_COMPARISONS} this page ` +
        `requires before calling a single string`;
    case 'flagged':
      return `told apart from noise — agreement ${rate(result.agreement)} against a line of ${rate(result.threshold)}`;
    case 'not-distinguished':
      return `not distinguished from noise — agreement ${rate(result.agreement)} against a line of ${rate(result.threshold)}`;
  }
}

function stringCard(
  title: string,
  claim: string,
  result: DistinguisherResult,
  eta: number,
): HTMLElement {
  const tone = result.verdict === 'flagged' ? 'alarm' : result.verdict === 'not-distinguished' ? 'pass' : 'none';
  const headline =
    result.verdict === 'flagged'
      ? 'TOLD APART FROM NOISE'
      : result.verdict === 'not-distinguished'
        ? 'NOT DISTINGUISHED FROM NOISE'
        : 'NO VERDICT';
  return h(
    'div',
    { class: 'card' },
    h('h3', {}, title),
    h(
      'div',
      { class: 'field-row' },
      stat('Comparisons', num(result.comparisons), 'identical-row pairs', `${claim}-comparisons`),
      stat('Agreed', num(result.agreeing), `of ${num(result.comparisons)}`, `${claim}-agreed`),
      stat('Agreement', rate(result.agreement, 4), `line at ${rate(result.threshold, 4)}`, `${claim}-agreement`),
      stat('A codeword should give', rate(pairAgreementRate(eta), 4), '1/2 + (1−2η)²/2', `${claim}-expected`),
    ),
    verdict(tone, headline, { claim: `${claim}-verdict`, sub: describeVerdict(result) }),
  );
}
