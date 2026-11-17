import { expect, test, type Page } from '@playwright/test';
import { boot } from './gate';

/**
 * The claims suite: what this lab's interface SAYS, as opposed to what it is
 * shaped like. §4.1b and §4.1d of audits/_MASTER-TEMPLATE.md.
 *
 * Copy assertions live HERE and never in `gate.ts`'s `boot()`, the shared
 * setup every a11y test imports. A one-word copy edit there fails every test
 * in the accessibility gate at once, and the step that goes red is named
 * "Accessibility gate" — a report naming the wrong subject.
 * crypto-lab-mceliece-gate lost three days of corrected security claims to
 * exactly that on 2026-09-26.
 *
 * THE RULE THAT MAKES THESE WORTH ANYTHING. A test that re-derives the same
 * expression the source uses will happily agree with a bug. So the numbers
 * below are RE-DERIVED BY A DIFFERENT ROUTE from the arrays the page rendered
 * from, which `src/ui/testHook.ts` publishes on `window` for this purpose:
 *
 *   - the syndrome weight, by building a DENSE n-bit mask for each parity
 *     check and ANDing it against x ⊕ z, where the source reads t bit indices
 *     per check and never materialises a row;
 *   - the comparison count, by SORTING the rows of G and counting adjacent
 *     duplicates, where the source hashes them into a Map;
 *   - the weak-key probability, by a DIRECT product of (1 − i/N), where the
 *     source sums log1p terms in log space precisely because that product
 *     underflows for most of the table.
 *
 * And the exhibit-5 re-derivations use `window.__prcPublicKey` ALONE. That is
 * invariant 2 — "the distinguisher is given (G, z) and the string only" —
 * asserted at the rendered surface as well as at the function signature: if
 * the panel had quietly consulted P, the public-key-only recomputation would
 * stop matching what it printed.
 */

const NEGATIVE_CLAIM =
  'Passing the randomness checks on this page says nothing about whether these strings can be told ' +
  'from noise: for this key, anyone holding the public key can tell, without the secret.';

/** Parse the first number out of a rendered string, commas and all. */
function parseNum(text: string | null): number {
  const match = (text ?? '').replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  expect(match, `expected a number in ${JSON.stringify(text)}`).not.toBeNull();
  return Number(match![0]);
}

/**
 * wt(P·(x ⊕ z)), recomputed from the published key by the dense route.
 *
 * `src/prc/code.ts` reads the t stored column indices of each check and XORs
 * those bits. This builds the row of P that those indices DESCRIBE — a full
 * n-bit mask — ANDs it with x ⊕ z word by word, and takes the parity of the
 * result. Same answer, by a computation with no index loop in it, so a bug in
 * the index loop cannot be reproduced here.
 */
async function denseSyndromeWeight(page: Page, which: 'codeword' | 'random'): Promise<number> {
  return page.evaluate((key) => {
    const sk = window.__prcSecretKey!;
    const x = window.__prcStrings![key]!;
    const words = (sk.n + 31) >>> 5;
    const y = new Uint32Array(words);
    for (let w = 0; w < words; w++) y[w] = x[w] ^ sk.z[w];
    const mask = new Uint32Array(words);
    const popParity = (v: number): number => {
      let u = v;
      u ^= u >>> 16;
      u ^= u >>> 8;
      u ^= u >>> 4;
      u ^= u >>> 2;
      u ^= u >>> 1;
      return u & 1;
    };
    let unsatisfied = 0;
    for (let i = 0; i < sk.r; i++) {
      mask.fill(0);
      for (let a = 0; a < sk.t; a++) {
        const col = sk.P[i * sk.t + a];
        mask[col >>> 5] |= 1 << (col & 31);
      }
      let bit = 0;
      for (let w = 0; w < words; w++) bit ^= popParity(mask[w] & y[w]);
      unsatisfied += bit & 1;
    }
    return unsatisfied;
  }, which);
}

/**
 * The comparison count and the agreement fraction, from the PUBLIC key alone.
 *
 * `src/prc/weak.ts` groups the rows of G through a `Map` keyed on their words.
 * This sorts the row indices by row value and counts adjacent duplicates — a
 * different algorithm reaching the same partition — then counts agreements
 * exactly as the attack defines them: every member of a group against the
 * group's first member, on x ⊕ z.
 */
