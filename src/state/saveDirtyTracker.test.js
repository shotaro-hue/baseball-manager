import { describe, expect, it } from 'vitest';
import { createSaveDirtyTracker } from './saveDirtyTracker';

describe('saveDirtyTracker', () => {
  it('captures only changed IndexedDB chunks for an existing save', () => {
    const tracker = createSaveDirtyTracker();

    tracker.mark();
    tracker.mark(['news']);
    tracker.mark(['mailbox', 'news']);

    expect(tracker.snapshot().dirtyScopes).toEqual(['news', 'mailbox']);
  });

  it('requests all chunks for the first save', () => {
    const tracker = createSaveDirtyTracker();
    tracker.mark(['news']);

    expect(tracker.snapshot({ persistAll: true }).dirtyScopes).toBeNull();
  });

  it('cleans saved scopes when no newer mutation exists', () => {
    const tracker = createSaveDirtyTracker();
    tracker.mark(['seasonHistory', 'news']);
    const snapshot = tracker.snapshot();

    expect(tracker.complete(snapshot)).toEqual({
      isCurrent: true,
      dirtyScopes: [],
    });
  });

  it('preserves a scope changed while a save is running', () => {
    const tracker = createSaveDirtyTracker();
    tracker.mark(['mailbox']);
    const snapshot = tracker.snapshot();
    tracker.mark(['mailbox']);

    expect(tracker.complete(snapshot)).toEqual({
      isCurrent: false,
      dirtyScopes: ['mailbox'],
    });
  });
});
