import { test, expect } from '@playwright/test';

async function mount(page, options = {}) {
  await page.evaluate(async options => {
    const { tradeFixture } = await import('/baseball-manager/src/engine/__tests__/fixtures/tradeWorld.js');
    const { saveGame, loadGame } = await import('/baseball-manager/src/engine/saveload.js');
    const { mountTradeView } = await import('/baseball-manager/tests/helpers/trade-hook-harness.jsx');
    const world = options.reload ? await loadGame() : tradeFixture();
    if (options.mailbox && !options.reload) world.mailbox = ['first', 'offer'].map(id => ({ id, type: 'trade',
      title: id === 'first' ? '最初のトレード提案' : '相手球団からのトレード提案', read: false,
      offer: { from: world.teams[1], want: [world.teams[0].players[0]], offer: [world.teams[1].players[0]], cash: 5000000 } }));
    window.tradeHarness?.unmount();
    if (!options.reload && !(await saveGame(world, { skipCompression: true })).ok) throw Error('save failed');
    window.tradeHarness = mountTradeView(world, options);
  }, options);
}
async function open(page) {
  await page.getByRole('button', { name: '相手球団と交渉する', exact: true }).click();
  await page.getByRole('checkbox', { name: '放出選手を放出候補に選ぶ', exact: true }).check();
  await page.getByRole('button', { name: '獲得候補を選ぶ', exact: true }).click();
  await page.getByRole('checkbox', { name: '獲得選手を獲得候補に選ぶ', exact: true }).check();
  await page.getByLabel('支払金額（万円）', { exact: true }).fill('500');
  await page.getByRole('button', { name: 'トレードを提案する', exact: true }).click();
}
const confirm = page => page.getByRole('region', { name: 'トレード条件の最終確認', exact: true });
async function capture(page, info, stage, width) {
  if (process.env.TRADE_CAPTURE && info.project.name === 'chromium')
    await page.screenshot({ path: `${process.env.TRADE_CAPTURE}/${width}-${stage}.png`, fullPage: true });
}
async function savedTrade(page) {
  return page.evaluate(async () => {
    const { loadGame } = await import('/baseball-manager/src/engine/saveload.js');
    const { contractLiabilityRows } = await import('/baseball-manager/src/engine/contractLedger.js');
    const w = await loadGame(), e = w.contractEconomy.engine;
    return { owners: w.teams.map(t => t.players[0].id), cash: e.spending.oneOffCosts.map(c => c.amountManYen),
      salaries: contractLiabilityRows(e.spending.ledger).filter(r => r.playerId === 0).map(r => r.amountManYen),
      receipts: e.transactions.length, history: w.seasonHistory.transfers.length, news: w.news.length };
  });
}
for (const width of [360, 390, 1440]) test(`save generations: human trade quote, failed write, retry and reload at ${width}px`, async ({ page }, info) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width, height: width === 360 ? 800 : width === 390 ? 844 : 900 }); await page.goto('/');
  await mount(page, { legacy: true }); await open(page); await capture(page, info, 'before', width);
  await mount(page, { reload: true }); await open(page);
  await expect(confirm(page)).toContainText('5,484万円'); await expect(confirm(page)).toContainText('4,516万円');
  await expect(confirm(page)).toContainText('2028年度');
  await capture(page, info, 'after', width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.evaluate(() => {
    window.tradeRoot = localStorage.getItem('baseball_manager_v1'); window.tradeWrite = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'baseball_manager_v1') throw new DOMException('full', 'QuotaExceededError');
      return window.tradeWrite.call(this, key, value);
    };
  });
  await page.getByRole('button', { name: '確認して提案する', exact: true }).click();
  await expect(confirm(page)).toContainText('保存できませんでした');
  expect(await page.evaluate(() => localStorage.getItem('baseball_manager_v1') === window.tradeRoot)).toBe(true);
  expect(await page.evaluate(() => window.tradeHarness.current().teams[0].players[0].id)).toBe(0);
  await capture(page, info, 'failed', width);
  await page.evaluate(() => { Storage.prototype.setItem = window.tradeWrite; });
  await page.getByRole('button', { name: '同じ条件で保存を再試行する', exact: true }).click();
  await expect(page.getByText('トレード成立！', { exact: true })).toBeVisible();
  await page.reload(); await mount(page, { reload: true });
  expect(await savedTrade(page)).toEqual({ owners: ['b', 0], cash: [500, -500], salaries: [5484, 4516], receipts: 1, history: 1, news: 1 });
  expect(errors).toEqual([]);
});
test('save generations: human trade rejects confirmation after another contract', async ({ page }) => {
  await page.goto('/'); await mount(page); await open(page);
  await page.evaluate(async () => {
    const gs = window.tradeHarness.current(); const { renewalEnvelope } = await import('/baseball-manager/src/engine/__tests__/fixtures/economyWorld.js');
    if (!(await gs.commitEconomyCommand(renewalEnvelope(gs))).ok) throw Error('renewal failed');
    window.tradeRoot = localStorage.getItem('baseball_manager_v1');
  });
  await expect(confirm(page)).toContainText('状態が変更');
  await expect(page.getByRole('button', { name: '確認して提案する', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => ({ same: localStorage.getItem('baseball_manager_v1') === window.tradeRoot,
    owner: window.tradeHarness.current().teams[0].players[0].id, receipts: window.tradeHarness.current().contractEconomy.engine.transactions.length }))).toEqual({ same: true, owner: 0, receipts: 1 });
});
test('save generations: human trade acknowledgement recovery keeps cash and transfer history exactly once', async ({ page }) => {
  await page.goto('/'); await mount(page); await open(page);
  await page.evaluate(() => {
    window.tradeRead = Storage.prototype.getItem; let interrupted = false;
    Storage.prototype.getItem = function (key) {
      if (key === 'baseball_manager_v1' && window.tradeHarness.current().contractEconomy.revision === 1 && !interrupted) { interrupted = true; throw Error('ack'); }
      return window.tradeRead.call(this, key);
    };
  });
  await page.getByRole('button', { name: '確認して提案する', exact: true }).click();
  await expect(confirm(page)).toContainText('復旧してください');
  await page.evaluate(() => { Storage.prototype.getItem = window.tradeRead; window.tradeRoot = localStorage.getItem('baseball_manager_v1'); });
  await page.getByRole('button', { name: '保存済みのトレードを復旧する', exact: true }).click();
  await expect(page.getByText('トレード成立！', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('baseball_manager_v1') === window.tradeRoot)).toBe(true);
  await page.reload(); await mount(page, { reload: true });
  expect(await savedTrade(page)).toEqual({ owners: ['b', 0], cash: [500, -500], salaries: [5484, 4516], receipts: 1, history: 1, news: 1 });
});
for (const decline of [false, true]) test(`save generations: human trade mail route ${decline ? 'declines' : 'accepts'} with the common saved confirmation`, async ({ page }) => {
  await page.goto('/'); await mount(page, { mailbox: true });
  await page.getByRole('button', { name: /最初のトレード提案/ }).click();
  await expect.poll(() => page.evaluate(() => {
    const gs = window.tradeHarness.current(); return !gs.saveDirty && !gs.saveQueueState.isSaving && gs.contractEconomy.revision === 1;
  })).toBe(true);
  const back = page.getByRole('button', { name: '一覧に戻る', exact: true });
  if (await back.isVisible()) await back.click();
  await page.getByRole('button', { name: /相手球団からのトレード提案/ }).click();
  expect(await page.evaluate(async () => {
    const { loadGame } = await import('/baseball-manager/src/engine/saveload.js');
    return { live: window.tradeHarness.current().contractEconomy.revision, saved: (await loadGame()).contractEconomy.revision };
  })).toEqual({ live: 2, saved: 1 });
  await expect(page.getByText('トレード画面で年度別の負担を確認してから、承諾・辞退してください。')).toBeVisible();
  await page.getByRole('button', { name: 'トレード画面で検討する', exact: true }).click();
  await page.getByRole('button', { name: decline ? '辞退内容を確認する' : '承諾内容を確認する', exact: true }).click();
  if (!decline) await page.evaluate(() => {
    window.tradeRoot = localStorage.getItem('baseball_manager_v1'); window.tradeWrite = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'baseball_manager_v1') throw new DOMException('full', 'QuotaExceededError');
      return window.tradeWrite.call(this, key, value);
    };
  });
  await page.getByRole('button', { name: decline ? '辞退を確定する' : '承諾を確定する', exact: true }).click();
  if (!decline) {
    await expect(confirm(page)).toContainText('保存できませんでした');
    expect(await page.evaluate(() => localStorage.getItem('baseball_manager_v1') === window.tradeRoot)).toBe(true);
    await page.evaluate(() => { Storage.prototype.setItem = window.tradeWrite; });
    await page.getByRole('button', { name: '同じ条件で保存を再試行する', exact: true }).click();
  }
  await expect(page.getByText('この提案は対応済みです。再実行はできません。', { exact: true })).toBeVisible();
  await page.reload(); await mount(page, { reload: true });
  expect(await page.evaluate(() => ({ owner: window.tradeHarness.current().teams[0].players[0].id,
    done: window.tradeHarness.current().mailbox[1].resolved, receipts: window.tradeHarness.current().contractEconomy.engine.transactions.length })))
    .toEqual({ owner: decline ? 0 : 'b', done: true, receipts: 1 });
});
