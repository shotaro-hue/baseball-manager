import { test, expect } from '@playwright/test';

async function mount(page, options = {}) {
  await page.evaluate(async options => {
    const { requestGenerationWorld } = await import('/baseball-manager/src/engine/__tests__/fixtures/postingRequestGeneration.js');
    const { saveGame, loadGame } = await import('/baseball-manager/src/engine/saveload.js');
    const { mountTradeView } = await import('/baseball-manager/tests/helpers/trade-hook-harness.jsx');
    window.wishHarness?.unmount();
    if (!options.reload) {
      const world = options.budgetHeadroom !== undefined
        ? (await import('/baseball-manager/src/engine/__tests__/fixtures/cpuPostingBudget.js')).cpuPostingBudgetWorld({ headroom: options.budgetHeadroom })
        : requestGenerationWorld(options);
      const saved = await saveGame(world, { skipCompression: true });
      if (!saved.ok) throw Error(`save failed: ${JSON.stringify(saved)}`);
    }
    window.wishHarness = mountTradeView(await loadGame(), { mailbox: true, legacy: options.legacy });
  }, options);
}
for (const budgetHeadroom of [0, 840]) test(`save generations: annual posting CPU future budget ${budgetHeadroom} preserves human wishes after save retry`, async ({ page }) => {
  await page.goto('/'); await mount(page, { budgetHeadroom });
  const before = await durable(page);
  await page.getByRole('button', { name: '海外挑戦の希望を確認する', exact: true }).click();
  await page.evaluate(() => {
    window.budgetRoot = localStorage.getItem('baseball_manager_v1'); window.budgetWrite = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'baseball_manager_v1') throw new DOMException('full', 'QuotaExceededError');
      return window.budgetWrite.call(this, key, value);
    };
  });
  await page.getByRole('button', { name: '希望を確認して保存する', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('希望を保存できませんでした');
  expect(await page.evaluate(() => localStorage.getItem('baseball_manager_v1') === window.budgetRoot)).toBe(true);
  expect(await durable(page)).toEqual(before);
  await page.evaluate(() => { Storage.prototype.setItem = window.budgetWrite; });
  await page.getByRole('button', { name: '同じ希望判定で保存を再試行する', exact: true }).click();
  await expect(page.getByText(/希望確認済み/)).toBeVisible();
  const after = await durable(page), e = after.economy.engine, phase = e.transactions.at(-1).annualPostingPhase;
  expect(after.economy.revision).toBe(before.economy.revision + 1);
  expect(phase.decisions.map(d => d.decision)).toEqual(budgetHeadroom ? ['approve', 'approve'] : ['reject', 'reject']);
  expect(phase.marketIds).toHaveLength(budgetHeadroom ? 2 : 0);
  if (!budgetHeadroom) {
    expect(phase.decisions.map(d => d.reason)).toEqual(['future-budget', 'future-budget']);
    expect(e.spending).toEqual(before.economy.engine.spending);
    await page.locator('summary').filter({ hasText: 'CPU球団の判断・交渉結果' }).click();
    await expect(page.getByText(/残存保証と欠員補充を含む将来年度の予算を確保できないため拒否/).first()).toBeVisible();
  }
  const humanRequests = e.postingApplications.filter(r => r.kind === 'request' && r.teamId === 0);
  expect(humanRequests.length).toBeGreaterThan(0);
  expect(e.postingApplications.filter(r => r.kind === 'decision').every(d => !humanRequests.some(r => r.id === d.requestId))).toBe(true);
  await page.reload(); await mount(page, { reload: true }); expect(await durable(page)).toEqual(after);
});
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
  expect(after.teams[0].budget).toBe(before.teams[0].budget);
  expect(after.economy.budgetPolicies).toEqual(before.economy.budgetPolicies);
  expect(after.economy.engine.transactions.filter(t => t.generatedPostingRequests)).toHaveLength(2);
  const cpuRequests = requests.filter(r => r.kind === 'request' && r.teamId === 1);
  expect(cpuRequests.length).toBeGreaterThan(0);
  expect(after.economy.engine.postingApplications.some(r => r.kind === 'decision')).toBe(true);
  expect(after.economy.engine.transactions.at(-1).annualPostingPhase.marketIds.length).toBeGreaterThan(0);
  expect(after.economy.incomeReceipts.every(r => r.teamId === 1)).toBe(true);
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
  const settled = await durable(page);
  expect(settled.economy.engine.postingMarketResults.filter(r => r.teamId === 0)).toHaveLength(1);
  expect(settled.economy.engine.postingMarketResults.filter(r => r.teamId === 1)).toEqual(after.economy.engine.postingMarketResults);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
