import { test, expect } from '@playwright/test';

async function mount(page, reload = false) {
  await page.evaluate(async reload => {
    const { yearEndReviewWorld } = await import('/baseball-manager/src/engine/__tests__/fixtures/yearEndRetirements.js');
    const { saveGame, loadGame } = await import('/baseball-manager/src/engine/saveload.js');
    const { mountTradeView } = await import('/baseball-manager/tests/helpers/trade-hook-harness.jsx');
    window.yearEndHarness?.unmount();
    if (!reload && !(await saveGame(yearEndReviewWorld(), { skipCompression: true })).ok) throw Error('year-end fixture save failed');
    window.yearEndHarness = mountTradeView(await loadGame(), { retirement: true, mailbox: true });
  }, reload);
}
async function capture(page, info, width, stage) {
  const path = process.env.YEAR_END_CAPTURE && info.project.name === 'chromium' ? `${process.env.YEAR_END_CAPTURE}/${width}-${stage}.png` : undefined;
  const body = await page.screenshot({ fullPage: true, ...(path ? { path } : {}) });
  await info.attach(`year-end-${width}-${stage}`, { body, contentType: 'image/png' });
}
for (const width of [360, 390, 1440]) test(`save generations: year-end retirement review preserves failed choices and cold results at ${width}px`, async ({ page }, info) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width, height: width === 360 ? 800 : width === 390 ? 844 : 900 });
  await page.goto('/'); await mount(page);
  await expect(page.getByRole('button', { name: '期末の引退判断を確認する' })).toBeDisabled();
  await capture(page, info, width, 'review');
  await page.getByRole('button', { name: '引き留めを試みる', exact: true }).click();
  await page.getByRole('button', { name: '期末の引退判断を確認する' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('引き留めを試みる');
  await page.evaluate(() => {
    window.yearEndRoot = localStorage.getItem('baseball_manager_v1');
    window.yearEndWrite = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) { if (k === 'baseball_manager_v1') throw new DOMException('full', 'QuotaExceededError'); return window.yearEndWrite.call(this, k, v); };
  });
  await dialog.getByRole('button', { name: '引退判断を保存する' }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('baseball_manager_v1') === window.yearEndRoot)).toBe(true);
  await capture(page, info, width, 'failure');
  await page.evaluate(() => { Storage.prototype.setItem = window.yearEndWrite; });
  await dialog.getByRole('button', { name: '引退判断を保存する' }).click();
  await expect(page.getByRole('region', { name: '保存済みの期末引退結果' })).toContainText('引き留め不成立・引退');
  await expect(dialog).toHaveCount(0); await capture(page, info, width, 'saved');
  const facts = await page.evaluate(async () => {
    const { loadGame, loadPlayerCareerLogById } = await import('/baseball-manager/src/engine/saveload.js');
    const w = await loadGame(), r = w.contractEconomy.engine.retirementReservations;
    return { revision: w.contractEconomy.revision, ids: r.map(x => x.id),
      career: await Promise.all(r.map(x => loadPlayerCareerLogById(String(x.playerId), w.saveId))) };
  });
  expect(facts.revision).toBe(2); expect(facts.ids).toHaveLength(2);
  for (const career of facts.career) expect(career.filter(r => r.year === 2026)).toHaveLength(1);
  await page.reload(); await mount(page, true);
  await expect(page.getByRole('region', { name: '保存済みの期末引退結果' })).toContainText('引き留め不成立・引退');
  await expect(page.getByRole('button', { name: '引き留めを試みる', exact: true })).toHaveCount(0);
  await capture(page, info, width, 'reload');
  await page.getByRole('button', { name: '引退予約を確定して希望を確認する' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '予約と希望確認を保存する' }).click();
  await expect(page.getByRole('status')).toContainText('引退予約と希望確認を保存済み');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('save generations: year-end retirement review recovers a published result without publishing twice', async ({ page }) => {
  await page.goto('/'); await mount(page);
  await page.getByRole('button', { name: '引退を受け入れる', exact: true }).click();
  await page.getByRole('button', { name: '期末の引退判断を確認する' }).click();
  await page.evaluate(() => {
    const read = Storage.prototype.getItem, write = Storage.prototype.setItem;
    window.yearEndFault = { read, write, publications: 0, interrupted: false };
    Storage.prototype.setItem = function (k, v) { if (k === 'baseball_manager_v1') window.yearEndFault.publications++; return write.call(this, k, v); };
    Storage.prototype.getItem = function (k) {
      if (k === 'baseball_manager_v1' && window.yearEndHarness.current().contractEconomy.revision === 2 && !window.yearEndFault.interrupted) {
        window.yearEndFault.interrupted = true; throw Error('ack interrupted');
      }
      return read.call(this, k);
    };
  });
  await page.getByRole('dialog').getByRole('button', { name: '引退判断を保存する' }).click();
  await expect(page.getByRole('button', { name: '保存済みの結果を復旧する' })).toBeVisible();
  const root = await page.evaluate(() => { Storage.prototype.getItem = window.yearEndFault.read; return localStorage.getItem('baseball_manager_v1'); });
  await page.getByRole('button', { name: '保存済みの結果を復旧する' }).click();
  await expect(page.getByRole('button', { name: '保存済みの結果を復旧する' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: '保存済みの期末引退結果' })).toBeVisible();
  expect(await page.evaluate(root => ({ sameRoot: localStorage.getItem('baseball_manager_v1') === root, publications: window.yearEndFault.publications }), root))
    .toEqual({ sameRoot: true, publications: 1 });
  await page.evaluate(() => { Storage.prototype.setItem = window.yearEndFault.write; });
});

