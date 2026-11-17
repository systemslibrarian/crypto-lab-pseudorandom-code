import { defineConfig, devices } from '@playwright/test';

/**
 * E2E runs against the production build served by `vite preview`, so what
 * passes here is what ships. Three kinds of spec:
 *   - a11y.spec.ts    — the axe WCAG gate, Chromium only (a deterministic gate).
 *   - claims.spec.ts  — what the page SAYS, re-derived from what it rendered from.
 *   - flows.spec.ts   — role-based scenarios across Chromium, Firefox, WebKit and
 *     a phone viewport. This lab runs its key generation and trials in a module
 *     Web Worker, which is the one part of it that can differ by engine.
 *
 * Port 4245 was assigned by the catalog's tools/port-sync.js and is unique to
 * this lab across the fleet. Never the Vite default 4173: a shared port means
 * `reuseExistingServer` silently scans a DIFFERENT lab's preview.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // Key generation at n = 8192 plus a 300-trial run, repeated across every
  // driven state, is real computation rather than a fixture.
  timeout: 180_000,
  forbidOnly: !!process.env.CI,
  // Capped on CI. Six projects at full parallelism put six browsers through
  // real key generation and 300-trial runs at once; on a two-core runner that
  // is not a flake, it is CPU starvation, and it showed up as a 180s
  // `page.goto` timeout in Firefox while the same test passed in 15s alone.
  workers: process.env.CI ? 2 : undefined,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'list' : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4245/crypto-lab-pseudorandom-code/',
  },
  projects: [
    {
      name: 'a11y',
      testMatch: /a11y\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], colorScheme: 'dark' },
    },
    // Claims run in one engine: they assert what the page says, which does not
    // vary by browser, unlike the flows suite below.
    { name: 'claims', testMatch: /claims\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
    { name: 'flows-chromium', testMatch: /flows\.spec\.ts/, use: { ...devices['Desktop Chrome'] } },
    { name: 'flows-firefox', testMatch: /flows\.spec\.ts/, use: { ...devices['Desktop Firefox'] } },
    { name: 'flows-webkit', testMatch: /flows\.spec\.ts/, use: { ...devices['Desktop Safari'] } },
    { name: 'flows-mobile', testMatch: /flows\.spec\.ts/, use: { ...devices['Pixel 5'] } },
  ],
  webServer: {
    // Build before serving: `vite preview` only serves whatever is already in
    // dist/, so without this a failing build leaves the previous good bundle in
    // place and the suite passes green against source that no longer compiles.
    command: 'npm run build && npm run preview -- --port 4245 --strictPort',
    url: 'http://localhost:4245/crypto-lab-pseudorandom-code/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
