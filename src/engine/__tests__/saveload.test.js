import { describe, expect, it, vi } from 'vitest';
import { createSaveRequestQueue } from '../saveload';

describe('createSaveRequestQueue', () => {
  it('coalesces overlapping save requests into one trailing run', async () => {
    const calls = [];
    let resolveFirst;
    const saveImpl = vi.fn((payload) => {
      calls.push(payload);
      if (payload.id === 1) {
        return new Promise((resolve) => {
          resolveFirst = () => resolve({ ok: true, payload });
        });
      }
      return Promise.resolve({ ok: true, payload });
    });

    const queue = createSaveRequestQueue(saveImpl);
    const firstPromise = queue.enqueue({ id: 1 });
    const secondPromise = queue.enqueue({ id: 2 });
    const thirdPromise = queue.enqueue({ id: 3 });

    expect(saveImpl).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([{ id: 1 }]);

    resolveFirst();
    await firstPromise;
    await secondPromise;
    const finalResult = await thirdPromise;

    expect(saveImpl).toHaveBeenCalledTimes(2);
    expect(calls).toEqual([{ id: 1 }, { id: 3 }]);
    expect(finalResult.payload).toEqual({ id: 3 });
  });

  it('exposes pending state while a save is running or queued', async () => {
    let release;
    let callCount = 0;
    const queue = createSaveRequestQueue(() => {
      callCount += 1;
      if (callCount === 1) {
        return new Promise((resolve) => {
          release = () => resolve({ ok: true });
        });
      }
      return Promise.resolve({ ok: true });
    });

    const first = queue.enqueue({ id: 1 });
    const second = queue.enqueue({ id: 2 });

    expect(queue.getSnapshot()).toEqual({
      isSaving: true,
      hasQueuedSave: true,
    });

    release();
    await first;
    await second;

    expect(queue.getSnapshot()).toEqual({
      isSaving: false,
      hasQueuedSave: false,
    });
  });
});
