import { test, expect } from '@playwright/test';
import { startNewGame, runSingle, saveHub, reloadAndLoad } from './helpers/progression';
import { annualSnapshot, progressAnnualBatch, finishAnnualOffseason } from './helpers/annual-journey';

test('annual journey actual 143 games, all clubs, offseason, next year and persisted reload', async ({ page }, testInfo) => {
  test.setTimeout(600_000);
  const mobile = testInfo.project.name === 'mobile-webkit';
  // This acceptance test checks progression/storage, not external font delivery.
  // Keep all application console errors fatal without relying on Google Fonts.
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({
    status: 200, contentType: 'text/css', body: '/* offline progression test */',
  }));
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', msg => {
    if (msg.text().startsWith('[annual-stage]')) console.info(msg.text());
    if (msg.type() === 'error') errors.push(msg.text());
  });
  await page.addInitScript(() => {
    let seed = 20261025;
    Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  });
  const checkpoints = [];
  const inspect = async (label, games) => {
    const s = await annualSnapshot(page);
    checkpoints.push({ label, ...s });
    expect(s.teams).toHaveLength(12);
    expect(s.duplicateIds).toEqual([]);
    for (const t of s.teams) {
      expect(t.wins + t.losses + t.draws, `club ${t.id} played`).toBe(games);
      expect(t.results, `club ${t.id} result map`).toBe(games);
      expect(Number.isFinite(t.budget), `club ${t.id} budget`).toBe(true);
    }
    expect(s.teams.reduce((n, t) => n + t.wins, 0)).toBe(s.teams.reduce((n, t) => n + t.losses, 0));
    expect(s.myResultCount).toBe(games);
    expect(s.farm.nextRound).toBe(games + 1);
    expect(s.farm.cards).toBe(games * 6);
    expect(s.receipt.status).toBe('complete');
    return s;
  };
  try {
    await startNewGame(page);
    await runSingle(page, mobile);
    await saveHub(page, { progressOnly: true });
    const first = await inspect('single', 1);
    await progressAnnualBatch(page, mobile, 100);
    await saveHub(page, { progressOnly: true });
    const mid = await inspect('101 games', 101);
    expect(mid.receipt.recordCount).toBeGreaterThan(first.receipt.recordCount);
    expect(mid.measuredBatting).toBeGreaterThan(0);
    expect(mid.farm.played).toBeGreaterThan(0);
    await reloadAndLoad(page);
    // Observe the state actually applied by App.handleLoad, including its
    // normalization, rather than comparing the same untouched disk root twice.
    await saveHub(page, { progressOnly: true });
    expect(await annualSnapshot(page)).toEqual(mid);
    await progressAnnualBatch(page, mobile, 42, { final: true });
    await page.getByRole('button', { name: '進行を保存', exact: true }).click();
    const end = await inspect('143 games', 143);
    expect(end.receipt.recordCount).toBeGreaterThan(mid.receipt.recordCount);
    await finishAnnualOffseason(page, end.year);
    await saveHub(page, { progressOnly: true });
    const next = await inspect('next year', 0);
    expect(next.year).toBe(end.year + 1);
    expect(next.gameDay).toBe(1);
    expect(next.saveId).toBe(end.saveId);
    expect(next.receiptRef).toEqual(end.receiptRef);
    expect(next.receipt).toEqual(end.receipt);
    expect(next.past).toContainEqual({ year: end.year, games: 143 });
    const standings = next.standings.find(s => s.year === end.year);
    expect([...standings.central, ...standings.pacific].map(t => t.wins + t.losses + t.draws)).toEqual(Array(12).fill(143));
    expect(next.farmArchives.find(a => a.year === end.year)?.nextRound).toBe(144);
    await reloadAndLoad(page);
    await saveHub(page, { progressOnly: true });
    expect(await annualSnapshot(page)).toEqual(next);
    await runSingle(page, mobile);
    await saveHub(page, { progressOnly: true });
    const reopened = await inspect('next year first game', 1);
    expect(reopened.year).toBe(next.year);
    expect(reopened.past).toEqual(next.past);
    expect(reopened.receipt.recordCount).toBeGreaterThan(end.receipt.recordCount);
    expect(reopened.receiptHead).not.toEqual(end.receiptHead);
    const retained = await page.evaluate(async ({ current, previous }) => {
      const refs = await (await import('/baseball-manager/src/engine/battedBallReceipts.js')).collectBattedBallReceiptKeys(current);
      return refs.get(previous.head.key) === previous.head.digest;
    }, { current: reopened.receiptRef, previous: end.receiptRef });
    expect(retained, 'next-year history includes the completed-season immutable root').toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await testInfo.attach('annual-checkpoints', { body: JSON.stringify({ checkpoints, errors }), contentType: 'application/json' });
  }
});
