/** Tiny, dependency-free DOM helpers shared by the exhibits. */

type Attrs = Record<string, string | number | boolean | EventListener | undefined>;
type Child = Node | string | null | undefined;

/** Hyperscript: h('button', { class: 'x', onclick: fn }, 'label'). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (key === 'class') {
      node.className = String(value);
    } else if (value === true) {
      node.setAttribute(key, '');
    } else {
      node.setAttribute(key, String(value));
    }
  }
  for (const c of children) {
    if (c == null) continue;
    node.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export function clear(node: HTMLElement): void {
  node.replaceChildren();
}

/** Section heading + intro paragraph(s) for an exhibit. */
export function panelIntro(title: string, ...paras: (string | HTMLElement)[]): HTMLElement {
  return h(
    'div',
    { class: 'panel-intro' },
    h('h2', {}, title),
    ...paras.map((p) => (typeof p === 'string' ? h('p', {}, p) : p)),
  );
}

export function section(title: string, ...children: Child[]): HTMLElement {
  return h('div', { class: 'panel-section' }, h('h3', {}, title), ...children);
}

/** A labelled read-only value, wrapping rather than scrolling. */
export function field(label: string, value: string, opts: { mono?: boolean } = {}): HTMLElement {
  return h(
    'div',
    { class: 'field' },
    h('span', { class: 'field-label' }, label),
    h('code', { class: opts.mono === false ? 'field-value plain' : 'field-value' }, value),
  );
}

/** A big labelled number with an optional sub-line. */
export function stat(label: string, value: string, sub?: string, testId?: string): HTMLElement {
  return h(
    'div',
    { class: 'stat' },
    h('span', { class: 'stat-label' }, label),
    h('span', { class: 'stat-value', 'data-stat': testId }, value),
    sub ? h('span', { class: 'stat-sub' }, sub) : null,
  );
}

export type VerdictTone = 'pass' | 'fail' | 'alarm' | 'none';

/**
 * A verdict: icon + text + colour, never colour alone (WCAG 1.4.1).
 *
 * `claim` becomes a `data-verdict` marker so the claims suite and the mutation
 * script can address this exact verdict rather than matching on its wording.
 */
export function verdict(
  tone: VerdictTone,
  text: string,
  opts: { claim?: string; sub?: string | HTMLElement } = {},
): HTMLElement {
  const icon = tone === 'pass' ? '✓' : tone === 'alarm' ? '⚠' : tone === 'fail' ? '✕' : '–';
  const body = h('span', { class: 'verdict-body' }, h('span', {}, text));
  if (opts.sub) {
    body.append(
      typeof opts.sub === 'string' ? h('span', { class: 'verdict-sub' }, opts.sub) : opts.sub,
    );
  }
  return h(
    'div',
    {
      class: `verdict verdict-${tone}${opts.sub ? ' verdict-wide' : ''}`,
      role: 'status',
      'data-verdict': opts.claim,
      'data-tone': tone,
    },
    h('span', { class: 'verdict-icon', 'aria-hidden': 'true' }, icon),
    body,
  );
}

/** A scoping / caveat / danger note. */
export function note(kind: 'info' | 'danger' | 'caveat' | 'scope', ...children: Child[]): HTMLElement {
  return h('p', { class: `callout callout-${kind}` }, ...children);
}

/** Replace evidence that no longer belongs to the controls currently on screen. */
export function evidenceRetired(text: string): HTMLElement {
  return h(
    'p',
    {
      class: 'callout callout-caveat evidence-retired',
      role: 'status',
      'aria-live': 'polite',
      'data-verdict': 'retired',
    },
    text,
  );
}

/**
 * A data table inside a keyboard-reachable scroll region.
 *
 * `overflow-x: auto` without `tabindex="0"` plus a role and a label is a
 * region a keyboard reader cannot scroll (WCAG 2.1.1) and axe cannot see.
 */
export function table(
  caption: string,
  head: string[],
  rows: (string | HTMLElement)[][],
  opts: { numeric?: number[]; markRow?: number; label?: string } = {},
): HTMLElement {
  const numeric = new Set(opts.numeric ?? []);
  return h(
    'div',
    { class: 'scroll-x', role: 'region', tabindex: '0', 'aria-label': opts.label ?? caption },
    h(
      'table',
      { class: 'data' },
      h('caption', {}, caption),
      h('thead', {}, h('tr', {}, ...head.map((cell, i) => h('th', { scope: 'col', class: numeric.has(i) ? 'num' : undefined }, cell)))),
      h(
        'tbody',
        {},
        ...rows.map((row, r) =>
          h(
            'tr',
            { class: opts.markRow === r ? 'row-mark' : undefined },
            ...row.map((cell, i) =>
              h('td', { class: numeric.has(i) ? 'num' : undefined }, cell),
            ),
          ),
        ),
      ),
    ),
  );
}

