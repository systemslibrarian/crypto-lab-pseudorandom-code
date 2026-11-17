/**
 * Exhibit 1 — Keys.
 *
 * The headline mechanism of the whole lab is one line of algebra, and this
 * exhibit steps through it on a real check of the real key: the appended row
 * of G IS the sum of t - 1 rows of G0, which is why that check annihilates
 * every codeword — and why there are only C(k, t-1) rows it could have been.
 * Detection and the Attack-II fingerprint are the SAME fact seen twice, and a
 * reader who watches the sum come out equal has been shown both.
 */

import { hexPreview, wordsFor } from '../prc/bits.js';
import { positionDegrees } from '../prc/code.js';
import { type KeyPair, checkColumns, readRow, unitColumn, verifyParityCheck } from '../prc/keygen.js';
import { distinctRowSpace, informationPositionDegree } from '../prc/params.js';
import {
  clear,
  field,
  h,
  learnerCheck,
  note,
  num,
  panelIntro,
  roleList,
  section,
  stat,
  table,
  verdict,
} from './dom.js';
import { type LabState, store } from './store.js';

/** The 64-bit row as hex, which is how the page shows a row of G. */
function rowHex(key: KeyPair, row: number): string {
  const words = new Uint32Array(key.pk.wordsPerRow);
  readRow(key.pk, row, words);
  return hexPreview(words, key.pk.wordsPerRow * 4);
}

