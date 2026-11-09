import { test, expect } from '@playwright/test';

async function mount(page, real = false, reload = false) {
  return page.evaluate(async ({ real, reload }) => {
    const { mountEconomyHook } = await import('/baseball-manager/tests/helpers/economy-hook-harness.jsx');
    const { closedPostseasonWorld } = await import('/baseball-manager/src/engine/__tests__/fixtures/openOffseason.js');
    const { createInitialTeams } = await import('/baseball-manager/src/engine/bootstrapTeams.js');
    const saves = await import('/baseball-manager/src/engine/saveload.js');
    const { openOffseasonRequest } = await import('/baseball-manager/src/engine/annualOpenOffseason.js');
    if (!reload && !(await saves.saveGame(closedPostseasonWorld(real ? createInitialTeams() : undefined), { skipCompression: true })).ok)
      throw Error('closed snapshot was not saved');
    const world = await saves.loadGame();
    window.closingHarness = mountEconomyHook(world);
    return openOffseasonRequest(world);
  }, { real, reload });
}

test('save generations: native open-offseason saves a single bootstrap candidate after failed publication and cold reload', async ({ page }) => {
  await page.goto('/'); const request = await mount(page, true);
  const result = await page.evaluate(async request => {
    const h = window.closingHarness, gs = () => h.current(), key = 'baseball_manager_v1';
    const root = localStorage.getItem(key), write = Storage.prototype.setItem;
    const originalPlayers = JSON.stringify(gs().teams.map(t => [t.players, t.farm]));
    const originalLedger = JSON.stringify(gs().contractEconomy.engine.spending.ledger);
    const session = gs().getProgressSessionToken();
    const stale = await gs().commitOpenOffseasonRequest(request, session + 1);
    let failed;
    try {
      Storage.prototype.setItem = function (k, v) { if (k === key) throw new DOMException('full', 'QuotaExceededError'); return write.call(this, k, v); };
      failed = await gs().commitOpenOffseasonRequest(request, session);
    } finally { Storage.prototype.setItem = write; }
    const failure = { ok: failed.ok, revision: gs().contractEconomy.revision, sameRoot: localStorage.getItem(key) === root };
    const task = gs().commitOpenOffseasonRequest(request, session);
    const duplicate = await gs().commitOpenOffseasonRequest(request, session);
    const saved = await task, e = gs().contractEconomy;
    return { stale, failure, saved, duplicate, year: gs().year, clock: e.clock, budgetSeason: e.engine.spending.budgetSeason,
      policies: e.budgetPolicies.length, receipts: e.cycle.transitionReceipts.length,
      playersKept: JSON.stringify(gs().teams.map(t => [t.players, t.farm])) === originalPlayers,
      ledgerKept: JSON.stringify(e.engine.spending.ledger) === originalLedger, dirty: gs().saveDirty };
  }, request);
  expect(result.stale).toMatchObject({ ok: false, reason: 'economy_session_conflict' });
  expect(result.failure).toEqual({ ok: false, revision: 0, sameRoot: true });
  expect(result.duplicate).toMatchObject({ ok: false, reason: 'economy_commit_pending' });
  expect(result.saved).toMatchObject({ ok: true, committed: { revision: 1, saveId: request.saveId, epoch: request.epoch } });
  expect(result.saved.committed.rootSignature).toMatch(/^[a-f0-9]{64}$/);
  expect(result.clock).toEqual({ season: 2026, phase: 'offseason', date: '2026-12-01', offseasonTurn: 0 });
  expect(result).toMatchObject({ year: 2026, budgetSeason: 2027, policies: 108, receipts: 1, playersKept: true, ledgerKept: true, dirty: false });
  await page.reload(); await mount(page, false, true);
  const cold = await page.evaluate(async request => {
    const gs = window.closingHarness.current(), root = localStorage.getItem('baseball_manager_v1');
    const replayed = await gs.commitOpenOffseasonRequest(request, gs.getProgressSessionToken());
    const { ANNUAL_ECONOMY_RELEASE_ENABLED } = await import('/baseball-manager/src/engine/contractEconomy.js');
    return { replayed, sameRoot: localStorage.getItem('baseball_manager_v1') === root,
      receipts: gs.contractEconomy.cycle.transitionReceipts.length, phase: gs.contractEconomy.clock.phase, publicGate: ANNUAL_ECONOMY_RELEASE_ENABLED };
  }, request);
  expect(cold).toEqual({ replayed: { ok: true, replayed: true }, sameRoot: true, receipts: 1, phase: 'offseason', publicGate: false });
  await page.evaluate(() => window.closingHarness.unmount());
});

test('save generations: native open-offseason recovers a published candidate without another root publication', async ({ page }) => {
  await page.goto('/'); const request = await mount(page);
  const failed = await page.evaluate(async request => {
    const h = window.closingHarness, gs = () => h.current(), key = 'baseball_manager_v1';
    const read = Storage.prototype.getItem, write = Storage.prototype.setItem;
    let interrupted = false;
    window.closingFault = { write, publications: 0 };
    try {
      Storage.prototype.setItem = function (k, v) { if (k === key) window.closingFault.publications++; return write.call(this, k, v); };
      Storage.prototype.getItem = function (k) {
        if (k === key && gs().contractEconomy.revision === 1 && !interrupted) { interrupted = true; throw Error('ack interrupted'); }
        return read.call(this, k);
      };
      return await gs().commitOpenOffseasonRequest(request, gs().getProgressSessionToken());
    } finally { Storage.prototype.getItem = read; }
  }, request);
  expect(failed).toMatchObject({ ok: false, reason: 'economy_adoption_required' });
  // The returned save failure precedes React's rendering of the recovery flag.
  await page.waitForFunction(() => window.closingHarness.current().isEconomyRecoveryPending);
  const result = await page.evaluate(async () => {
    const gs = () => window.closingHarness.current(), key = 'baseball_manager_v1';
    const root = localStorage.getItem(key), pending = gs().isEconomyRecoveryPending;
    try {
      const recovered = await gs().recoverEconomyCommand();
      return { pending, recovered, publications: window.closingFault.publications, sameRoot: localStorage.getItem(key) === root,
        receipts: gs().contractEconomy.cycle.transitionReceipts.length, revision: gs().contractEconomy.revision };
    } finally { Storage.prototype.setItem = window.closingFault.write; }
  });
  expect(result.recovered).toMatchObject({ ok: true, committed: { revision: 1 } });
  expect(result).toMatchObject({ pending: true, publications: 1, sameRoot: true, receipts: 1, revision: 1 });
  await page.evaluate(() => window.closingHarness.unmount());
});
