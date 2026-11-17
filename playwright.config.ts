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
 * Port 4245 was assigned by the catalog's `node tools/port-sync.js` and is
 * pinned to this lab in committed state. Never the Vite default 4173: a shared
 * port means `reuseExistingServer` silently scans a DIFFERENT lab's preview,
 * which has really happened in this fleet.
 *
 * A COLLISION TO KNOW ABOUT, because the registry could not see it at the
 * time. `port-sync` reports the next free port by reading the labs it can
 * find and the registry it keeps, so several labs built in the same window are
 * all told the same number. On 17 November 2026 it handed 4245 here and to
 * `crypto-lab-quic-packet` — `port-sync check` reports both under TWO LABS ON
 * ONE PORT, and both under NOT IN THE REGISTRY — while
 * `crypto-lab-cold-boot` also named 4245 in its working tree, and
 * `crypto-lab-lightweight-bench` took 4246 after noticing this lab's committed
 * claim.
 *
 * `node tools/port-sync.js` in the catalog repo arbitrates and pins; until it
 * has, a run here that dies with "Port 4245 is already in use" while nothing
 * of this lab's is running is that collision rather than a flake — and worse,
 * a local run CAN reach the other lab's preview and scan its page. CI is
 * unaffected: each job gets its own container.
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