/**
 * A histogram, with a text table alternative beside it.
 *
 * The plot is `role="img"` with a summary label, because a flex row of divs
 * otherwise reaches a screen reader as nothing at all; the numbers themselves
 * are in the table under the disclosure, which is the actual alternative rather
 * than a description of one.
 */
export function histogramView(
  bins: { label: string; count: number; over: boolean }[],
  opts: { summary: string; axisLow: string; axisHigh: string; thresholdNote: string },
): HTMLElement {
  const max = bins.reduce((m, b) => Math.max(m, b.count), 0) || 1;
  const plot = h(
    'div',
    { class: 'hist-plot', role: 'img', 'aria-label': opts.summary },
    ...bins.map((b) =>
      h('div', {
        class: `hist-bar${b.over ? ' over' : ''}`,
        style: `height:${Math.max(2, Math.round((b.count / max) * 100))}%`,
      }),
    ),
  );
  return h(
    'div',
    { class: 'hist' },
    plot,
    h('div', { class: 'hist-axis' }, h('span', {}, opts.axisLow), h('span', {}, opts.axisHigh)),
    h(
      'p',
      { class: 'hist-legend' },
      h('span', {}, h('span', { class: 'swatch swatch-bulk', 'aria-hidden': 'true' }), 'below the threshold — accepted'),
      h('span', {}, h('span', { class: 'swatch swatch-over', 'aria-hidden': 'true' }), opts.thresholdNote),
    ),
    h(
      'details',
      { class: 'disclosure' },
      h('summary', {}, 'The same histogram as a table'),
      h(
        'div',
        { class: 'disclosure-body' },
        table(
          'Syndrome weight distribution',
          ['Syndrome weight', 'Trials', 'Accepted?'],
          bins.map((b) => [b.label, String(b.count), b.over ? 'no' : 'yes']),
          { numeric: [1], label: 'Syndrome weight distribution as a table' },
        ),
      ),
    ),
  );
}

/**
 * A "predict before you reveal" check: one misconception, a few choices, an
 * immediate explanation. No score and no gamification; the lab is fully usable
 * whether or not it is answered.
 */
export function learnerCheck(
  question: string,
  options: { label: string; correct: boolean }[],
  explanation: string,
): HTMLElement {
  const feedback = h('div', { class: 'check-feedback', role: 'status', 'aria-live': 'polite' });
  const buttons = options.map((o) =>
    h(
      'button',
      {
        type: 'button',
        class: 'btn btn-ghost check-opt',
        onclick: () => {
          clear(feedback);
          feedback.append(
            h(
              'span',
              { class: `pill pill-${o.correct ? 'ok' : 'bad'}` },
              h('span', { 'aria-hidden': 'true' }, o.correct ? '✓ ' : '✕ '),
              o.correct ? 'Correct' : 'Not quite',
            ),
            h('p', { class: 'check-explain' }, explanation),
          );
        },
      },
      o.label,
    ),
  );
  return h(
    'details',
    { class: 'learner-check' },
    h('summary', {}, 'Quick check'),
    h(
      'div',
      { class: 'check-body' },
      h('p', { class: 'check-q' }, question),
      h('div', { class: 'controls', role: 'group', 'aria-label': question }, ...buttons),
      feedback,
    ),
  );
}

/** A list rendered with `list-style: none`, which needs its roles restored. */
export function roleList(className: string, items: HTMLElement[]): HTMLElement {
  for (const item of items) item.setAttribute('role', 'listitem');
  return h('ul', { class: className, role: 'list' }, ...items);
}

/** Group a number with thin separators, so 4055 reads as 4,055. */
export function num(value: number): string {
  return value.toLocaleString('en-US');
}

/** A fixed-decimal rate, or an em dash when there is nothing to show. */
export function rate(value: number, places = 3): string {
  return Number.isNaN(value) ? '—' : value.toFixed(places);
}

/** A percentage from a count and a denominator, with the counts kept visible. */
export function pct(count: number, total: number): string {
  if (total === 0) return '—';
  return `${((count / total) * 100).toFixed(1)}%`;
}