export function renderKeysPanel(root: HTMLElement): void {
  const body = h('div', {});
  root.append(
    panelIntro(
      '1 · The key: sparse checks, and a generator matrix built out of them',
      'A pseudorandom code is an error-correcting code whose codewords are supposed to look like ' +
        'random bits to everyone, while the holder of a secret key can still recognise one of its own ' +
        'even after some bits have been flipped. This one is "zero-bit": the key holder only ever ' +
        'learns "is this one of mine?", which is all a watermark needs.',
      'The secret key is a parity-check matrix P whose rows each touch exactly t of the n positions. ' +
        'The public key is a generator matrix G built so that P·G = 0 — and the way it is built is the ' +
        'thing to watch here, because it is also the flaw exhibit 5 exploits.',
    ),
    body,
  );

  function paint(state: LabState): void {
    clear(body);
    if (state.status === 'error') {
      body.append(verdict('fail', `No key: ${state.error ?? 'unknown error'}`, { claim: 'key-error' }));
      return;
    }
    if (state.key === null) {
      body.append(verdict('none', 'Generating a key…', { claim: 'key-pending' }));
      return;
    }

    const key = state.key;
    const { params } = state;
    const check = verifyParityCheck(key);
    const degrees = positionDegrees(key.sk);

    // ── The invariant, checked in full, every time ────────────────────────
    body.append(
      section(
        'P·G = 0, checked over every row',
        verdict(
          check.ok ? 'pass' : 'fail',
          check.ok
            ? `P·G = 0 verified over all ${num(check.rows)} parity checks`
            : `P·G is NOT zero at row ${check.failedRow} — this key was refused`,
          {
            claim: 'pg-zero',
            sub: check.ok
              ? 'Not a sample: every row of P was XORed across its t rows of G and the result compared ' +
                'against zero. A key that failed this was never handed to the exhibits.'
              : undefined,
          },
        ),
      ),
    );

    // ── The mechanism, on one real check ─────────────────────────────────
    const checkIndex = 0;
    const cols = Array.from(checkColumns(key.sk, checkIndex));
    const unit = unitColumn(key.sk, checkIndex);
    const sparse = cols.filter((c) => c !== unit);
    const accumulator = new Uint32Array(key.pk.wordsPerRow);
    const steps: HTMLElement[] = [];
    for (const col of sparse) {
      const before = hexPreview(accumulator, key.pk.wordsPerRow * 4);
      const words = new Uint32Array(key.pk.wordsPerRow);
      readRow(key.pk, col, words);
      for (let w = 0; w < accumulator.length; w++) accumulator[w] ^= words[w];
      steps.push(
        h(
          'li',
          { class: 'matrix-row' },
          h('span', { class: 'matrix-row-tag' }, `G[${num(col)}]`),
          h(
            'span',
            { class: 'matrix-row-cols' },
            `${rowHex(key, col)}   —   running XOR: ${before} → ${hexPreview(accumulator, key.pk.wordsPerRow * 4)}`,
          ),
        ),
      );
    }
    const summed = hexPreview(accumulator, key.pk.wordsPerRow * 4);
    const appended = rowHex(key, unit);

    body.append(
      section(
        `Why check ${checkIndex} annihilates every codeword`,
        h(
          'p',
          { class: 'card-note' },
          `This check touches ${params.t} positions. Take the rows of G at the first ${params.t - 1} of ` +
            `them and XOR them together; the result is the row of G at the last one. Adding that row in ` +
            `makes the whole sum zero — which is exactly what P·G = 0 says, one row at a time.`,
        ),
        roleList('matrix-rows', steps),
        h(
          'div',
          { class: 'card' },
          h('h3', {}, 'Both sides, computed and compared'),
          field(`XOR of the ${params.t - 1} rows above`, summed),
          field(`G[${num(unit)}] — this check's own position`, appended),
          verdict(
            summed === appended ? 'pass' : 'fail',
            summed === appended
              ? 'Equal, byte for byte — so XORing in this last row gives zero'
              : 'NOT equal — the construction is broken',
            { claim: 'row-sum' },
          ),
          h(
            'p',
            { class: 'card-note' },
            `Nothing in the public key marks which positions were the ${num(params.k)} rows of G0 and which ` +
              `were appended: one random permutation was applied to all ${num(params.n)} positions after the ` +
              `matrix was built. An attacker sees ${num(params.n)} rows of ${params.g} bits and no labels.`,
          ),
        ),
      ),
    );

    // ── A few sparse rows of P ────────────────────────────────────────────
    const sampleChecks = [0, 1, 2, 3, Math.floor(params.r / 2), params.r - 1];
    const rows = sampleChecks.map((i) => {
      const columns = Array.from(checkColumns(key.sk, i));
      const own = unitColumn(key.sk, i);
      return h(
        'li',
        { class: 'matrix-row' },
        h('span', { class: 'matrix-row-tag' }, `P row ${num(i)}`),
        h(
          'span',
          { class: 'matrix-row-cols' },
          ...columns.flatMap((c, idx) => [
            idx === 0 ? '' : ', ',
            c === own
              ? h('span', { class: 'unit-col', title: 'this check’s own position' }, num(c))
              : h('span', {}, num(c)),
          ]),
          ` — weight ${columns.length}`,
        ),
      );
    });

    body.append(
      section(
        'A few rows of the secret parity-check matrix P',
        h(
          'p',
          { class: 'card-note' },
          `Column indices, not a dense matrix: each of the ${num(params.r)} rows names exactly ${params.t} of ` +
            `the ${num(params.n)} positions and is zero everywhere else. The highlighted index is the ` +
            `position that belongs to that check alone.`,
        ),
        roleList('matrix-rows', rows),
        h(
          'div',
          { class: 'field-row' },
          stat('Rows of P', num(params.r), 'one per parity check', 'p-rows'),
          stat('Weight of every row', String(params.t), 'positions touched', 'p-weight'),
          stat('Shape of G', `${num(params.n)} × ${params.g}`, 'bits', 'g-shape'),
          stat('Packed size of G', `${num(params.n * wordsFor(params.g) * 4)} bytes`, 'typed arrays', 'g-bytes'),
        ),
      ),
    );

    // ── Degrees: the fact behind the heavy tail ───────────────────────────
    let degreeOne = 0;
    let heavy = 0;
    let maxDegree = 0;
    for (let i = 0; i < params.n; i++) {
      if (degrees[i] === 1) degreeOne++;
      else if (degrees[i] > 1) heavy++;
      if (degrees[i] > maxDegree) maxDegree = degrees[i];
    }
    body.append(
      section(
        'How many checks each position sits in',
        table(
          'Positions grouped by how many parity checks name them',
          ['Kind of position', 'How many', 'Checks per position'],
          [
            ['Appended — one check’s own position', num(degreeOne), '1'],
            [
              'Information — a row of G0',
              num(heavy),
              `about ${informationPositionDegree(params.r, params.t, params.k).toFixed(0)} (largest here: ${num(maxDegree)})`,
            ],
          ],
          { numeric: [1], label: 'Positions grouped by parity-check degree' },
        ),
        note(
          'info',
          `Those two rows are the same number read two ways: the ${num(params.r)} checks between them make ` +
            `${num(params.r * params.t)} references to positions, and ${num(params.r)} of those are each check's ` +
            `own. The remaining ${num(params.r * (params.t - 1))} are shared out among just ${num(params.k)} ` +
            `information positions. That lopsidedness is what makes the syndrome weight in exhibit 3 jump ` +
            `in steps of roughly ${informationPositionDegree(params.r, params.t, params.k).toFixed(0)} rather than drift smoothly.`,
        ),
      ),
    );

    // ── Forward reference: the count that becomes the attack ──────────────
    body.append(
      note(
        'caveat',
        `Count the rows G could possibly have: each appended row is the sum of ${params.t - 1} of the ` +
          `${num(params.k)} rows of G0, so there are C(${num(params.k)}, ${params.t - 1}) = ` +
          `${num(distinctRowSpace(params.k, params.t))} possibilities — against ${num(params.r)} appended rows. `,
        h('strong', {}, 'There are more rows than there are rows to choose from. '),
        'Exhibit 5 is nothing but that observation, carried out.',
      ),
      learnerCheck(
        'The permutation hides which positions are information positions. Does it also hide that two ' +
          'appended rows of G are identical?',
        [
          { label: 'Yes — permuting the positions scrambles the rows', correct: false },
          { label: 'No — it moves the rows around but two equal rows stay equal', correct: true },
        ],
        'A permutation reorders the rows of G; it does not change their contents. Two positions carrying ' +
          'the same 64-bit row before the permutation carry the same row after it, and an attacker who ' +
          'hashes the rows finds them without knowing anything about the order.',
      ),
    );
  }

  store.subscribe(paint);
  paint(store.current);
}
