import { test, expect } from '@playwright/test';
import { startNewGame, runBatch, runSingle, saveHub, reloadAndLoad } from './helpers/progression';
const PAGE = '/baseball-manager/scripts/save-01b0/';
const H = '/baseball-manager/tests/helpers/batted-ball-receipts-browser.js';
const SAVE = '/baseball-manager/src/engine/saveload.js';
const NORMAL = '/baseball-manager/tests/helpers/receipt-normal-harness.jsx';
test.beforeEach(async ({ page }) => { await page.goto(PAGE); });

test('archive receipts: persisted primary and backup retain distinct bytes for the same game identity after reload', async ({ page }) => {
  const seeded = await page.evaluate(async ({ h, save }) => {
    const f = await import(h), s = await import(save);
    const a = await f.stage({ runId: 'old-root', speed: 140, previousReceipt: f.emptyBattedBallReceipt('source') }); a.run.adopt();
    const first = await s.saveGame(f.state(a.receipt, 2));
    const b = await f.stage({ runId: 'new-root', speed: 180, previousReceipt: f.emptyBattedBallReceipt('source') }); b.run.adopt();
    const second = await s.saveGame(f.state(b.receipt, 3));
    await (await import('/baseball-manager/src/engine/battedBallReceipts.js')).flushBattedBallReceipts(b.receipt);
    return { first: first.ok, second: second.ok };
  }, { h: H, save: SAVE });
  expect(seeded).toEqual({ first: true, second: true });
  await page.reload();
  const current = await page.evaluate(async ({ h, save }) => {
    const f = await import(h), root = await (await import(save)).loadGame();
    const before = await f.snapshot('save_chunks'), captured = await f.capture(root.battedBallReceipt);
    return { day: root.gameDay, captured, readOnly: JSON.stringify(before) === JSON.stringify(await f.snapshot('save_chunks')) };
  }, { h: H, save: SAVE });
  expect(current).toMatchObject({ day: 3, readOnly: true, captured: { status: 'complete', speeds: [180] } });
  await page.evaluate(() => localStorage.setItem('baseball_manager_v1', 'broken'));
  await page.reload();
  const backup = await page.evaluate(async ({ h, save }) => {
    const f = await import(h), s = await import(save), root = await s.loadGame();
    return { day: root.gameDay, recovery: s.getLastLoadResult().status, captured: await f.capture(root.battedBallReceipt) };
  }, { h: H, save: SAVE });
  expect(backup).toMatchObject({ day: 2, recovery: 'recovered', captured: { status: 'complete', speeds: [140] } });
});

test('archive receipts: another tab stages only after archive lock grant, then cancellation leaves active and foreign rows unchanged', async ({ page, context }) => {
  await page.evaluate(async () => {
    window.held = navigator.locks.request('baseball-manager-archive', async () => {
      window.lockHeld = true; await new Promise(resolve => { window.releaseArchive = resolve; });
    });
  });
  await expect.poll(() => page.evaluate(() => window.lockHeld)).toBe(true);
  const peer = await context.newPage(); await peer.goto(PAGE);
  await peer.evaluate(h => {
    window.transactions = [];
    const original = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function(stores, mode, ...rest) {
      if (mode === 'readwrite') window.transactions.push(stores); return original.call(this, stores, mode, ...rest);
    };
    window.staging = import(h).then(f => f.stage({ runId: 'cancelled', previousReceipt: f.emptyBattedBallReceipt('source') })).then(value => { window.staged = value; });
  }, H);
  try {
    await expect.poll(() => page.evaluate(async () => (await navigator.locks.query()).pending.filter(x => x.name === 'baseball-manager-archive').length)).toBe(1);
    expect(await peer.evaluate(() => window.transactions)).toEqual([]);
  } finally { await page.evaluate(async () => { window.releaseArchive(); await window.held; }); }
  await peer.evaluate(() => window.staging);
  expect(await peer.evaluate(async h => (await import(h)).snapshot('batted_ball_batches'), H)).toEqual([]);
  expect(await peer.evaluate(() => window.staged.run.discard())).toBe(true);
  expect(await peer.evaluate(async h => (await import(h)).snapshot('save_chunks'), H)).toEqual([]);
  await peer.close();
});

