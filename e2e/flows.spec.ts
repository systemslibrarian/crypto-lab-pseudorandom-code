/**
 * Functional flows, in four engines.
 *
 * Most of this lab is arithmetic over typed arrays and behaves identically
 * everywhere. One part does not: key generation and the trial runs happen in a
 * module Web Worker, and `new Worker(url, { type: 'module' })` is the single
 * most engine-dependent thing in the repo. A page whose worker never starts
 * renders "Generating a key…" forever and every panel stays in its waiting
 * state — which is exactly the shape an a11y scan reports as perfectly
 * accessible, so it is asserted here instead.
 */

import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // `domcontentloaded`, not the default `load`: this lab's real readiness
  // signal is the key the worker hands back, and every test below waits on
  // that. Waiting for the full load event as well only adds a second, weaker
  // condition that can time out while the page is perfectly fine.
  await page.goto('.', { waitUntil: 'domcontentloaded' });
});

test('the worker generates a key and the first exhibit renders its evidence', async ({ page }) => {
  await expect(page.locator('#key-status')).toContainText('Key ready', { timeout: 60_000 });
  await expect(page.locator('#key-status')).toContainText('verified over all 4,055 parity checks');
  await expect(page.locator('[data-verdict="pg-zero"]')).toContainText('P·G = 0 verified');
  await expect(page.locator('[data-verdict="row-sum"]')).toContainText('Equal, byte for byte');
});

test('a codeword is accepted and a random string is rejected', async ({ page }) => {
  await expect(page.locator('#key-status')).toContainText('Key ready', { timeout: 60_000 });
  await page.getByRole('tab', { name: 'Encode & detect' }).click();
  await expect(page.locator('[data-verdict="codeword-verdict"]')).toContainText('ACCEPTED');
  await expect(page.locator('[data-verdict="random-verdict"]')).toContainText('REJECTED');
});

test('the public-key distinguisher tells a codeword from noise, and says so', async ({ page }) => {
  await expect(page.locator('#key-status')).toContainText('Key ready', { timeout: 60_000 });
  await page.getByRole('tab', { name: 'The public key gives it away' }).click();
  await expect(page.locator('[data-verdict="dist-codeword-verdict"]')).toContainText('TOLD APART FROM NOISE');
  await expect(page.locator('[data-verdict="dist-random-verdict"]')).toContainText(
    'NOT DISTINGUISHED FROM NOISE',
  );
});

test('a trial run reports its counts and the number of runs they came from', async ({ page }) => {
  await expect(page.locator('#key-status')).toContainText('Key ready', { timeout: 60_000 });
  await page.getByRole('tab', { name: 'Encode & detect' }).click();
  await page.locator('#detect-run').click();
  await expect(page.locator('#detect-run')).toBeEnabled({ timeout: 120_000 });
  const caption = page.locator('#panel-detect table.data caption').last();
  await expect(caption).toContainText('Counted from 300 codewords and 300 random strings');
});

test('changing t regenerates the key and the exhibits follow', async ({ page }) => {
  await expect(page.locator('#key-status')).toContainText('Key ready', { timeout: 60_000 });
  await page.locator('#t-select').selectOption('7');
  await expect(page.locator('#key-status')).toContainText('Key ready', { timeout: 60_000 });
  await expect(page.locator('[data-stat="p-rows"]')).toContainText('4,055');
  await expect(page.locator('[data-stat="p-weight"]')).toContainText('7');
  await expect(page.locator('[data-verdict="pg-zero"]')).toContainText('P·G = 0 verified');
});
