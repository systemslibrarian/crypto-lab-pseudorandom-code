import { expect, test } from '@playwright/test';
import {
  boot,
  driveAllStates,
  expectBaselineNotStale,
  NARROW,
  reportCollected,
  watchPageErrors,
} from './gate';

/**
 * WCAG A/AA regression gate.
 *
 * The lab is driven along everything it teaches: the arrival state, where
 * exhibit 1 has a key the worker has already verified and the other five
 * tabpanels are hidden and UNRENDERED; the shared skip link focused; each
 * exhibit's quick check opened and answered wrong and then right; a codeword
 * and a random string drawn and judged; 300-trial runs in three different
 * exhibits; the robustness histogram and its table alternative; the slider
 * raised until most codewords stop decoding; the retirement notice that only
 * paints after a measured result has been invalidated; the negative-claim
 * state, where every check on screen reports success and the public key tells
 * the strings apart anyway; the corner at n = 8192, t = 8 where the
 * distinguisher declines to claim anything at all; both tables of the
 * "Choosing t" exhibit; the same-key notice after η changes; two hover states;
 * three focus rings. Every one of those states is scanned, at desktop and
 * phone width.
 *
 * See `gate.ts` for why nothing is injected into the page (the retired fleet
 * gate's `addStyleTag` motion kill bypassed the stylesheet's own
 * reduced-motion block, so the rendering reduced-motion readers get was never
 * the one scanned), why no panel is revealed from script (that gate stripped
 * every `[hidden]` and opened every `<details>` by JS before its only scan),
 * why nothing here waits on a duration (this lab computes in a worker, and a
 * fixed timeout is the scan race that lets axe pass having checked an empty
 * container), and why `violations` is not the whole oracle.
 */

for (const theme of ['dark'] as const) {
  test(`no WCAG A/AA violations in ${theme} theme`, async ({ page }) => {
    test.setTimeout(1_800_000);
    const errors = watchPageErrors(page);
    await boot(page, theme);
    await driveAllStates(page, theme);
    expect(errors, errors.join('\n')).toEqual([]);
    expectBaselineNotStale();
    reportCollected();
  });

  test(`no WCAG A/AA violations in ${theme} theme at 380px`, async ({ page }) => {
    test.setTimeout(1_800_000);
    const errors = watchPageErrors(page);
    await page.setViewportSize(NARROW);
    await boot(page, theme);
    await driveAllStates(page, `${theme} @380px`);
    expect(errors, errors.join('\n')).toEqual([]);
    expectBaselineNotStale();
    reportCollected();
  });
}
