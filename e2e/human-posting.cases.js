import { test, expect } from '@playwright/test';

async function mount(page, options = {}) {
  await page.evaluate(async options => {
    const { postingUiWorld } = await import('/baseball-manager/src/engine/__tests__/fixtures/postingUi.js');
    const { qualifiedPostingWorld, marketResult } = await import('/baseball-manager/src/engine/__tests__/fixtures/postingMarketResults.js');
    const { reduceEconomyCommand } = await import('/baseball-manager/src/engine/contractEconomy.js');
    const { saveGame, loadGame } = await import('/baseball-manager/src/engine/saveload.js');
    const { mountTradeView } = await import('/baseball-manager/tests/helpers/trade-hook-harness.jsx');
    let w = options.reload ? await loadGame() : postingUiWorld(options);
    if (options.outcome && !options.reload) {
      const qualified = qualifiedPostingWorld(), extra = options.zero ? { overseasContract: { kind: 'minor', signingBonusUsdCents: 0 } } : {};
      const result = reduceEconomyCommand(qualified, marketResult(qualified, options.outcome, extra));
      if (!result.ok) throw Error(result.error); w = result.world;
    }
    window.postingHarness?.unmount();
    if (!options.reload && !(await saveGame(w, { skipCompression: true })).ok) throw Error('save failed');
    // Cold-load normalization is part of the actual input path.
    window.postingHarness = mountTradeView(await loadGame(), { mailbox: true });
  }, options);
}
const detail = page => page.locator('.reading-detail');
const open = page => page.getByRole('button', { name: /【ポスティング申請】/ }).click();
async function capture(page, info, stage, width) {
  const screenshot = await page.screenshot({ fullPage: true, ...(process.env.POSTING_CAPTURE
    ? { path: `${process.env.POSTING_CAPTURE}/${info.project.name}-${width}-${stage}.png` } : {}) });
  await info.attach(`posting-${width}-${stage}`, { body: screenshot, contentType: 'image/png' });
}
async function state(page) {
  // A new hook may still be publishing its normalized initial snapshot. Read
  // durable results after that writer finishes; loadGame rejects stale reads.
  await expect.poll(() => page.evaluate(async () => {
    const { getSaveQueueSnapshot } = await import('/baseball-manager/src/engine/saveload.js');
    const q = getSaveQueueSnapshot(); return q.isSaving || q.hasQueuedSave;
  })).toBe(false);
  return page.evaluate(async () => {
    const { loadGame, getLastLoadResult } = await import('/baseball-manager/src/engine/saveload.js');
    const w = await loadGame();
    if (!w) throw Error(`posting saved state unavailable: ${JSON.stringify(getLastLoadResult())}`);
    const e = w.contractEconomy;
    return { teams: w.teams, applications: e.engine.postingApplications, transactions: e.engine.transactions.length, income: e.incomeReceipts };
  });
}
for (const width of [360, 390, 1440]) test(`save generations: posting approval retries the same decision and reloads at ${width}px`, async ({ page }, info) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width, height: width === 360 ? 800 : width === 390 ? 844 : 900 });
  await page.goto('/'); await mount(page); const before = await state(page); await open(page);
  await expect(detail(page)).toContainText('球団判断待ち');
  await page.getByRole('button', { name: '承認内容を確認する', exact: true }).click();
  await expect(detail(page)).toContainText('承認だけで移籍・入金は確定しません');
  await capture(page, info, 'confirmation', width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.evaluate(() => {
    window.postingRoot = localStorage.getItem('baseball_manager_v1'); window.postingWrite = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'baseball_manager_v1') throw new DOMException('full', 'QuotaExceededError');
      return window.postingWrite.call(this, key, value);
    };
  });
  await page.getByRole('button', { name: '承認を確定する', exact: true }).click();
  await expect(detail(page)).toContainText('判断を保存できませんでした');
  expect(await page.evaluate(() => localStorage.getItem('baseball_manager_v1') === window.postingRoot)).toBe(true);
  expect((await state(page)).applications).toHaveLength(1); await capture(page, info, 'failed', width);
  await page.evaluate(() => { Storage.prototype.setItem = window.postingWrite; });
  await page.getByRole('button', { name: '同じ判断で保存を再試行する', exact: true }).click();
  await expect(detail(page)).toContainText('市場結果待ち');
  const after = await state(page); expect(after.applications).toHaveLength(2);
  expect(after.teams).toEqual(before.teams); expect(after.income).toEqual(before.income);
  await page.reload(); await mount(page, { reload: true }); await open(page);
  await expect(detail(page)).toContainText('市場結果待ち');
  await expect(page.getByRole('button', { name: '承認内容を確認する', exact: true })).toHaveCount(0);
  expect(await state(page)).toEqual(after); await capture(page, info, 'reload', width); expect(errors).toEqual([]);
});
test('save generations: posting refusal in the real roster preserves ownership, money and morale', async ({ page }) => {
  await page.goto('/'); await mount(page, { realRoster: true }); const before = await state(page);
  expect(before.teams[0].players.some(p => p.realPlayerId)).toBe(true);
  await open(page); await page.getByRole('button', { name: '拒否内容を確認する', exact: true }).click();
  await page.getByRole('button', { name: '拒否を確定する', exact: true }).click();
  await expect(detail(page)).toContainText('球団拒否');
  await page.reload(); await mount(page, { reload: true }); await open(page);
  await expect(detail(page)).toContainText('球団拒否');
  const after = await state(page); expect(after.teams).toEqual(before.teams); expect(after.income).toEqual(before.income);
  expect(after.applications.at(-1).decision).toBe('reject');
  await expect(page.getByRole('button', { name: '拒否内容を確認する', exact: true })).toHaveCount(0);
});
test('save generations: posting stale confirmation cannot override another application', async ({ page }) => {
  await page.goto('/'); await mount(page); await open(page);
  await page.getByRole('button', { name: '承認内容を確認する', exact: true }).click();
  await page.evaluate(async () => {
    const gs = window.postingHarness.current(), p = gs.teams[0].players[1];
    if (!(await gs.commitEconomyCommand({ saveId: gs.saveId, epoch: gs.contractEconomy.epoch, baseRevision: gs.contractEconomy.revision,
      transaction: { id: 'other-request', type: 'request-posting', teamId: gs.myId, playerId: p.id, contractId: p.contractId } })).ok) throw Error('other request failed');
  });
  await expect(detail(page)).toContainText('状態が変更されています');
  await expect(page.getByRole('button', { name: '承認を確定する', exact: true })).toBeDisabled();
  expect((await state(page)).applications.filter(a => a.kind === 'decision')).toHaveLength(0);
});
for (const [outcome, zero] of [['signed', false], ['no-offer', false], ['declined', false], ['signed', true]]) {
  test(`save generations: posting saved ${outcome}${zero ? ' zero minor' : ''} outcome is readable after reload`, async ({ page }, info) => {
    await page.goto('/'); await mount(page, { outcome, zero }); const before = await state(page); await open(page);
    const expected = outcome === 'signed' ? '2027年度限定の追加支出枠' : outcome === 'no-offer' ? '提示なし・不成立' : '本人辞退・不成立';
    await expect(detail(page)).toContainText(expected);
    if (outcome === 'signed') {
      await expect(detail(page)).toContainText('退団通知日 2026-12-01');
      await expect(detail(page)).toContainText('元契約終了日 2027-02-01');
    }
    if (zero) await expect(detail(page)).toContainText('球団受取譲渡金 0万円');
    await page.reload(); await mount(page, { reload: true }); await open(page);
    await expect(detail(page)).toContainText(expected);
    await expect(page.getByRole('button', { name: '承認内容を確認する', exact: true })).toHaveCount(0);
    expect(await state(page)).toEqual(before); await capture(page, info, `${outcome}${zero ? '-zero' : ''}`, 390);
  });
}
