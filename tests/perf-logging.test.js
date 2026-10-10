import { describe, expect, it, vi } from 'vitest';
import { _resolveBattedBallOutcomeFromPhysics_TEST } from '../src/engine/simulation.js';

describe('simulation performance logging', () => {
  it('does not flood ordinary tests with per-batted-ball timing messages', () => {
    // VITE_PERF_LOG is opt-in; no blanket console stubbing is needed.
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const outcome = _resolveBattedBallOutcomeFromPhysics_TEST(
        { batting: { power: 70, contact: 55, eye: 50, speed: 50 } },
        { pitching: { velocity: 60, breaking: 60, control: 60 } },
        { lf: 100, cf: 122, rf: 100 },
        { windOut: 0 },
        {},
      );
      expect(outcome).toHaveProperty('result');
      expect(spy.mock.calls.some(([message]) => String(message).startsWith('[Perf]'))).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });
});
