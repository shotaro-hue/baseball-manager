import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  // Playwrightはe2eフォルダだけを見る
  testDir: './e2e',
  testMatch: '**/*.spec.js',
  testIgnore: '**/characterization/**', // explicit advisory suite owns historical unsafe observations

  timeout: 30_000,

  expect: {
    timeout: 5_000,
  },

  fullyParallel: false,

  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,

  reporter: [
    ['list'],
    ['html', { open: 'never' }],
  ],

  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  webServer: {
    command: 'npm run dev -- --host 127.0.0.1',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'mobile-webkit',
      testMatch: ['**/progression.smoke.spec.js', '**/finance.spec.js', '**/save-generations.spec.js', '**/career-generations.spec.js', '**/hub-navigation.spec.js', '**/management-decisions.spec.js', '**/management-lists.spec.js', '**/core-reliability.spec.js', '**/offseason-save-feedback.spec.js', '**/offseason-save-progression.spec.js', '**/save-capacity.spec.js', '**/save-capacity-ui.spec.js', '**/archive-lock.spec.js'],
      grep: /E1 new game|finance|save generations|career generations|hub navigation|management decisions|management lists|core reliability|offseason save|save capacity|archive lock/,
      use: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } },
    },
  ],
});
