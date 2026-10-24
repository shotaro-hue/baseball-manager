import { test, expect } from '@playwright/test';

const PAGE = '/baseball-manager/scripts/save-01b0/';
const FIXTURE = '/baseball-manager/tests/helpers/storage-version-fence.js';
const DB = '/baseball-manager/src/engine/baseballManagerDb.js';
const SAVE = '/baseball-manager/src/engine/saveload.js';

test('storage version fence: another realm queued behind a blocked open times out safely and later recovers', async ({ page, context }) => {
  await page.goto(PAGE);
  await page.evaluate(async fixture => { window.legacyDb = await (await import(fixture)).seedLegacyDb({ hold: true }); }, FIXTURE);
  const blocker = await context.newPage(); await blocker.goto(PAGE);
  const waiting = await context.newPage(); await waiting.goto(PAGE);
  try {
    expect(await blocker.evaluate(async module => (await import(module)).openBaseballManagerDb()
      .then(db => { db.close(); return 'unexpected-success'; }, error => error.name), DB)).toBe('StorageUpgradeBlockedError');
    const timedOut = await waiting.evaluate(async module => {
      const open = indexedDB.open.bind(indexedDB);
      indexedDB.open = (...args) => { window.queuedRequest = open(...args); return window.queuedRequest; };
      return (await import(module)).openBaseballManagerDb().then(db => { db.close(); return 'unexpected-success'; }, error => error.name);
    }, DB);
    expect(timedOut).toBe('StorageOpenTimeoutError');
    expect(await page.evaluate(() => window.legacyDb.version)).toBe(3);
  } finally { await page.evaluate(() => window.legacyDb.close()); }
  await expect.poll(() => waiting.evaluate(() => window.queuedRequest.readyState)).toBe('done');
  expect(await page.evaluate(async fixture => { const db = await (await import(fixture)).openLegacyDb(); const version = db.version; db.close(); return version; }, FIXTURE)).toBe(3);
  expect(await waiting.evaluate(async module => { const db = await (await import(module)).openBaseballManagerDb(); const version = db.version; db.close(); return version; }, DB)).toBe(5);
  await blocker.close(); await waiting.close();
});

test('storage version fence: blocked upgrade preserves rows and roots until an explicit retry', async ({ page, context }) => {
  await page.goto(PAGE);
  const before = await page.evaluate(async fixture => {
    const helper = await import(fixture);
    window.legacyDb = await helper.seedLegacyDb({ hold: true });
    const state = { saveId: 'source', year: 2026, gameDay: 1, myId: 0,
      teams: [{ id: 0, name: 'fixture', players: [], farm: [] }], news: [], mailbox: [], seasonHistory: {} };
    const raw = JSON.stringify(state);
    for (const key of ['baseball_manager_v1', 'baseball_manager_v1_bk1', 'baseball_manager_v1_bk2']) localStorage.setItem(key, raw);
    window.legacyState = state;
    return { rows: await helper.readDbSnapshot(window.legacyDb), roots: [raw, raw, raw] };
  }, FIXTURE);
  const current = await context.newPage(); await current.goto(PAGE);
  try {
    const result = await current.evaluate(async ({ save, db }) => {
      const { openBaseballManagerDb } = await import(db);
      const tracked = [], original = indexedDB.open.bind(indexedDB);
      indexedDB.open = (...args) => { const req = original(...args); tracked.push(req); return req; };
      window.abandonedRequests = tracked;
      const { saveGame } = await import(save);
      const state = JSON.parse(localStorage.getItem('baseball_manager_v1'));
      const result = await saveGame({ ...state, gameDay: 2 });
      const feedback = (await import('/baseball-manager/src/engine/saveFeedback.js')).saveFeedback(result);
      return { result, feedback, roots: ['baseball_manager_v1', 'baseball_manager_v1_bk1', 'baseball_manager_v1_bk2'].map(key => localStorage.getItem(key)) };
    }, { save: SAVE, db: DB });
    expect(result.result).toMatchObject({ ok: false, reason: 'storage_upgrade_blocked' });
    expect(result.feedback).toMatchObject({ retryable: true });
    expect(result.feedback.recovery).toContain('別タブ'); expect(result.feedback.recovery).toContain('未保存');
    expect(result.roots).toEqual(before.roots);
    expect(await page.evaluate(async fixture => (await import(fixture)).readDbSnapshot(window.legacyDb), FIXTURE)).toEqual(before.rows);
  } finally { await page.evaluate(() => window.legacyDb.close()); }
  await expect.poll(() => current.evaluate(() => window.abandonedRequests.every(req => req.readyState === 'done'))).toBe(true);
  expect(await current.evaluate(() => window.abandonedRequests.map(req => req.error?.name))).not.toContain(undefined);
  // A rejected request must not become a silent background upgrade.
  expect(await page.evaluate(async fixture => {
    const db = await (await import(fixture)).openLegacyDb(); const version = db.version; db.close(); return version;
  }, FIXTURE)).toBe(3);
  const preserved = await current.evaluate(async ({ fixture, module }) => {
    const db = await (await import(module)).openBaseballManagerDb();
    try { return { version: db.version, snapshot: await (await import(fixture)).readDbSnapshot(db) }; }
    finally { db.close(); }
  }, { fixture: FIXTURE, module: DB });
  expect(preserved.version).toBe(5); expect(preserved.snapshot).toEqual(before.rows);
  const retry = await current.evaluate(async save => {
    const mod = await import(save);
    const state = JSON.parse(localStorage.getItem('baseball_manager_v1'));
    const result = await mod.saveGame({ ...state, gameDay: 2 });
    const loaded = await mod.loadGame(); return { result, day: loaded?.gameDay };
  }, SAVE);
  expect(retry).toMatchObject({ result: { ok: true }, day: 2 });
  await current.close();
});

