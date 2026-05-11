import { describe, expect, it } from 'vitest';
import { createSeasonBatchProgressState, shouldEmitSeasonBatchProgress } from '../seasonBatchCore';

describe('season batch progress throttling', () => {
  it('emits immediately on first update and then throttles by time', () => {
    const state = createSeasonBatchProgressState(250);

    expect(shouldEmitSeasonBatchProgress(state, 0)).toBe(true);
    expect(shouldEmitSeasonBatchProgress(state, 100)).toBe(false);
    expect(shouldEmitSeasonBatchProgress(state, 251)).toBe(true);
  });

  it('always emits on completion even inside the throttle window', () => {
    const state = createSeasonBatchProgressState(250);

    shouldEmitSeasonBatchProgress(state, 0);

    expect(shouldEmitSeasonBatchProgress(state, 120, { force: true })).toBe(true);
  });
});
