// Reuses the real browsers/strict settings, but writes an independent report.
import { defineConfig } from '@playwright/test';
import base from './playwright.config.js';
export default defineConfig({
  ...base, testMatch: '**/characterization/save-01b0.spec.js', testIgnore: [],
  metadata: { suite: 'characterization' },
  reporter: [['list'], ['json', { outputFile: '../../test-results/save-01b0-characterization/browser.json' }]],
  outputDir: '../../test-results/save-01b0-characterization/browser',
});
