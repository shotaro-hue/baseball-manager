import { test, expect } from '@playwright/test';

async function mount(page, options = {}) {
  await page.evaluate(async options => {
    const { requestGenerationWorld } = await import('/baseball-manager/src/engine/__tests__/fixtures/postingRequestGeneration.js');
    const { saveGame, loadGame } = await import('/baseball-manager/src/engine/saveload.js');
    const { mountTradeView } = await import('/baseball-manager/tests/helpers/trade-hook-harness.jsx');
    window.wishHarness?.unmount();
    if (!options.reload) {
      const saved = await saveGame(requestGenerationWorld(options), { skipCompression: true });
      if (!saved.ok) throw Error(`save failed: ${JSON.stringify(saved)}`);
    }
    window.wishHarness = mountTradeView(await loadGame(), { mailbox: true, legacy: options.legacy });
  }, options);
}
async function durable(page) {
  await expect.poll(() => page.evaluate(async () => {
    const { getSaveQueueSnapshot } = await import('/baseball-manager/src/engine/saveload.js');
    const q = getSaveQueueSnapshot(); return q.isSaving || q.hasQueuedSave;
  })).toBe(false);
  return page.evaluate(async () => {
    const { loadGame } = await import('/baseball-manager/src/engine/saveload.js');
    const w = await loadGame(); if (!w) throw Error('cold load failed');
    return { teams: w.teams, economy: w.contractEconomy };
  });
}
async function capture(page, info, width, stage) {
  const screenshot = await page.screenshot({ fullPage: true, ...(process.env.POSTING_REQUEST_CAPTURE && info.project.name === 'chromium'
    ? { path: `${process.env.POSTING_REQUEST_CAPTURE}/${width}-${stage}.png` } : {}) });
  await info.attach(`posting-wishes-${width}-${stage}`, { body: screenshot, contentType: 'image/png' });
}
for (const width of [360, 390, 1440]) test(`save generations: annual posting wishes save, retry and connect to market at ${width}px`, async ({ page }, info) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width, height: width === 360 ? 800 : width === 390 ? 844 : 900 });
  await page.goto('/'); await mount(page, { legacy: true });
  const before = await durable(page); await capture(page, info, width, 'before');
  await mount(page, { reload: true });
  await capture(page, info, width, 'after');
  const check = page.getByRole('button', { name: '海外挑戦の希望を確認する', exact: true });
  await check.click();
  const confirmation = page.getByRole('region', { name: '海外挑戦の希望確認', exact: true });
  await expect(confirmation).toContainText('希望者がいない場合も');
  await expect(confirmation.getByRole('heading')).toBeFocused();
  await page.keyboard.press('Escape'); await expect(confirmation).toHaveCount(0);
  await expect(check).toBeFocused();
  await page.keyboard.press('Enter'); await expect(confirmation).toBeVisible();
  await page.evaluate(() => {
    window.wishRoot = localStorage.getItem('baseball_manager_v1'); window.wishWrite = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'baseball_manager_v1') throw new DOMException('full', 'QuotaExceededError');
      return window.wishWrite.call(this, key, value);
    };
  });
  await page.getByRole('button', { name: '希望を確認して保存する', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('希望を保存できませんでした');
  expect(await page.evaluate(() => localStorage.getItem('baseball_manager_v1') === window.wishRoot)).toBe(true);
  expect(await durable(page)).toEqual(before); await capture(page, info, width, 'failure');
  await page.evaluate(() => { Storage.prototype.setItem = window.wishWrite; });
  await page.getByRole('button', { name: '同じ希望判定で保存を再試行する', exact: true }).click();
  await expect(page.getByText(/希望確認済み/)).toBeVisible();
  const after = await durable(page), requests = after.economy.engine.postingApplications;
  expect(requests.length).toBeGreaterThan(0); expect(after.economy.revision).toBe(before.economy.revision + 1);
  expect(after.economy.engine.spending).toEqual(before.economy.engine.spending);
  expect(after.economy.incomeReceipts).toEqual(before.economy.incomeReceipts);
  await page.reload(); await mount(page, { reload: true });
  expect(await durable(page)).toEqual(after); await expect(check).toHaveCount(0);
  await capture(page, info, width, 'reload');
  await page.getByRole('button', { name: /【ポスティング申請】/ }).first().click();
  await page.getByRole('button', { name: '承認内容を確認する', exact: true }).click();
  await page.getByRole('button', { name: '承認を確定する', exact: true }).click();
  await expect(page.locator('.reading-detail')).toContainText('球団承認・市場結果待ち');
  await page.getByRole('button', { name: '海外交渉の結果を確認する', exact: true }).click();
  await page.getByRole('button', { name: '海外交渉を進めて保存する', exact: true }).click();
  await expect(page.locator('.reading-detail')).toContainText('市場評価');
  expect((await durable(page)).economy.engine.postingMarketResults).toHaveLength(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
test('save generations: annual posting wishes retain a zero-request year after reload', async ({ page }) => {
  await page.goto('/'); await mount(page, { interested: false });
  await page.getByRole('button', { name: '海外挑戦の希望を確認する', exact: true }).click();
  await page.getByRole('button', { name: '希望を確認して保存する', exact: true }).click();
  await expect(page.getByText(/希望者 0人/)).toBeVisible();
  const saved = await durable(page); expect(saved.economy.engine.transactions).toHaveLength(1);
  await page.reload(); await mount(page, { reload: true });
  await expect(page.getByText(/希望者 0人/)).toBeVisible(); expect(await durable(page)).toEqual(saved);
  await expect(page.getByRole('button', { name: '海外挑戦の希望を確認する', exact: true })).toHaveCount(0);
});
test('save generations: annual posting wishes use real roster birth dates and missing overseas traits', async ({ page }) => {
  await page.goto('/'); await mount(page, { realRoster: true, natural: true, realClubCount: 2 });
  const before = await durable(page);
  await page.getByRole('button', { name: '海外挑戦の希望を確認する', exact: true }).click();
  await page.getByRole('button', { name: '希望を確認して保存する', exact: true }).click();
  await expect(page.getByText(/希望確認済み/)).toBeVisible();
  const after = await durable(page), generation = after.economy.engine.transactions.find(t => t.generatedPostingRequests).generatedPostingRequests;
  expect(generation.candidates.length).toBeGreaterThan(40);
  expect(generation.candidates.some(c => c.inputs.overseas === null && c.evaluation.preference.source === 'game-estimate')).toBe(true);
  expect(after.teams.slice(1)).toEqual(before.teams.slice(1));
  expect(after.economy.engine.spending).toEqual(before.economy.engine.spending);
  await page.reload(); await mount(page, { reload: true }); expect(await durable(page)).toEqual(after);
});