test('storage version fence: a cooperative old connection closes and v3 cannot reopen to replace archive bytes', async ({ page, context }) => {
  await page.goto(PAGE);
  await page.evaluate(async fixture => {
    const helper = await import(fixture); window.legacyDb = await helper.seedLegacyDb();
    window.legacySnapshot = await helper.readDbSnapshot(window.legacyDb);
  }, FIXTURE);
  const current = await context.newPage(); await current.goto(PAGE);
  const version = await current.evaluate(async module => { const db = await (await import(module)).openBaseballManagerDb(); const version = db.version; db.close(); return version; }, DB);
  expect(version).toBe(5);
  const denied = await page.evaluate(async fixture => {
    let heldError;
    try { window.legacyDb.transaction('batted_ball_batches', 'readwrite'); }
    catch (error) { heldError = error.name; }
    const reopen = await (await import(fixture)).openLegacyDb().then(db => { db.close(); return 'unexpected-success'; }, error => error.name);
    return { heldError, reopen };
  }, FIXTURE);
  expect(denied).toEqual({ heldError: 'InvalidStateError', reopen: 'VersionError' });
  const actual = await current.evaluate(async ({ module, fixture }) => {
    const db = await (await import(module)).openBaseballManagerDb();
    try { return await (await import(fixture)).readDbSnapshot(db); } finally { db.close(); }
  }, { module: DB, fixture: FIXTURE });
  expect(actual).toEqual(await page.evaluate(() => window.legacySnapshot)); await current.close();
});

test('storage version fence: helper connection yields to a future version and old save preserves roots', async ({ page, context }) => {
  await page.goto(PAGE);
  await page.evaluate(async ({ module, save }) => {
    const state = { saveId: 'source', year: 2026, gameDay: 1, myId: 0,
      teams: [{ id: 0, players: [], farm: [] }], news: [], mailbox: [], seasonHistory: {} };
    if (!(await (await import(save)).saveGame(state)).ok) throw new Error('seed save failed');
    window.keptDb = await (await import(module)).openBaseballManagerDb();
    window.savedRoots = ['baseball_manager_v1', 'baseball_manager_v1_bk1', 'baseball_manager_v1_bk2'].map(key => localStorage.getItem(key));
  }, { module: DB, save: SAVE });
  const newer = await context.newPage(); await newer.goto(PAGE);
  const activation = newer.evaluate(() => new Promise((resolve, reject) => {
    const req = indexedDB.open('baseball_manager_storage', 6);
    req.onblocked = () => reject(new Error('helper failed to release its connection'));
    req.onerror = () => reject(req.error);
    req.onsuccess = () => { req.result.close(); resolve(6); };
  }));
  expect(await activation).toBe(6);
  const result = await page.evaluate(async save => {
    const mod = await import(save), state = { saveId: 'source', year: 2026, gameDay: 2, myId: 0,
      teams: [{ id: 0, players: [], farm: [] }], news: [], mailbox: [], seasonHistory: {} };
    const result = await mod.saveGame(state);
    const feedback = (await import('/baseball-manager/src/engine/saveFeedback.js')).saveFeedback(result);
    return { result, retryable: feedback.retryable, sameRoots: window.savedRoots.every((raw, i) => raw === localStorage.getItem(['baseball_manager_v1', 'baseball_manager_v1_bk1', 'baseball_manager_v1_bk2'][i])) };
  }, SAVE);
  expect(result).toMatchObject({ result: { ok: false, reason: 'storage_version_outdated' }, retryable: false, sameRoots: true });
  await newer.close();
});
