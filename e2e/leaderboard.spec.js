import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { mainNavigation, reloadAndLoad, saveHub } from './helpers/progression';

async function setup(page) {
  const fixture = JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/new-game.json.gz', import.meta.url))));
  const mine = fixture.teams.find(t => t.id === fixture.myId);
  const used = new Set([...(mine.lineupDh || []), ...(mine.lineupNoDh || []), ...(mine.rotation || [])]);
  const batter = mine.players.find(p => !p.isPitcher && !used.has(p.id));
  const pitcher = mine.players.find(p => p.isPitcher && !used.has(p.id));
  if (!batter || !pitcher) throw new Error('fixture needs two bench players');
  batter.name = '降格野手'; Object.assign(batter.stats, { PA: 10, AB: 10, H: 4, HR: 3 });
  batter.stats2 = { PA: 100, HR: 99 };
  pitcher.name = '降格ゼロ投手'; Object.assign(pitcher.stats, { IP: 5, BF: 15, SV: 0, HLD: 0, QS: 0, Kp: 0 });
  mine.players = mine.players.filter(p => p !== batter && p !== pitcher);
  mine.farm.push(batter, pitcher);
  const farmOnly = mine.farm.find(p => p !== batter && p !== pitcher && !p.isPitcher);
  farmOnly.name = '二軍のみ野手'; farmOnly.stats2 = { PA: 200, HR: 200 };
  const missing = mine.players.find(p => p.isPitcher);
  missing.name = '未記録投手'; Object.assign(missing.stats, { IP: 5, BF: 15, SV: null, HLD: null, QS: null, Kp: null });
  await page.goto('/');
  await page.evaluate(async fixture => {
    const { saveGame } = await import('/baseball-manager/src/engine/saveload.js');
    if (!(await saveGame(fixture)).ok) throw new Error('fixture save failed');
  }, fixture);
  await reloadAndLoad(page);
  return { batterId: batter.id, pitcherId: pitcher.id };
}

async function openLeaderboard(page, mobile) {
  await mainNavigation(page, mobile).getByRole('button', { name: '成績', exact: true }).click();
  await page.locator('.tabs-nav').getByRole('button', { name: 'ランキング', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'リーグ成績', exact: true })).toBeVisible();
}

async function checkLeaderboard(page) {
  const table = page.locator('.detail-leaders table');
  await page.getByRole('button', { name: '本塁打で並び替え', exact: true }).click();
  await expect(table.locator('tbody tr').first()).toContainText('降格野手');
  await expect(table.locator('tbody')).not.toContainText('二軍のみ野手');
  const batterRow = table.getByRole('row', { name: '降格野手の詳細を開く', exact: true });
  await expect(batterRow.locator('[data-metric="HR"]')).toHaveText('3');
  await page.getByRole('tab', { name: '投手', exact: true }).click();
  await page.getByRole('button', { name: '詳細指標', exact: true }).click();
  await page.locator('.league-leading > summary').click();
  for (const label of ['S', 'H', 'QS', '奪三振']) {
    await page.getByRole('button', { name: `${label}で並び替え`, exact: true }).click();
    await expect(table.locator('tbody tr').first()).toContainText('降格ゼロ投手');
    await expect(table.locator('tbody tr').last()).toContainText('未記録投手');
    await expect(page.locator('.league-leading-list').getByRole('button', { name: '降格ゼロ投手の詳細を開く', exact: true })).toBeVisible();
    await expect(page.locator('.league-leading-list').getByRole('button', { name: '未記録投手の詳細を開く', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: `${label}で並び替え`, exact: true }).click();
    await expect(table.locator('tbody tr').last()).toContainText('未記録投手');
  }
}

for (const width of [360, 390, 1440]) {
  test(`first-team season leaderboard survives save/reload at ${width}px`, async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width, height: width === 360 ? 800 : width === 390 ? 844 : 900 });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const ids = await setup(page);
    const before = await saveHub(page);
    await openLeaderboard(page, width < 768);
    await checkLeaderboard(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('leaderboard-after.png'), fullPage: true });
    await page.getByRole('tab', {name:'打者',exact:true}).click();
    const batterOpen=page.locator('.league-player-button').filter({hasText:'降格野手'});
    await batterOpen.click();
    const detail=page.locator('.player-modal-card');
    await detail.getByRole('button',{name:'＋ 比較',exact:true}).click();
    await detail.getByRole('button',{name:'元の画面に戻る',exact:true}).click();
    await expect(batterOpen).toBeFocused();
    await page.getByRole('tab',{name:'投手',exact:true}).click();
    const pitcherOpen=page.locator('.league-player-button').filter({hasText:'降格ゼロ投手'});
    await pitcherOpen.click();await detail.getByRole('button',{name:'＋ 比較',exact:true}).click();
    await page.keyboard.press('Escape');await expect(pitcherOpen).toBeFocused();
    await page.getByRole('button',{name:'2人を比較',exact:true}).click();
    await expect(page.getByRole('dialog',{name:'選手比較',exact:true})).toContainText(`一軍・${before.year}年`);
    await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'2人を比較',exact:true})).toBeFocused();
    await page.getByRole('button',{name:'クリア',exact:true}).click();
    const saved = await saveHub(page);
    expect(saved.teams).toEqual(before.teams);
    const mine = saved.teams.find(t => t.id === saved.myId);
    expect(mine.players.map(p => p.id)).not.toContain(ids.batterId);
    expect(mine.farm.find(p => p.id === ids.batterId).stats.HR).toBe(3);
    expect(mine.farm.find(p => p.id === ids.pitcherId).stats.SV).toBe(0);
    await reloadAndLoad(page);
    await openLeaderboard(page, width < 768);
    await checkLeaderboard(page);
    expect((await saveHub(page)).teams).toEqual(before.teams);
    await mainNavigation(page,width < 1024).getByRole('button',{name:/^編成/}).click();
    await expect(page.locator('.roster-overview')).toBeVisible();
    expect(errors).toEqual([]);
  });
}
