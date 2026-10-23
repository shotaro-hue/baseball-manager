import { test, expect } from '@playwright/test';

const LOCK = 'baseball-manager-archive';
const URL = '/baseball-manager/scripts/save-01b0/';
const ARCHIVE = '/baseball-manager/src/engine/battedBallArchive.js';

async function snapshot(page) {
  return page.evaluate(async () => {
    const { openBaseballManagerDb } = await import('/baseball-manager/src/engine/baseballManagerDb.js');
    const db = await openBaseballManagerDb();
    try {
      return await new Promise((resolve, reject) => {
        const names = ['batted_ball_batches', 'batted_ball_meta', 'batted_ball_aggregates'];
        const tx = db.transaction(names, 'readonly');
        const requests = names.map(name => tx.objectStore(name).getAll());
        tx.oncomplete = () => resolve(requests.map(request => request.result));
        tx.onabort = tx.onerror = () => reject(tx.error);
      });
    } finally { db.close(); }
  });
}

async function holdSnapshot(page) {
  await page.evaluate(lock => {
    window.snapshotTask = navigator.locks.request('baseball-manager-save', () =>
      navigator.locks.request(lock, async () => {
        window.snapshotHeld = true;
        await new Promise(resolve => { window.releaseSnapshot = resolve; });
      }));
  }, LOCK);
  await expect.poll(() => page.evaluate(() => window.snapshotHeld)).toBe(true);
}

async function seed(page, legacy = false) {
  await page.evaluate(async ({ module, legacy }) => {
    const archive = await import(module);
    const record = (saveId, evKmh) => ({ id: `${saveId}:2026:g:p`, saveId, year: 2026,
      gameId: 'g', playerId: 'p', events: [{ result: 's', evKmh, laDeg: 15 }] });
    archive.enqueueBattedBallBatches([record('source', 140), record('unrelated', 150)]);
    if (!(await archive.flushBattedBallQueue()).ok) throw new Error('seed failed');
    localStorage.setItem('baseball_manager_v1', 'primary sentinel');
    localStorage.setItem('baseball_manager_v1_bk1', 'backup sentinel');
    if (legacy) {
      const { openBaseballManagerDb } = await import('/baseball-manager/src/engine/baseballManagerDb.js');
      const db = await openBaseballManagerDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(['batted_ball_meta', 'batted_ball_aggregates'], 'readwrite');
        tx.objectStore('batted_ball_meta').put({ saveId: 'source', estimatedEventCount: 1 });
        const cursor = tx.objectStore('batted_ball_aggregates').index('bySave').openCursor('source');
        cursor.onsuccess = () => { if (cursor.result) { cursor.result.delete(); cursor.result.continue(); } };
        tx.oncomplete = resolve; tx.onabort = tx.onerror = () => reject(tx.error);
      }); db.close();
    }
  }, { module: ARCHIVE, legacy });
}

for (const operation of ['write', 'retry', 'backfill', 'delete']) {
  test(`archive lock: ${operation} in another tab waits for the full snapshot boundary`, async ({ page, context }) => {
    await page.goto(URL); await seed(page, operation === 'backfill');
    const peer = await context.newPage(); await peer.goto(URL);
    if (operation === 'retry') {
      const failed = await peer.evaluate(async module => {
        const archive = await import(module);
        const original = navigator.locks.request;
        navigator.locks.request = () => Promise.reject(new Error('test lock failure'));
        try {
          archive.enqueueBattedBallBatches([{ id: 'source:2026:g:p', saveId: 'source', year: 2026,
            gameId: 'g', playerId: 'p', events: [{ result: 's', evKmh: 180, laDeg: 15 }] }]);
          return await archive.flushBattedBallQueue();
        } finally { navigator.locks.request = original; }
      }, ARCHIVE);
      expect(failed.ok).toBe(false);
    }
    const before = await snapshot(page);
    await holdSnapshot(page);
    try {
      await peer.evaluate(async ({ operation, module }) => {
        const archive = await import(module);
        window.archiveTransactions = [];
        const transaction = IDBDatabase.prototype.transaction;
        IDBDatabase.prototype.transaction = function(stores, mode, ...rest) {
          const names = typeof stores === 'string' ? [stores] : Array.from(stores);
          if (names.some(name => name.startsWith('batted_ball_'))) window.archiveTransactions.push({ names, mode });
          return transaction.call(this, stores, mode, ...rest);
        };
        let pending;
        if (operation === 'write') {
          archive.enqueueBattedBallBatches([{ id: 'source:2026:g:p', saveId: 'source', year: 2026,
            gameId: 'g', playerId: 'p', events: [{ result: 's', evKmh: 180, laDeg: 15 }] }]);
          pending = archive.flushBattedBallQueue();
        } else if (operation === 'retry') pending = archive.retryFailedBattedBallWrites();
        else if (operation === 'delete') pending = archive.deleteBattedBallArchiveBySaveId('source');
        else pending = archive.loadBattedBallComparisonProfiles({ saveId: 'source', year: 2026, playerIds: ['p'] });
        window.operationTask = pending.then(result => { window.operationResult = result; window.operationDone = true; });
      }, { operation, module: ARCHIVE });
      await expect.poll(() => page.evaluate(async lock => (await navigator.locks.query()).pending
        .filter(item => item.name === lock).length, LOCK)).toBe(1);
      expect(await peer.evaluate(() => ({ done: Boolean(window.operationDone), transactions: window.archiveTransactions })))
        .toEqual({ done: false, transactions: [] });
      expect(await snapshot(page)).toEqual(before);
    } finally { await page.evaluate(async () => { window.releaseSnapshot(); await window.snapshotTask; }); }
    await peer.evaluate(() => window.operationTask);
    const result = await peer.evaluate(() => window.operationResult);
    const after = await snapshot(page);
    if (operation === 'write' || operation === 'retry') {
      expect(result).toMatchObject({ ok: true, written: 1 });
      expect(after[0].find(row => row.saveId === 'source').events[0].evKmh).toBe(180);
      expect(after[1].find(row => row.saveId === 'source').estimatedEventCount).toBe(1);
    } else if (operation === 'delete') {
      expect(result).toMatchObject({ ok: true, deleted: 1 });
      for (const store of after) expect(store.some(row => row.saveId === 'source')).toBe(false);
    } else {
      expect(result).toMatchObject({ status: 'ready', peers: [{ totalEvents: 1 }] });
      expect(after[2].find(row => row.saveId === 'source').totalEvents).toBe(1);
    }
    for (let i = 0; i < before.length; i++) {
      expect(after[i].filter(row => row.saveId === 'unrelated')).toEqual(before[i].filter(row => row.saveId === 'unrelated'));
    }
    expect(await page.evaluate(() => [localStorage.getItem('baseball_manager_v1'), localStorage.getItem('baseball_manager_v1_bk1')]))
      .toEqual(['primary sentinel', 'backup sentinel']);
    await peer.close();
  });
}

