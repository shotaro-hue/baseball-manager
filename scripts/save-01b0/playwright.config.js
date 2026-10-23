import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: '../../e2e', testMatch: 'save-01b0.spec.js', testIgnore: '**/characterization/**', fullyParallel: false,
  metadata: { suite: 'regression' },
  timeout: 120_000, expect: { timeout: 10_000 }, retries: 0, workers: 1,
  reporter: [['list'], ['json', { outputFile: '../../test-results/save-01b0/results.json' }]], outputDir: '../../test-results/save-01b0',
  use: { baseURL: 'http://127.0.0.1:5193', actionTimeout: 10_000, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 5193 --strictPort',
    url: 'http://127.0.0.1:5193/baseball-manager/', reuseExistingServer: !process.env.CI, timeout: 60_000 },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 },
      ...(process.env.SAVE_01B0_WEBKIT_EXECUTABLE ? { launchOptions: { executablePath: process.env.SAVE_01B0_WEBKIT_EXECUTABLE } } : {}) } },
  ],
});
