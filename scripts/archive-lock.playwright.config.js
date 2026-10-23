import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '../e2e', testMatch: 'archive-lock.spec.js', fullyParallel: false,
  timeout: 30_000, expect: { timeout: 5000 }, retries: 0, workers: 1,
  reporter: [['list'], ['json', { outputFile: 'test-results/archive-lock/results.json' }]],
  outputDir: '../test-results/archive-lock',
  use: { baseURL: 'http://127.0.0.1:5194', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 5194 --strictPort',
    url: 'http://127.0.0.1:5194/baseball-manager/', reuseExistingServer: !process.env.CI, timeout: 60_000 },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 13'],
      ...(process.env.ARCHIVE_LOCK_WEBKIT_EXECUTABLE ? { launchOptions: { executablePath: process.env.ARCHIVE_LOCK_WEBKIT_EXECUTABLE } } : {}) } },
  ],
});
