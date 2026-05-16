import { describe, expect, it } from 'vitest';

describe('lazy-loading entrypoints', () => {
  it('imports App without module resolution errors', async () => {
    const module = await import('./App');
    expect(typeof module.default).toBe('function');
  });

  it('imports AppScreenRouter without module resolution errors', async () => {
    const module = await import('./components/AppScreenRouter');
    expect(typeof module.default).toBe('function');
  });

  it('imports useGameState without module resolution errors', async () => {
    const module = await import('./hooks/useGameState');
    expect(typeof module.useGameState).toBe('function');
  });
});
