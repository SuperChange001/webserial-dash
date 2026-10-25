import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://localhost:4173',
    // Locally: reuse the installed Google Chrome (no download). CI: Playwright's bundled Chromium.
    // Override with PW_CHANNEL=chromium|chrome|msedge.
    channel: process.env.PW_CHANNEL || (process.env.CI ? undefined : 'chrome'),
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