test('archive receipts: mutable replacement and delayed legacy deletion cannot change the captured root or a foreign save', async ({ page }) => {
  const result = await page.evaluate(async h => {
    const f = await import(h), a = await f.stage({ runId: 'accepted', previousReceipt: f.emptyBattedBallReceipt('source') }); a.run.adopt();
    const archive = await import('/baseball-manager/src/engine/battedBallArchive.js');
    await (await import('/baseball-manager/src/engine/battedBallReceipts.js')).flushBattedBallReceipts(a.receipt);
    archive.enqueueBattedBallBatches([{ id: 'foreign', saveId: 'foreign', playerId: 'p', gameId: 'g', year: 2026, events: [{ result: 's', evKmh: 150, laDeg: 15 }] }]);
    await archive.flushBattedBallQueue();
    const foreign = (await f.snapshot('batted_ball_batches')).filter(([, r]) => r.saveId === 'foreign');
    const staged = await f.stage({ runId: 'ahead', speed: 190, previousReceipt: a.receipt });
    archive.enqueueBattedBallBatches([{ id: 'source:2026:same-game:p', saveId: 'source', playerId: 'p', gameId: 'same-game', year: 2026, events: [{ result: 's', evKmh: 200, laDeg: 15 }] }]);
    await archive.flushBattedBallQueue(); await archive.deleteBattedBallArchiveBySaveId('source');
    const captured = await f.capture(a.receipt); await staged.run.discard();
    const legacy = await f.stage({ runId: 'legacy', saveId: 'legacy' });
    const legacyStatus = (await f.capture(legacy.receipt)).status; await legacy.run.discard();
    return { captured, legacyStatus, foreignKept: JSON.stringify(foreign) === JSON.stringify((await f.snapshot('batted_ball_batches')).filter(([, r]) => r.saveId === 'foreign')) };
  }, H);
  expect(result).toMatchObject({ captured: { status: 'complete', speeds: [140] }, foreignKept: true, legacyStatus: 'legacy_unverified' });
});

test('archive receipts: missing immutable rows fail explicitly after reload while the game root remains loadable', async ({ page }) => {
  await page.evaluate(async ({ h, save }) => {
    const f = await import(h), a = await f.stage({ runId: 'missing', previousReceipt: f.emptyBattedBallReceipt('source') }); a.run.adopt();
    await (await import('/baseball-manager/src/engine/battedBallReceipts.js')).flushBattedBallReceipts(a.receipt);
    if (!(await (await import(save)).saveGame(f.state(a.receipt, 2))).ok) throw new Error('seed failed');
    const [key] = (await f.snapshot('save_chunks')).find(([key]) => key.startsWith('batted-ball-version:') && key.includes('"chunk"'));
    const db = await (await import('/baseball-manager/src/engine/baseballManagerDb.js')).openBaseballManagerDb();
    try { await new Promise((resolve, reject) => { const tx = db.transaction('save_chunks', 'readwrite'); tx.objectStore('save_chunks').delete(key); tx.oncomplete = resolve; tx.onabort = tx.onerror = () => reject(tx.error); }); }
    finally { db.close(); }
  }, { h: H, save: SAVE });
  await page.reload();
  const result = await page.evaluate(async ({ h, save }) => {
    const f = await import(h), root = await (await import(save)).loadGame(); let error;
    try { await f.capture(root.battedBallReceipt); } catch (e) { error = e.message; }
    return { day: root.gameDay, error, flushed: await (await import('/baseball-manager/src/engine/battedBallReceipts.js')).flushBattedBallReceipts(root.battedBallReceipt) };
  }, { h: H, save: SAVE });
  expect(result).toMatchObject({ day: 2, error: 'archive_missing_or_corrupt', flushed: { ok: false, scope: 'head' } });
});

