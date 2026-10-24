import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: '../e2e', testMatch: 'archive-retention.spec.js', fullyParallel: false,
  timeout: 60_000, expect: { timeout: 5000 }, retries: 0, workers: 1,
  reporter: [['list'], ['json', { outputFile: '../test-results/archive-retention/results.json' }]],
  outputDir: '../test-results/archive-retention',
  use: { baseURL: 'http://127.0.0.1:5199', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 5199 --strictPort',
    url: 'http://127.0.0.1:5199/baseball-manager/', reuseExistingServer: !process.env.CI, timeout: 60_000 },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 13'],
      ...(process.env.RECEIPTS_WEBKIT_EXECUTABLE ? { launchOptions: { executablePath: process.env.RECEIPTS_WEBKIT_EXECUTABLE } } : {}) } },
  ],
});
