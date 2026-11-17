/**
 * The key bar: the parameters, the Generate button, and the one key in play.
 *
 * It sits above the tabs rather than inside an exhibit because every exhibit
 * reads the same key, and a reader needs to see which key that is without
 * hunting for the tab that owns it.
 */

import { threshold } from '../prc/params.js';
import { type LabState, store } from './store.js';
import { clear, h, num } from './dom.js';

const T_VALUES = [3, 4, 5, 6, 7, 8];
/** eta in percent, so the slider is integral and the label exact. */
const ETA_MIN = 0;
const ETA_MAX = 25;

export function renderKeyBar(root: HTMLElement): void {
  const status = h('p', { class: 'key-bar-note', id: 'key-status', role: 'status', 'aria-live': 'polite' });
  const summary = h('div', { class: 'field-row', id: 'key-summary' });

  const nSelect = h(
    'select',
    {
      class: 'cl-select',
      id: 'n-select',
      // The no-op guard. Re-selecting the value already in play must NOT
      // resample the key: a reader who opens the menu, looks, and closes it
      // again would otherwise lose every measurement on screen. A native
      // select fires no `change` for an unchanged value, but a driven one
      // does, so the guard is here rather than left to the browser.
      onchange: () => {
        const chosen = Number(nSelect.value);
        if (chosen === store.current.params.n) return;
        void store.regenerate({ n: chosen });
      },
    },
    ...[4096, 8192].map((n) => h('option', { value: String(n) }, num(n))),
  ) as HTMLSelectElement;

  const tSelect = h(
    'select',
    {
      class: 'cl-select',
      id: 't-select',
      onchange: () => {
        const chosen = Number(tSelect.value);
        if (chosen === store.current.params.t) return;
        void store.regenerate({ t: chosen });
      },
    },
    ...T_VALUES.map((t) => h('option', { value: String(t) }, String(t))),
  ) as HTMLSelectElement;

  const etaValue = h('span', { class: 'range-value', id: 'eta-value' });
  const etaRange = h('input', {
    type: 'range',
    id: 'eta-range',
    min: String(ETA_MIN),
    max: String(ETA_MAX),
    step: '1',
    // `input` repaints the label only; the key is not touched until `change`,
    // so dragging the slider does not queue twenty worker round-trips.
    oninput: () => {
      etaValue.textContent = `η = ${(Number(etaRange.value) / 100).toFixed(2)}`;
    },
    onchange: () => {
      const chosen = Number(etaRange.value) / 100;
      if (chosen === store.current.params.eta) return;
      void store.setEta(chosen);
    },
  }) as HTMLInputElement;

  const generate = h(
    'button',
    { type: 'button', class: 'btn btn-primary', id: 'generate-key', onclick: () => void store.regenerate() },
    'Generate a new key',
  ) as HTMLButtonElement;

  root.append(
    h(
      'div',
      { class: 'key-bar-head' },
      h('h2', {}, 'The key in play'),
      h('p', { class: 'key-bar-note' }, 'Every exhibit below reads this one key.'),
    ),
    h(
      'div',
      { class: 'key-controls', role: 'group', 'aria-label': 'Key parameters' },
      h(
        'div',
        { class: 'key-control' },
        h('label', { for: 'n-select' }, 'Code length n'),
        nSelect,
        h('p', { class: 'key-control-hint' }, 'bit positions in a codeword'),
      ),
      h(
        'div',
        { class: 'key-control' },
        h('label', { for: 't-select' }, 'Check weight t'),
        tSelect,
        h('p', { class: 'key-control-hint' }, 'positions each parity check touches'),
      ),
      h(
        'div',
        { class: 'key-control' },
        h('label', { for: 'eta-range' }, 'Encoder noise rate η'),
        h('div', { class: 'range-row' }, etaRange, etaValue),
        h('p', { class: 'key-control-hint' }, 'does not change the key'),
      ),
      h('div', { class: 'key-actions' }, generate),
    ),
    summary,
    status,
  );

  function paint(state: LabState): void {
    nSelect.value = String(state.params.n);
    tSelect.value = String(state.params.t);
    etaRange.value = String(Math.round(state.params.eta * 100));
    etaValue.textContent = `η = ${state.params.eta.toFixed(2)}`;
    generate.disabled = state.status === 'generating';

    clear(summary);
    const { params } = state;
    summary.append(
      labelled('n', num(params.n), 'positions', 'bar-n'),
      labelled('r = ⌊0.99 n⌋', num(params.r), 'parity checks', 'bar-r'),
      labelled('k = n − r', num(params.k), 'information positions', 'bar-k'),
      labelled('g', String(params.g), 'columns of G', 'bar-g'),
      labelled('t', String(params.t), 'weight of every row of P', 'bar-t'),
      labelled('accept below', threshold(params.r).toFixed(1), '(1/2 − r^(−1/4))·r', 'bar-threshold'),
    );

    if (state.status === 'generating') {
      status.textContent = `Generating a key for n = ${num(params.n)}, t = ${params.t} in a worker…`;
    } else if (state.status === 'error') {
      status.textContent = `Refused: ${state.error ?? 'unknown error'}`;
    } else if (state.sameKeyAs !== null) {
      status.textContent =
        `Noise rate set to η = ${params.eta.toFixed(2)}. The key is unchanged — η is an encoder ` +
        `parameter, not key material — but every measurement taken at the old rate has been retired.`;
    } else {
      status.textContent =
        `Key ready. P·G = 0 was verified over all ${num(state.verifiedChecks)} parity checks before ` +
        `this key was used.`;
    }
  }

  store.subscribe(paint);
  paint(store.current);
}

function labelled(label: string, value: string, sub: string, testId: string): HTMLElement {
  return h(
    'div',
    { class: 'stat' },
    h('span', { class: 'stat-label' }, label),
    // `data-stat` so the claims suite can address this value rather than
    // matching on the label beside it: a reworded label would otherwise fail a
    // test about a number.
    h('span', { class: 'stat-value', 'data-stat': testId }, value),
    h('span', { class: 'stat-sub' }, sub),
  );
}