test('save generations: annual posting wishes retain a zero-request year after reload', async ({ page }) => {
  await page.goto('/'); await mount(page, { interested: false });
  await page.getByRole('button', { name: '海外挑戦の希望を確認する', exact: true }).click();
  await page.getByRole('button', { name: '希望を確認して保存する', exact: true }).click();
  await expect(page.getByText(/希望者 0人/)).toBeVisible();
  const saved = await durable(page); expect(saved.economy.engine.transactions).toHaveLength(3);
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
  expect(after.economy.engine.transactions.filter(t => t.generatedPostingRequests)).toHaveLength(2);
  expect(after.teams[0].budget).toBe(before.teams[0].budget);
  expect(after.economy.engine.transactions.at(-1).annualPostingPhase.decisions.every(d => d.inputs.teamId === 1)).toBe(true);
  await page.reload(); await mount(page, { reload: true }); expect(await durable(page)).toEqual(after);
});

test('save generations: annual posting entry saves CPU results, waits for human judgement and blocks unfinished rollover', async ({ page }) => {
  await page.goto('/'); await mount(page);
  const before = await durable(page);
  expect(await page.evaluate(() => window.wishHarness.offseason().handleRetirePhaseNext({}))).toBe(false);
  await expect(page.getByText(/希望確認済み/)).toBeVisible();
  await page.getByText(/CPU球団の判断・交渉結果/).click();
  await expect(page.getByRole('region', { name: '年度の海外挑戦' })).toContainText('必要な役割人数を維持');
  const saved = await durable(page);
  expect(saved.economy.revision).toBe(before.economy.revision + 1);
  const rows = await page.evaluate(async () => {
    const { postingApplicationViews } = await import('/baseball-manager/src/engine/annualPostingApplications.js');
    const gs = window.wishHarness.current();
    return { year: gs.year, rows: postingApplicationViews(gs.contractEconomy.engine), notice: gs.notif.msg };
  });
  expect(rows.year).toBe(2026); expect(rows.notice).toContain('未接続'); expect(rows.notice).toContain('受信箱');
  expect(rows.rows.filter(r => r.teamId === 0).every(r => r.status === 'pending')).toBe(true);
  expect(rows.rows.filter(r => r.teamId === 1).every(r => !['pending', 'approved'].includes(r.status))).toBe(true);
  expect(await page.evaluate(() => window.wishHarness.offseason().handleNextYear())).toBe(false);
  expect(await durable(page)).toEqual(saved);
  await page.reload(); await mount(page, { reload: true });
  expect(await durable(page)).toEqual(saved);
});
test('save generations: twelve-club CPU posting measures responsive preparation and a single root publication', async ({ page }, info) => {
  test.setTimeout(90000);
  await page.goto('/'); await mount(page, { realRoster: true, natural: true });
  await durable(page);
  await page.evaluate(() => {
    const start = performance.now(); let last = start;
    window.postingPerf = { start, ticks: 0, maxGapMs: 0, publications: 0 };
    window.postingTicker = setInterval(() => {
      const now = performance.now(); window.postingPerf.ticks++;
      window.postingPerf.maxGapMs = Math.max(window.postingPerf.maxGapMs, now - last); last = now;
    }, 20);
    window.postingPerfWrite = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'baseball_manager_v1') window.postingPerf.publications++;
      return window.postingPerfWrite.call(this, key, value);
    };
  });
  await page.getByRole('button', { name: '海外挑戦の希望を確認する', exact: true }).click();
  await page.getByRole('button', { name: '希望を確認して保存する', exact: true }).click();
  await expect(page.getByText(/希望確認済み/)).toBeVisible({ timeout: 60000 });
  const measurement = await page.evaluate(() => {
    clearInterval(window.postingTicker); Storage.prototype.setItem = window.postingPerfWrite;
    const e = window.wishHarness.current().contractEconomy, phase = e.engine.transactions.at(-1).annualPostingPhase;
    return { ...window.postingPerf, elapsedMs: Math.round(performance.now() - window.postingPerf.start),
      clubs: phase.teamIds.length, cpuDecisions: phase.decisions.length, markets: phase.marketIds.length, revision: e.revision };
  });
  expect(measurement.clubs).toBe(12); expect(measurement.publications).toBe(1); expect(measurement.revision).toBe(1);
  expect(measurement.ticks).toBeGreaterThan(10);
  console.log(`POSTING_BROWSER_PERF ${info.project.name} ${JSON.stringify(measurement)}`);
  await info.attach('twelve-club-posting-performance', { body: JSON.stringify(measurement, null, 2), contentType: 'application/json' });
  const saved = await durable(page);
  expect(saved.economy.engine.transactions.filter(t => t.generatedPostingRequests)).toHaveLength(12);
  await page.reload(); await mount(page, { reload: true }); expect(await durable(page)).toEqual(saved);
});