async function publicKeyAttack(
  page: Page,
  which: 'codeword' | 'random',
): Promise<{ comparisons: number; agreeing: number; agreement: number; groups: number }> {
  return page.evaluate((key) => {
    const pk = window.__prcPublicKey!;
    const x = window.__prcStrings![key]!;
    const rows = Array.from({ length: pk.n }, (_, i) => i);
    const valueOf = (row: number): string => {
      let s = '';
      for (let w = 0; w < pk.wordsPerRow; w++) s += (w ? ',' : '') + pk.G[row * pk.wordsPerRow + w];
      return s;
    };
    rows.sort((a, b) => (valueOf(a) < valueOf(b) ? -1 : valueOf(a) > valueOf(b) ? 1 : a - b));

    const bit = (v: Uint32Array, i: number): number => (v[i >>> 5] >>> (i & 31)) & 1;
    let comparisons = 0;
    let agreeing = 0;
    let groups = 0;
    let i = 0;
    while (i < rows.length) {
      let j = i + 1;
      while (j < rows.length && valueOf(rows[j]) === valueOf(rows[i])) j++;
      if (j - i >= 2) {
        groups++;
        const anchor = rows[i];
        const ya = bit(x, anchor) ^ bit(pk.z, anchor);
        for (let m = i + 1; m < j; m++) {
          comparisons++;
          const yb = bit(x, rows[m]) ^ bit(pk.z, rows[m]);
          if (ya === yb) agreeing++;
        }
      }
      i = j;
    }
    return { comparisons, agreeing, agreement: comparisons === 0 ? Number.NaN : agreeing / comparisons, groups };
  }, which);
}

/** 1 − ∏(1 − i/N) by a DIRECT product, where the source sums log1p terms. */
function weakKeyProbabilityDirect(k: number, r: number, t: number): number {
  let n = 1;
  const j = Math.min(t - 1, k - (t - 1));
  for (let i = 0; i < j; i++) n = (n * (k - i)) / (i + 1);
  const N = Math.round(n);
  if (r > N) return 1;
  let product = 1;
  for (let i = 0; i < r; i++) product *= 1 - i / N;
  return 1 - product;
}

