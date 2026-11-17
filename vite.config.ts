import { defineConfig, configDefaults } from 'vitest/config';

// base must match the GitHub Pages project subpath:
// https://systemslibrarian.github.io/crypto-lab-pseudorandom-code/
export default defineConfig({
  base: '/crypto-lab-pseudorandom-code/',
  worker: { format: 'es' },
  test: {
    // Colocated unit tests only; keep Playwright specs in e2e/ out of the Vitest run.
    include: ['src/**/*.test.ts'],
    exclude: [...configDefaults.exclude, 'e2e/**'],
    // The rate suites (acceptance over 300+ trials, 300 keys of weak-key
    // sampling) are real computation, not fixtures, and they are the slowest
    // honest thing in this repo. Measured at ~90s for the whole run.
    testTimeout: 600_000,
  },
});