test('archive receipts: failed main publication keeps the prior receipt and retry preserves its backup', async ({ page }) => {
  const result = await page.evaluate(async ({ h, save }) => {
    const f = await import(h), s = await import(save);
    const a = await f.stage({ runId: 'before', previousReceipt: f.emptyBattedBallReceipt('source') }); a.run.adopt();
    await s.saveGame(f.state(a.receipt, 2));
    const b = await f.stage({ runId: 'after', speed: 180, previousReceipt: a.receipt, gameId: 'next-game' }); b.run.adopt();
    const before = ['baseball_manager_v1', 'baseball_manager_v1_bk1', 'baseball_manager_v1_bk2'].map(k => localStorage.getItem(k));
    const set = Storage.prototype.setItem; let failed;
    try { Storage.prototype.setItem = function(k, v) { if (k === 'baseball_manager_v1') throw new DOMException('injected', 'QuotaExceededError'); return set.call(this, k, v); };
      failed = await s.saveGame(f.state(b.receipt, 3), { skipBackupRotation: true });
    } finally { Storage.prototype.setItem = set; }
    const preserved = JSON.stringify(before) === JSON.stringify(['baseball_manager_v1', 'baseball_manager_v1_bk1', 'baseball_manager_v1_bk2'].map(k => localStorage.getItem(k)));
    const old = await f.capture((await s.loadGame()).battedBallReceipt);
    const retried = await s.saveGame(f.state(b.receipt, 3));
    return { failed: failed.ok, preserved, old, retried: retried.ok, next: await f.capture((await s.loadGame()).battedBallReceipt) };
  }, { h: H, save: SAVE });
  expect(result).toMatchObject({ failed: false, preserved: true, old: { speeds: [140] }, retried: true, next: { status: 'complete', speeds: [180, 140] } });
});

test('archive receipts: actual new game, batch, reload and single Worker progression retain a complete receipt chain', async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  const mobile = testInfo.project.name === 'mobile-webkit';
  await startNewGame(page); await runBatch(page, mobile); await saveHub(page, { progressOnly: true });
  const capture = () => page.evaluate(async () => {
    const root = await (await import('/baseball-manager/src/engine/saveload.js')).loadGame();
    const result = await (await import('/baseball-manager/src/engine/battedBallReceipts.js')).readBattedBallReceipt(root.battedBallReceipt);
    return { head: root.battedBallReceipt.head, day: root.gameDay, ...result };
  });
  const before = await capture(); expect(before.status).toBe('complete'); expect(before.recordCount).toBeGreaterThan(0);
  await reloadAndLoad(page); expect(await capture()).toEqual(before);
  await runSingle(page, mobile); await saveHub(page, { progressOnly: true });
  const after = await capture(); expect(after.status).toBe('complete'); expect(after.day).toBe(before.day + 1);
  expect(after.recordCount).toBeGreaterThan(before.recordCount); expect(after.head).not.toEqual(before.head);
});

test('archive receipts: tactical-first progression is adopted under the actual StrictMode effect lifecycle', async ({ page }) => {
  await page.evaluate(async path => { window.normalHarness = (await import(path)).mountNormalHarness(); }, NORMAL);
  await expect.poll(() => page.evaluate(() => window.normalHarness.ready())).toBe(true);
  const result = await page.evaluate(async () => { await window.normalHarness.run('tactical'); return window.normalHarness.result(); });
  expect(result).toMatchObject({ day: 2, adopted: 1, receipt: { coverage: 'complete' } });
  expect(result.receipt.head).not.toBeNull();
  await page.evaluate(() => window.normalHarness.unmount());
});

for (const mode of ['auto', 'tactical']) test(`archive receipts: rejected normal ${mode} seal publishes no result, news, mailbox or history effects`, async ({ page }) => {
  await page.evaluate(async path => { window.normalHarness = (await import(path)).mountNormalHarness({ strict: false }); }, NORMAL);
  await expect.poll(() => page.evaluate(() => window.normalHarness.ready())).toBe(true);
  await page.evaluate(mode => {
    const original = crypto.subtle.digest.bind(crypto.subtle);
    window.restoreDigest = () => { crypto.subtle.digest = original; };
    crypto.subtle.digest = (algorithm, bytes) => {
      if (new TextDecoder().decode(bytes).includes('"kind":"run"')) return new Promise((resolve, reject) => {
        window.sealHeld = true; window.releaseSeal = () => original(algorithm, bytes).then(resolve, reject);
      });
      return original(algorithm, bytes);
    };
    window.normalTask = window.normalHarness.run(mode);
  }, mode);
  try {
    await expect.poll(() => page.evaluate(() => window.sealHeld)).toBe(true);
    await page.evaluate(() => window.normalHarness.bump());
  } finally { await page.evaluate(async () => { window.restoreDigest(); window.releaseSeal?.(); await window.normalTask; }); }
  const result = await page.evaluate(() => window.normalHarness.result());
  expect(result).toMatchObject({ day: 1, adopted: 0, effects: [], gameResult: null, receipt: { head: null } });
  await page.evaluate(() => window.normalHarness.unmount());
});