test.describe('displayed claims', () => {
  test('the syndrome weight on screen is the one a dense recomputation gives', async ({ page }) => {
    await boot(page, 'dark');
    await page.getByRole('tab', { name: 'Encode & detect' }).click();

    for (const which of ['codeword', 'random'] as const) {
      const shown = parseNum(await page.locator(`[data-stat="${which}-weight"]`).textContent());
      const recomputed = await denseSyndromeWeight(page, which);
      expect(shown, `${which}: the page printed ${shown}, the dense route gives ${recomputed}`).toBe(
        recomputed,
      );
    }

    // The hex preview on screen really is the string that was judged.
    const previewed = (await page.locator('#panel-detect .field-value').first().textContent()) ?? '';
    const actual = await page.evaluate(() => {
      const x = window.__prcStrings!.codeword!;
      let s = '';
      for (let i = 0; i < 24; i++) s += (((x[i >>> 2] >>> ((i & 3) * 8)) & 0xff) + 0x100).toString(16).slice(1);
      return s;
    });
    expect(previewed.replace('…', '')).toBe(actual);
  });

  test('"accepted" appears exactly when the weight is below the threshold on screen', async ({ page }) => {
    await boot(page, 'dark');
    await page.getByRole('tab', { name: 'Encode & detect' }).click();

    for (const which of ['codeword', 'random'] as const) {
      const weight = parseNum(await page.locator(`[data-stat="${which}-weight"]`).textContent());
      const threshold = parseNum(await page.locator(`[data-stat="${which}-threshold"]`).textContent());
      const verdictText = (await page.locator(`[data-verdict="${which}-verdict"]`).textContent()) ?? '';
      const saysAccepted = /ACCEPTED/.test(verdictText);
      expect(
        saysAccepted,
        `${which}: weight ${weight} against threshold ${threshold}, page said ${JSON.stringify(verdictText)}`,
      ).toBe(weight < threshold);
    }

    // The threshold the verdict used is the SAME number the key bar prints and
    // the same number the decision table prints: three surfaces, one value.
    const inKeyBar = parseNum(await page.locator('[data-stat="bar-threshold"]').textContent());
    const inCard = parseNum(await page.locator('[data-stat="codeword-threshold"]').textContent());
    const inTable = parseNum(
      await page.locator('#panel-detect table.data tbody tr').first().locator('td').nth(3).textContent(),
    );
    expect(inCard).toBe(inKeyBar);
    expect(inTable).toBe(inKeyBar);

    // And it is (1/2 − r^(−1/4))·r for the r the page itself prints.
    const r = parseNum(await page.locator('[data-stat="bar-r"]').textContent());
    expect(inKeyBar).toBeCloseTo((0.5 - Math.pow(r, -0.25)) * r, 1);
  });

  test('the comparison count shown is the one grouping the rendered G gives', async ({ page }) => {
    await boot(page, 'dark');
    await page.getByRole('tab', { name: 'The public key gives it away' }).click();

    const derived = await publicKeyAttack(page, 'codeword');
    expect(parseNum(await page.locator('[data-stat="comparisons"]').textContent())).toBe(derived.comparisons);
    expect(parseNum(await page.locator('[data-stat="groups"]').textContent())).toBe(derived.groups);
    expect(parseNum(await page.locator('[data-stat="dist-codeword-comparisons"]').textContent())).toBe(
      derived.comparisons,
    );
    // Distinct rows plus the comparisons account for every row of G: a group
    // of m rows is one distinct value and m − 1 comparisons.
    const distinct = parseNum(await page.locator('[data-stat="distinct-rows"]').textContent());
    const n = parseNum(await page.locator('[data-stat="bar-n"]').textContent());
    expect(distinct + derived.comparisons).toBe(n);
  });

  test('the agreement fraction shown is the test’s own count, for both strings', async ({ page }) => {
    await boot(page, 'dark');
    await page.getByRole('tab', { name: 'The public key gives it away' }).click();

    for (const which of ['codeword', 'random'] as const) {
      const derived = await publicKeyAttack(page, which);
      const marker = which === 'codeword' ? 'dist-codeword' : 'dist-random';
      expect(parseNum(await page.locator(`[data-stat="${marker}-agreed"]`).textContent())).toBe(
        derived.agreeing,
      );
      const shown = parseNum(await page.locator(`[data-stat="${marker}-agreement"]`).textContent());
      expect(shown).toBeCloseTo(derived.agreement, 4);
    }
  });

  test('the weak-key probability shown is the formula for the n and t on screen', async ({ page }) => {
    await boot(page, 'dark');
    await page.getByRole('tab', { name: 'The public key gives it away' }).click();

    for (const [n, t, expected] of [
      [8192, 8, 0.0086],
      [8192, 7, 0.0896],
      [8192, 6, 0.7004],
      [4096, 8, 0.3062],
      [4096, 7, 0.8394],
    ] as [number, number, number][]) {
      await page.locator('#n-select').selectOption(String(n));
      await expect(page.locator('#key-status')).toContainText('Key ready', { timeout: 120_000 });
      await page.locator('#t-select').selectOption(String(t));
      await expect(page.locator('#key-status')).toContainText('Key ready', { timeout: 120_000 });

      const r = Math.floor(0.99 * n);
      const k = n - r;
      const shown = parseNum(await page.locator('[data-stat="p-weak-here"]').textContent());
      // Both routes, and the brief's independently computed value.
      expect(shown, `n = ${n}, t = ${t}`).toBeCloseTo(weakKeyProbabilityDirect(k, r, t), 4);
      expect(shown, `n = ${n}, t = ${t}`).toBeCloseTo(expected, 4);
    }
  });

  test('the "Choosing t" table is the same formula, row by row', async ({ page }) => {
    await boot(page, 'dark');
    await page.getByRole('tab', { name: 'Choosing t' }).click();

    const rows = page.locator('#panel-choose table.data').first().locator('tbody tr');
    await expect(rows).toHaveCount(6);
    for (let i = 0; i < 6; i++) {
      const cells = rows.nth(i).locator('td');
      const t = parseNum(await cells.nth(0).textContent());
      const shown = parseNum(await cells.nth(2).textContent());
      expect(shown, `t = ${t}`).toBeCloseTo(weakKeyProbabilityDirect(41, 4055, t), 4);
    }
    // The highlighted row is the configuration in play.
    await expect(page.locator('#panel-choose tr.row-mark')).toHaveCount(1);
    await expect(page.locator('#panel-choose tr.row-mark td').first()).toHaveText('3');
  });

  test('a measured result is retired when the key changes, and the page says so', async ({ page }) => {
    await boot(page, 'dark');
    await page.getByRole('tab', { name: 'Encode & detect' }).click();
    await page.locator('#detect-run').click();
    await expect(page.locator('#detect-run')).toBeEnabled({ timeout: 120_000 });
    await expect(page.locator('#panel-detect [data-claim="trial-prediction"]')).toBeVisible();

    await page.locator('#generate-key').click();
    await expect(page.locator('#key-status')).toContainText('Key ready', { timeout: 120_000 });
    await expect(page.locator('#panel-detect [data-verdict="retired"]')).toContainText('retired');
    await expect(page.locator('#panel-detect [data-claim="trial-prediction"]')).toHaveCount(0);
  });

  test('a measured result is retired when η changes, even though the key does not', async ({ page }) => {
    await boot(page, 'dark');
    await page.getByRole('tab', { name: 'Encode & detect' }).click();
    await page.locator('#detect-run').click();
    await expect(page.locator('#detect-run')).toBeEnabled({ timeout: 120_000 });

    await page.locator('#eta-range').fill('12');
    await page.locator('#eta-range').dispatchEvent('change');
    await expect(page.locator('#key-status')).toContainText('unchanged', { timeout: 120_000 });
    // Both halves: the key really is the same object, AND the counts measured
    // at the old rate are gone.
    await expect(page.locator('#key-status')).toContainText('η is an encoder parameter, not key material');
    await expect(page.locator('#panel-detect [data-verdict="retired"]')).toBeVisible();
  });

  test('the no-op guard: re-selecting the same value keeps a fresh result', async ({ page }) => {
    await boot(page, 'dark');
    await page.getByRole('tab', { name: 'Encode & detect' }).click();
    await page.locator('#detect-run').click();
    await expect(page.locator('#detect-run')).toBeEnabled({ timeout: 120_000 });
    const before = await page.locator('[data-stat="codeword-weight"]').textContent();

    // Re-select the values already in play. A native select fires no `change`
    // for an unchanged value but a DRIVEN one does, so this really exercises
    // the guard in keyBar.ts rather than the browser's own behaviour.
    await page.locator('#n-select').selectOption('4096');
    await page.locator('#t-select').selectOption('3');
    await page.locator('#eta-range').fill('5');
    await page.locator('#eta-range').dispatchEvent('change');

    await expect(page.locator('#panel-detect [data-verdict="retired"]')).toHaveCount(0);
    await expect(page.locator('#panel-detect [data-claim="trial-prediction"]')).toBeVisible();
    expect(await page.locator('[data-stat="codeword-weight"]').textContent()).toBe(before);
  });

  test('the [hidden] probe: a hidden panel really paints nothing', async ({ page }) => {
    await boot(page, 'dark');
    // The trap this catches: a class rule setting `display` outranks the UA's
    // `[hidden]` rule, so the element paints while the code believes it is
    // hidden — and a gate that force-reveals panels from script can never see
    // it. Asked of the browser, not of the attribute.
    const painting = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[hidden]'))
        .filter((el) => (el as HTMLElement).checkVisibility?.({ checkVisibilityCSS: true }))
        .map((el) => `${el.tagName.toLowerCase()}#${el.id}`),
    );
    expect(painting, 'elements marked [hidden] that still paint').toEqual([]);
    // And the attribute is really on the five panels that ship closed.
    await expect(page.locator('main section[hidden]')).toHaveCount(5);
  });
});

