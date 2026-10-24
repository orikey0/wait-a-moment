import { defineConfig } from '@playwright/test';

// End-to-end tests load the built extension from dist/ into a real Chromium, so run `npm run build` first.
export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results',
  timeout: 120_000,
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
});
