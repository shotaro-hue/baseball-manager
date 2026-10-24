import { test, expect } from '@playwright/test';
const PAGE = '/baseball-manager/scripts/save-01b0/';
const F = '/baseball-manager/tests/helpers/batted-ball-receipts-browser.js';
const G = '/baseball-manager/tests/helpers/archive-retention-browser.js';
const S = '/baseball-manager/src/engine/saveload.js';
test.beforeEach(async ({ page }) => { await page.goto(PAGE); });
const waitForExitedRuns = (page, prefixes) => expect.poll(() => page.evaluate(async prefixes =>
  (await navigator.locks.query()).held.filter(lock => {
    if (!lock.name.startsWith('baseball-manager-archive-retain:')) return false;
    const { runId } = JSON.parse(lock.name.slice('baseball-manager-archive-retain:'.length));
    return prefixes.some(prefix => runId.startsWith(prefix));
  }).length, prefixes)).toBe(0);

test('archive retention: an old loaded tab and its unsaved progress survive GC, then exit releases both', async ({ page, context }) => {
  await page.evaluate(async ({ f, s }) => {
    const h = await import(f), save = await import(s);
    const a = await h.stage({ runId: 'old', speed: 140, previousReceipt: h.emptyBattedBallReceipt('source') });
    a.run.adopt(); if (!(await save.saveGame(h.state(a.receipt, 2), { skipBackupRotation: true })).ok) throw new Error('seed failed');
    if (!(await (await import('/baseball-manager/src/engine/battedBallReceipts.js')).flushBattedBallReceipts(a.receipt)).ok) throw new Error('initial projection failed');
  }, { f: F, s: S });
  const peer = await context.newPage(); await peer.goto(PAGE);
  await peer.evaluate(async s => { window.loaded = await (await import(s)).loadGame(); }, S);
  await page.evaluate(async ({ f, s }) => {
    const h = await import(f), b = await h.stage({ runId: 'current', speed: 180, previousReceipt: h.emptyBattedBallReceipt('source') });
    b.run.adopt(); if (!(await (await import(s)).saveGame(h.state(b.receipt, 3), { skipBackupRotation: true })).ok) throw new Error('save failed');
    if (!(await (await import('/baseball-manager/src/engine/battedBallReceipts.js')).flushBattedBallReceipts(b.receipt)).ok) throw new Error('replacement projection failed');
  }, { f: F, s: S });
  await peer.evaluate(async f => { window.staged = await (await import(f)).stage({ runId: 'unpublished', speed: 160, previousReceipt: window.loaded.battedBallReceipt }); }, F);
  await page.evaluate(async g => (await import(g)).collect(), G);
  expect(await page.evaluate(async g => (await import(g)).measurement(), G)).toMatchObject({ rows: 6 });
  expect(await peer.evaluate(async f => (await import(f)).capture(window.staged.receipt), F)).toMatchObject({ status: 'complete', speeds: [160] });
  await peer.close();
  // WebKit may acknowledge page close before releasing its native locks.
  // Collection must wait for this ownership transition, never an arbitrary delay.
  await waitForExitedRuns(page, ['old', 'unpublished']);
  await page.evaluate(async g => (await import(g)).collect(), G);
  expect(await page.evaluate(async g => (await import(g)).measurement(), G)).toMatchObject({ rows: 2 });
  await page.reload();
  expect(await page.evaluate(async ({ f, s }) => {
    const loaded = await (await import(s)).loadGame(); return { day: loaded.gameDay, capture: await (await import(f)).capture(loaded.battedBallReceipt) };
  }, { f: F, s: S })).toMatchObject({ day: 3, capture: { status: 'complete', speeds: [180] } });
});

test('archive retention: all three saved generations remain exact and deletion reclaims settled history', async ({ page, context }) => {
  const peer = await context.newPage(); await peer.goto(PAGE);
  await peer.evaluate(async f => { await (await import(f)).stage({ runId: 'crash-orphan', speed: 210 }); }, F);
  await peer.close();
  await waitForExitedRuns(page, ['crash-orphan']);
  const result = await page.evaluate(async ({ f, g, s }) => {
    const h = await import(f), gc = await import(g), save = await import(s), now = Date.now;
    try {
      for (let i = 0; i < 3; i++) {
        Date.now = () => now() + i * 360_000;
        const value = await h.stage({ runId: `root-${i}`, speed: 140 + i * 20, previousReceipt: h.emptyBattedBallReceipt('source') });
        value.run.adopt(); if (!(await save.saveGame(h.state(value.receipt, i + 2))).ok) throw new Error('save failed');
        await (await import('/baseball-manager/src/engine/battedBallReceipts.js')).flushBattedBallReceipts(value.receipt);
      }
    } finally { Date.now = now; }
    await gc.collect();
    const captures = [];
    for (const root of await gc.savedRoots()) captures.push((await h.capture(root.battedBallReceipt)).speeds);
    const before = await gc.measurement();
    await save.loadGame(); const deleted = await save.deleteSave();
    return { captures, before, deleted, after: await gc.measurement() };
  }, { f: F, g: G, s: S });
  expect(result).toMatchObject({ captures: [[180], [160], [140]], before: { rows: 6 }, deleted: { ok: true }, after: { rows: 0 } });
});