test('archive lock: failed snapshot releases both locks and pending writer continues', async ({ page, context }) => {
  await page.goto(URL); await seed(page);
  await page.evaluate(lock => {
    window.failedSnapshot = navigator.locks.request('baseball-manager-save', () =>
      navigator.locks.request(lock, async () => {
        window.snapshotHeld = true;
        await new Promise(resolve => { window.releaseSnapshot = resolve; });
        throw new Error('snapshot read failed');
      })).catch(error => error.message);
  }, LOCK);
  await expect.poll(() => page.evaluate(() => window.snapshotHeld)).toBe(true);
  const peer = await context.newPage(); await peer.goto(URL);
  await peer.evaluate(async module => {
    const archive = await import(module);
    window.pendingDelete = archive.deleteBattedBallArchiveBySaveId('source');
  }, ARCHIVE);
  await expect.poll(() => page.evaluate(async lock => (await navigator.locks.query()).pending.some(item => item.name === lock), LOCK)).toBe(true);
  expect(await page.evaluate(async () => { window.releaseSnapshot(); return window.failedSnapshot; })).toBe('snapshot read failed');
  expect(await peer.evaluate(() => window.pendingDelete)).toMatchObject({ ok: true, deleted: 1 });
  expect(await page.evaluate(async () => {
    await navigator.locks.request('baseball-manager-save', () => navigator.locks.request('baseball-manager-archive', () => true));
    return (await navigator.locks.query()).held.length;
  })).toBe(0);
  await peer.close();
});

test('archive lock: unsupported browser retains retry data and rejects deletion without DB changes', async ({ page }) => {
  await page.goto(URL); await seed(page);
  const before = await snapshot(page);
  const result = await page.evaluate(async module => {
    const archive = await import(module);
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
    archive.enqueueBattedBallBatches([{ id: 'source:2026:g:p', saveId: 'source', year: 2026,
      gameId: 'g', playerId: 'p', events: [{ result: 's', evKmh: 180, laDeg: 15 }] }]);
    const write = await archive.flushBattedBallQueue();
    const deletion = await archive.deleteBattedBallArchiveBySaveId('source').then(() => 'unexpected success', error => error.message);
    const failed = archive.getBattedBallQueueStatus().failedRecords;
    delete navigator.locks;
    return { write, deletion, failed };
  }, ARCHIVE);
  expect(result).toMatchObject({ write: { ok: false, error: 'archive_lock_unavailable' }, deletion: 'archive_lock_unavailable', failed: 1 });
  expect(await snapshot(page)).toEqual(before);
  expect(await page.evaluate(async module => (await import(module)).retryFailedBattedBallWrites(), ARCHIVE)).toMatchObject({ ok: true, written: 1 });
});

test('archive lock: deletion under an existing save lock progresses after the archive reader releases', async ({ page, context }) => {
  await page.goto(URL); await seed(page);
  await page.evaluate(lock => {
    window.archiveReader = navigator.locks.request(lock, async () => {
      window.readerHeld = true;
      await new Promise(resolve => { window.releaseReader = resolve; });
    });
  }, LOCK);
  await expect.poll(() => page.evaluate(() => window.readerHeld)).toBe(true);
  const peer = await context.newPage(); await peer.goto(URL);
  await peer.evaluate(async module => {
    const archive = await import(module);
    window.deleteUnderSave = navigator.locks.request('baseball-manager-save', () => archive.deleteBattedBallArchiveBySaveId('source'));
  }, ARCHIVE);
  try {
    await expect.poll(() => page.evaluate(async lock => {
      const state = await navigator.locks.query();
      return { saveHeld: state.held.some(item => item.name === 'baseball-manager-save'),
        archiveWaiting: state.pending.filter(item => item.name === lock).length,
        saveWaiting: state.pending.filter(item => item.name === 'baseball-manager-save').length };
    }, LOCK)).toEqual({ saveHeld: true, archiveWaiting: 1, saveWaiting: 0 });
  } finally { await page.evaluate(async () => { window.releaseReader(); await window.archiveReader; }); }
  expect(await peer.evaluate(() => window.deleteUnderSave)).toMatchObject({ ok: true, deleted: 1 });
  await peer.close();
});
