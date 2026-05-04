import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',

    // Vitestはユニット/統合テストだけを実行する
    include: [
      'src/**/*.test.js',
      'scripts/**/*.test.js',
    ],

    // PlaywrightのE2Eテストは絶対にVitestで拾わない
    exclude: [
      ...configDefaults.exclude,
      'e2e/**',
      'playwright.config.*',
      'node_modules/**',
      'dist/**',
      'coverage/**',
    ],

    // Monte Carlo系で5秒timeoutしないように少し広げる
    testTimeout: 10000,
  },
});