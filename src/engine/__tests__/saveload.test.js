import { describe, expect, it, vi } from 'vitest';
import { createSaveRequestQueue } from '../saveload';

describe('createSaveRequestQueue', () => {
  it('keeps protected requests in FIFO order between coalesced normal saves', async () => {
    let release;
    const written = [];
    const queue = createSaveRequestQueue(async payload => {
      if (payload === 'active') await new Promise(resolve => { release = resolve; });
      written.push(payload);
      return { ok: true, written: payload };
    });
    const active = queue.enqueue('active');
    const normal1 = queue.enqueue('normal1'), normal2 = queue.enqueue('normal2');
    const economic = queue.enqueue('economic', { coalesce: false });
    const economic2 = queue.enqueue('economic2', { coalesce: false });
    const normal3 = queue.enqueue('normal3'), normal4 = queue.enqueue('normal4');
    release();
    const results = await Promise.all([active, normal1, normal2, economic, economic2, normal3, normal4]);
    expect(written).toEqual(['active', 'normal2', 'economic', 'economic2', 'normal4']);
    expect(results.map(r => r.written)).toEqual(['active', 'normal2', 'normal2', 'economic', 'economic2', 'normal4', 'normal4']);
    expect(queue.getSnapshot()).toEqual({ isSaving: false, hasQueuedSave: false });
  });

  it.each(['returned failure', 'thrown failure'])('does not return a later success for a protected %s', async kind => {
    let release;
    const queue = createSaveRequestQueue(async payload => {
      if (payload === 'active') await new Promise(resolve => { release = resolve; });
      if (payload === 'economic') {
        if (kind === 'thrown failure') throw new Error('economic failure');
        return { ok: false, reason: 'economic failure' };
      }
      return { ok: true, written: payload };
    });
    const active = queue.enqueue('active');
    const economic = queue.enqueue('economic', { coalesce: false });
    const checked = kind === 'thrown failure' ? expect(economic).rejects.toThrow('economic failure')
      : expect(economic).resolves.toEqual({ ok: false, reason: 'economic failure' });
    const normal = queue.enqueue('normal');
    release(); await active; await checked;
    expect(await normal).toEqual({ ok: true, written: 'normal' });
  });

  it('does not carry failed or coalesced options across a protected request', async () => {
    let release;
    const written = [];
    const queue = createSaveRequestQueue(async payload => {
      written.push(payload);
      if (payload.id === 'active') {
        await new Promise(resolve => { release = resolve; });
        return { ok: false };
      }
      return { ok: true };
    });
    const active = queue.enqueue({ id: 'active', state: { saveId: 's' }, options: { dirtyScopes: ['news'], careerEntries: [{ playerId: 1 }] } });
    const payload = { id: 'economic', state: { saveId: 's' }, options: { dirtyScopes: ['mailbox'] } };
    const economic = queue.enqueue(payload, { coalesce: false });
    const trailing = { id: 'normal', state: { saveId: 's' }, options: { dirtyScopes: [] } };
    const normal = queue.enqueue(trailing);
    release(); await Promise.all([active, economic, normal]);
    expect(written.slice(1)).toEqual([payload, trailing]);
    expect(payload.options).toEqual({ dirtyScopes: ['mailbox'] });
  });

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
