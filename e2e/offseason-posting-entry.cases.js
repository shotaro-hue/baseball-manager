import { expect, test } from '@playwright/test';

async function mount(page, { reload = false, legacy = false } = {}) {
  await page.evaluate(async ({ reload, legacy }) => {
    const { offseasonPostingWorld } = await import('/baseball-manager/src/engine/__tests__/fixtures/offseasonPosting.js');
    const { saveGame, loadGame } = await import('/baseball-manager/src/engine/saveload.js');
    const { mountTradeView } = await import('/baseball-manager/tests/helpers/trade-hook-harness.jsx');
    window.entryHarness?.unmount();
    if (!reload) {
      const saved = await saveGame(offseasonPostingWorld(), { skipCompression: true });
      if (!saved.ok) throw Error(JSON.stringify(saved));
    }
    window.entryHarness = mountTradeView(await loadGame(), { retirement: true, legacy, mailbox: true });
  }, { reload, legacy });
}
async function durable(page) {
  return page.evaluate(async () => {
    const { loadGame } = await import('/baseball-manager/src/engine/saveload.js');
    const w = await loadGame(); if (!w) throw Error('cold load failed');
    return { teams: w.teams, economy: w.contractEconomy };
  });
}
async function capture(page, info, width, stage) {
  const body = await page.screenshot({ fullPage: true, ...(process.env.OFFSEASON_ENTRY_CAPTURE && info.project.name === 'chromium'
    ? { path: `${process.env.OFFSEASON_ENTRY_CAPTURE}/${width}-${stage}.png` } : {}) });
  await info.attach(`offseason-entry-${width}-${stage}`, { body, contentType: 'image/png' });
}
for (const width of [360, 390, 1440]) test(`save generations: annual retirement posting entry saves atomically at ${width}px`, async ({ page }, info) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width, height: width === 360 ? 800 : width === 390 ? 844 : 900 });
  await page.goto('/'); await mount(page, { legacy: true }); await capture(page, info, width, 'before');
  await mount(page, { reload: true });
  await expect(page.getByRole('heading', { name: '引退予約と海外挑戦', exact: true })).toBeVisible();
  await expect(page.getByText(/Club 0 · Player 9/)).toBeVisible();
  await expect(page.getByText(/Club 1 · Player 0/)).toBeVisible();
  await expect(page.getByRole('button', { name: '引き留める', exact: true })).toHaveCount(0);
  await capture(page, info, width, 'after');
  const before = await durable(page);
  await page.getByRole('button', { name: '受信箱へ', exact: true }).click();
  await capture(page, info, width, 'inbox-after');
  await expect(page.getByRole('region', { name: '年度の海外挑戦' })).toContainText('希望確認の前に引退予約の確定が必要です');
  await expect(page.getByRole('button', { name: '海外挑戦の希望を確認する', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '引退予約の確認へ', exact: true }).click();
  await expect(page.getByRole('heading', { name: '引退予約と海外挑戦', exact: true })).toBeVisible();
  expect(await durable(page)).toEqual(before);
  await page.getByRole('button', { name: '引退予約を確定して希望を確認する', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('未確定の引退予約 2人');
  await page.evaluate(() => {
    window.entryRoot = localStorage.getItem('baseball_manager_v1'); window.entryWrite = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'baseball_manager_v1') throw new DOMException('full', 'QuotaExceededError');
      return window.entryWrite.call(this, key, value);
    };
  });
  await page.getByRole('button', { name: '予約と希望確認を保存する', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('処理を完了できませんでした');
  expect(await page.evaluate(() => localStorage.getItem('baseball_manager_v1') === window.entryRoot)).toBe(true);
  expect(await durable(page)).toEqual(before);
  await capture(page, info, width, 'failure');
  await page.evaluate(() => {
    window.entryPublications = 0;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'baseball_manager_v1') window.entryPublications++;
      return window.entryWrite.call(this, key, value);
    };
    window.entryRead = Storage.prototype.getItem; window.entryAckInterrupted = false;
    const revision = window.entryHarness.current().contractEconomy.revision;
    Storage.prototype.getItem = function (key) {
      if (key === 'baseball_manager_v1' && !window.entryAckInterrupted
        && window.entryHarness.current().contractEconomy.revision === revision + 1) {
        window.entryAckInterrupted = true; throw Error('ack interrupted');
      }
      return window.entryRead.call(this, key);
    };
  });
  await page.getByRole('button', { name: '予約と希望確認を保存する', exact: true }).click();
  const recover = page.getByRole('button', { name: '保存済みの結果を復旧する', exact: true });
  await expect(recover).toBeVisible(); await expect(recover).toBeFocused();
  await expect(page.getByRole('button', { name: '受信箱へ', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => window.entryHarness.current().setScreen('hub'))).toBe(false);
  await page.evaluate(() => {
    Storage.prototype.getItem = window.entryRead;
    window.entryPublishedRoot = localStorage.getItem('baseball_manager_v1');
  });
  await capture(page, info, width, 'recovery');
  await recover.click();
  await expect(page.getByRole('status')).toContainText('引退予約と希望確認を保存済み');
  expect(await page.evaluate(() => window.entryPublications)).toBe(1);
  expect(await page.evaluate(() => localStorage.getItem('baseball_manager_v1') === window.entryPublishedRoot)).toBe(true);
  await page.evaluate(() => { Storage.prototype.setItem = window.entryWrite; });
  const after = await durable(page), e = after.economy.engine;
  expect(after.economy.revision).toBe(before.economy.revision + 1);
  expect(e.retirementReservations.every(r => r.finalization)).toBe(true);
  expect(e.transactions.at(-1).annualOffseasonPosting).toBeTruthy();
  for (const r of e.retirementReservations) {
    expect(after.teams.find(t => t.id === r.teamId).history.filter(p => p.retirementReservationId === r.id)).toHaveLength(1);
  }
  const archived = await page.evaluate(async () => {
    const { loadPlayerCareerLogById } = await import('/baseball-manager/src/engine/saveload.js');
    const w = window.entryHarness.current();
    return Promise.all(w.contractEconomy.engine.retirementReservations.map(r => loadPlayerCareerLogById(String(r.playerId), w.saveId)));
  });
  for (const rows of archived) expect(rows.filter(r => r.year === 2026)).toHaveLength(1);
  await page.reload(); await mount(page, { reload: true });
  await expect(page.getByRole('status')).toContainText('引退予約と希望確認を保存済み');
  expect(await durable(page)).toEqual(after); await capture(page, info, width, 'reload');
  await page.getByRole('button', { name: '受信箱へ', exact: true }).click();
  await expect(page.getByRole('region', { name: '年度の海外挑戦' })).toBeVisible();
  await expect(page.getByRole('button', { name: /【ポスティング申請】/ }).first()).toBeVisible();
  expect(await page.evaluate(() => window.entryHarness.current().year)).toBe(2026);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