/**
 * §4.1d — the NEGATIVE CLAIM.
 *
 * Claim, scoped to the key on the page: "Passing the randomness checks on this
 * page says nothing about whether these strings can be told from noise: for
 * this key, anyone holding the public key can tell, without the secret."
 *
 * The evidence fixture is exhibit 5 on a (4096, t = 3) key at η = 0.05 — the
 * shipped defaults, so a reader meets it without hunting for it. Three
 * assertions, as §4.1d specifies: reach the fixture through the UI; every
 * check the page performs in that state reports success, asserted against the
 * RENDERED results rather than a flag the test sets; and the limitation is
 * visible on screen in that state, not in the README and not behind a
 * disclosure.
 */
test.describe('the negative claim', () => {
  test('every check reports success and the public key tells the strings apart anyway', async ({ page }) => {
    // 1. Reach the fixture, through the controls a reader uses.
    await boot(page, 'dark');
    await expect(page.locator('#n-select')).toHaveValue('4096');
    await expect(page.locator('#t-select')).toHaveValue('3');
    await expect(page.locator('#eta-range')).toHaveValue('5');

    // 2a. Exhibit 4's checks both read unremarkable, on both strings.
    await page.getByRole('tab', { name: 'Does it look random?' }).click();
    await expect(page.locator('[data-verdict="randomness-verdict"]')).toContainText('UNREMARKABLE');
    const readings = await page
      .locator('#panel-randomness .test-results table.data tbody tr td:last-child')
      .allTextContents();
    expect(readings).toHaveLength(4);
    expect(readings.every((r) => r.trim() === 'unremarkable'), readings.join(' | ')).toBe(true);

    // 2b. The secret-key detector accepts the codeword.
    await page.getByRole('tab', { name: 'Encode & detect' }).click();
    await expect(page.locator('[data-verdict="codeword-verdict"]')).toContainText('ACCEPTED');

    // 2c. And in exhibit 5's own state, every check it performs on its own
    //     codeword reports success — read out of the rendered table.
    await page.getByRole('tab', { name: 'The public key gives it away' }).click();
    const checks = page.locator('#panel-weak .all-checks table.data tbody tr');
    await expect(checks).toHaveCount(4);
    await expect(checks.nth(0).locator('td').last()).toContainText('unremarkable');
    await expect(checks.nth(1).locator('td').last()).toContainText('unremarkable');
    await expect(checks.nth(2).locator('td').last()).toContainText('accepted');

    // 3. The limitation is ON SCREEN in that state, with the comparison count.
    const verdict = page.locator('[data-verdict="negative-claim"]');
    await expect(verdict).toBeVisible();
    await expect(verdict).toContainText('LOOKS RANDOM TO THE TESTS — AND THE PUBLIC KEY TELLS THEM APART');
    await expect(verdict).toContainText(NEGATIVE_CLAIM);
    const comparisons = parseNum(await page.locator('[data-stat="comparisons"]').textContent());
    await expect(verdict).toContainText(`${comparisons.toLocaleString('en-US')} comparisons`);
    expect(comparisons).toBeGreaterThan(30);
  });

  test('the bite: a uniformly random string on the same key is NOT distinguished', async ({ page }) => {
    // The fixture that makes the verdict a measurement rather than a label. If
    // the distinguisher set its verdict from the mere EXISTENCE of comparisons
    // — mutation (7) of the build brief — this is the state that would wrongly
    // read "told apart": the comparisons are there, in their thousands, and
    // the agreement is near one half.
    await boot(page, 'dark');
    await page.getByRole('tab', { name: 'The public key gives it away' }).click();

    const derived = await publicKeyAttack(page, 'random');
    expect(derived.comparisons, 'the comparisons must exist for this fixture to bite').toBeGreaterThan(30);
    expect(derived.agreement).toBeGreaterThan(0.45);
    expect(derived.agreement).toBeLessThan(0.55);

    await expect(page.locator('[data-verdict="dist-random-verdict"]')).toContainText(
      'NOT DISTINGUISHED FROM NOISE',
    );
    await expect(page.locator('[data-stat="dist-random-comparisons"]')).toHaveText(
      derived.comparisons.toLocaleString('en-US'),
    );
  });

  test('the scoping notes and the not-built list are on the page, not only in the README', async ({ page }) => {
    await boot(page, 'dark');
    await page.getByRole('tab', { name: 'The public key gives it away' }).click();
    await expect(page.locator('#panel-weak .callout-scope')).toContainText(
      'This exhibit uses the public key only.',
    );

    await page.getByRole('tab', { name: 'Choosing t' }).click();
    const items = page.locator('#panel-choose .not-built li');
    await expect(items).toHaveCount(7);
    await expect(items.nth(0)).toContainText('Attack-I');
    await expect(items.nth(1)).toContainText('Attack-III');
    await expect(items.nth(2)).toContainText('defences');
    await expect(items.nth(3)).toContainText('language model or image model');
    await expect(items.nth(4)).toContainText('Multi-bit messages and deletion robustness');
    await expect(items.nth(5)).toContainText('avoiding repeated rows makes an instance secure');
    await expect(items.nth(6)).toContainText('deployed watermark');
  });
});
