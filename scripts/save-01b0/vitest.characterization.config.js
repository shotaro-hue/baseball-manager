// Explicit historical evidence suite; no skips or weakened assertions.
import { defineConfig, configDefaults } from 'vitest/config';
import base from '../../vitest.config.js';
export default defineConfig({
  ...base,
  test: { ...base.test, include: ['tests/characterization/**/*.test.js'], exclude: configDefaults.exclude,
    maxWorkers: 1, minWorkers: 1, reporters: ['default', 'json'],
    outputFile: 'test-results/save-01b0-characterization/unit.json' },
});