test('archive retention: malformed saved roots block reclamation', async ({ page, context }) => {
  const peer = await context.newPage(); await peer.goto(PAGE);
  await peer.evaluate(async f => { await (await import(f)).stage({ runId: 'orphan', speed: 210 }); }, F); await peer.close();
  await waitForExitedRuns(page, ['orphan']);
  const result = await page.evaluate(async g => {
    const h = await import(g), before = await h.measurement();
    localStorage.setItem('baseball_manager_v1', 'broken root');
    let rejected = false; try { await h.collect(); } catch { rejected = true; }
    return { rejected, before, after: await h.measurement() };
  }, G);
  expect(result.rejected).toBe(true); expect(result.before.rows).toBe(2); expect(result.after).toEqual(result.before);
});

test('archive retention: explicit v4 writers cannot reopen the activated storage', async ({ page }) => {
  expect(await page.evaluate(async () => {
    const { openBaseballManagerDb } = await import('/baseball-manager/src/engine/baseballManagerDb.js');
    const db = await openBaseballManagerDb(); db.close();
    return new Promise(resolve => {
      const req = indexedDB.open('baseball_manager_storage', 4);
      req.onsuccess = () => { req.result.close(); resolve('unexpected-success'); };
      req.onerror = () => resolve(req.error.name);
    });
  })).toBe('VersionError');
});

test('archive retention: twenty synthetic years retain necessary history and repeated crash garbage returns to baseline', async ({ page, context }, testInfo) => {
  const kept = await page.evaluate(async ({ f, s }) => {
    const h = await import(f), save = await import(s), { createBattedBallRunEmitter } = await import('/baseball-manager/src/engine/battedBallRun.js');
    const { createBattedBallReceiptRun, flushBattedBallReceipts } = await import('/baseball-manager/src/engine/battedBallReceipts.js');
    let receipt = h.emptyBattedBallReceipt('source'); const counts = [];
    for (let year = 2026; year < 2046; year++) {
      const runId = `year-${year}`, run = createBattedBallReceiptRun({ saveId: 'source', runId, previousReceipt: receipt });
      const emitter = createBattedBallRunEmitter(chunk => run.append(chunk), { runId });
      for (let game = 1; game <= 12; game++) emitter.add([{ id: `source:${year}:${game}:p`, saveId: 'source', year,
        gameId: `${year}-${game}`, playerId: 'p', gameDay: game, createdAt: 1,
        events: Array.from({ length: 20 }, (_, n) => ({ result: 's', evKmh: 100 + n, laDeg: 15 })) }]);
      receipt = await run.seal(emitter.finish()); run.adopt(); await flushBattedBallReceipts(receipt);
      if ([2030, 2035, 2040, 2045].includes(year)) {
        const state = { ...h.state(receipt, 13), year };
        if (!(await save.saveGame(state, { skipBackupRotation: true })).ok) throw new Error('save failed');
        counts.push({ year, ...(await (await import('/baseball-manager/tests/helpers/archive-retention-browser.js')).measurement()) });
      }
    }
    return { counts, capture: await h.capture(receipt) };
  }, { f: F, s: S });
  expect(kept.capture).toMatchObject({ status: 'complete', recordCount: 240, eventCount: 4800 });
  const baseline = await page.evaluate(async g => (await import(g)).measurement(), G);
  const cycles = [];
  for (let cycle = 0; cycle < 3; cycle++) {
    const peer = await context.newPage(); await peer.goto(PAGE);
    await peer.evaluate(async ({ f, cycle }) => {
      const h = await import(f); for (let n = 0; n < 20; n++) await h.stage({ runId: `crash-${cycle}-${n}`, speed: 200 });
    }, { f: F, cycle });
    await peer.close();
    await waitForExitedRuns(page, [`crash-${cycle}-`]);
    const before = await page.evaluate(async g => (await import(g)).measurement(), G);
    await page.evaluate(async g => (await import(g)).collect(), G);
    const after = await page.evaluate(async g => (await import(g)).measurement(), G);
    expect(before.rows).toBeGreaterThan(baseline.rows); expect(after).toEqual(baseline); cycles.push({ before, after });
  }
  await page.reload();
  const reloaded = await page.evaluate(async ({ f, s }) => {
    const saved = await (await import(s)).loadGame(); return { year: saved.year, capture: await (await import(f)).capture(saved.battedBallReceipt) };
  }, { f: F, s: S });
  expect(reloaded.year).toBe(2045); expect(reloaded.capture).toEqual(kept.capture);
  await testInfo.attach('archive-capacity-evidence', { body: JSON.stringify({ kind: 'synthetic-years-not-simulation',
    unit: 'UTF-16 bytes of serialized stored version rows, not physical disk/RAM', years: kept.counts, baseline, cycles }, null, 2), contentType: 'application/json' });
});