test('save generations: year-end retirement review continues into posting without reloading', async ({ page }) => {
  await page.goto('/'); await mount(page);
  await page.getByRole('button', { name: '引退を受け入れる', exact: true }).click();
  await page.getByRole('button', { name: '期末の引退判断を確認する' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '引退判断を保存する' }).click();
  await expect(page.getByRole('region', { name: '保存済みの期末引退結果' })).toBeVisible();
  await page.getByRole('button', { name: '引退予約を確定して希望を確認する' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '予約と希望確認を保存する' }).click();
  await expect(page.getByRole('status')).toContainText('引退予約と希望確認を保存済み');
  expect(await page.evaluate(() => {
    const e = window.yearEndHarness.current().contractEconomy;
    return { revision: e.revision, years: e.engine.transactions.filter(t => t.yearEndRetirements).length,
      posting: e.engine.transactions.filter(t => t.annualOffseasonPosting).length };
  })).toEqual({ revision: 3, years: 1, posting: 1 });
});

test('save generations: year-end retirement review is required from the inbox before new posting', async ({ page }) => {
  await page.goto('/'); await mount(page);
  await page.getByRole('button', { name: '受信箱へ', exact: true }).click();
  await expect(page.getByRole('region', { name: '年度の海外挑戦' })).toBeVisible();
  await expect(page.getByRole('button', { name: '海外挑戦の希望を確認する', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '期末の引退判断へ', exact: true }).click();
  await expect(page.getByRole('region', { name: '期末の引退判断', exact: true })).toBeVisible();
  expect(await page.evaluate(() => ({ revision: window.yearEndHarness.current().contractEconomy.revision,
    prepared: window.yearEndHarness.current().contractEconomy.engine.transactions.some(t => t.annualPostingPhase) })))
    .toEqual({ revision: 1, prepared: false });
  await page.getByRole('button', { name: '引退を受け入れる', exact: true }).click();
  await page.getByRole('button', { name: '期末の引退判断を確認する' }).click();
  await page.getByRole('dialog').getByRole('button', { name: '引退判断を保存する' }).click();
  await expect(page.getByRole('region', { name: '保存済みの期末引退結果' })).toBeVisible();
  await page.getByRole('button', { name: '受信箱へ', exact: true }).click();
  await page.getByRole('button', { name: '海外挑戦の希望を確認する', exact: true }).click();
  await page.getByRole('region', { name: '海外挑戦の希望確認', exact: true }).getByRole('button', { name: '希望を確認して保存する', exact: true }).click();
  await expect(page.getByRole('region', { name: '年度の海外挑戦' }).getByRole('status')).toContainText('希望確認済み');
  expect(await page.evaluate(() => window.yearEndHarness.current().contractEconomy.revision)).toBe(3);
});
