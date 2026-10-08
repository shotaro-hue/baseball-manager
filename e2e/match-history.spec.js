import { test, expect } from '@playwright/test';
import { startNewGame, runSingle, runBatch, startSingle, saveHub, reloadAndLoad, loadFixture, readSave } from './helpers/progression';

test.setTimeout(180_000); // Includes three actual mode transitions and a manual tactical game.
const history = s => ({ gameResultsMap: s.gameResultsMap, allTeamResultsMap: s.allTeamResultsMap,
  allTeamBoxScoresMap: s.allTeamBoxScoresMap, scheduleArchive: s.scheduleArchive,
  recentResults: s.recentResults, allStarDone: s.allStarDone, allStarResult: s.allStarResult,
  lastPressDay: s.lastPressDay, pressEvent: s.pressEvent });
async function roundTrip(page, expectedDays) {
  const before = await saveHub(page);
  expect(before.gameResultsMap).toBeDefined();
  expect(Object.keys(before.gameResultsMap)).toHaveLength(expectedDays);
  for (const team of before.teams) expect(Object.keys(before.allTeamResultsMap[team.id])).toHaveLength(expectedDays);
  await reloadAndLoad(page);
  const after = await saveHub(page);
  expect(history(after)).toEqual(history(before));
  expect(after.teams).toEqual(before.teams);
  expect(after.gameDay).toBe(before.gameDay);
  return after;
}

test('T1/T2/T3/T4 normal, batch and tactical history survive real save/reload without gaps', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await startNewGame(page);
  await runSingle(page, false);
  const one = await roundTrip(page, 1);
  await runBatch(page, false);
  const six = await roundTrip(page, 6);
  expect(six.gameResultsMap[1]).toEqual(one.gameResultsMap[1]);
  // Result detail must be reachable from the batch screen's selector, not only
  // visible in the calendar's React state (the F2 regression).
  await startSingle(page, false);
  await page.getByRole('button', { name: /🎮 試合モード/ }).click();
  const finish = page.getByRole('button', { name: /試合終了 → 結果へ/ });
  await expect.poll(async () => {
    if (await finish.count()) return true;
    const resume = page.getByRole('button', { name: '▶ 続行', exact: true });
    if (await resume.count()) {
      if (await resume.isEnabled()) await resume.click();
      else {
        await page.getByRole('button', { name: '🔄 投手交代', exact: true }).click();
        await page.getByRole('button', { name: 'この投手に交代', exact: true }).first().click();
      }
    } else {
      const auto = page.getByRole('button', { name: '▶ 自動進行', exact: true });
      if (await auto.count()) await auto.click();
    }
    return false;
  }, { timeout: 60_000, intervals: [200] }).toBe(true);
  await expect(finish).toBeVisible(); await finish.click();
  await page.getByRole('button', { name: 'ホームに戻る', exact: true }).click();
  const seven = await roundTrip(page, 7);
  expect(seven.gameResultsMap[1]).toEqual(one.gameResultsMap[1]);
  expect(seven.recentResults.map(r => r.gameNo)).toEqual([7, 6, 5, 4, 3]);
  expect(errors).toEqual([]);
});

test('T5 actual All-Star event and answered press state survive reload', async ({ page }) => {
  await loadFixture(page, 'allstar');
  const press = page.getByRole('dialog', { name: '記者会見', exact: true });
  await expect(press).toBeVisible();
  await press.getByRole('button').filter({ hasNotText: '回答する' }).first().click();
  await press.getByRole('button', { name: '回答する', exact: true }).click();
  await startSingle(page, false);
  await page.getByRole('button', { name: /オートシムモード/ }).click();
  await expect(page.getByText(/年 プロ野球オールスターゲーム/).first()).toBeVisible();
  await page.getByRole('button', { name: '続ける →', exact: true }).click();
  const before = await saveHub(page);
  expect(before.allStarDone).toBe(true); expect(before.allStarResult.rosters).toBeDefined();
  expect(before.lastPressDay).toBeGreaterThan(0);
  await reloadAndLoad(page);
  expect(await press.count()).toBe(0);
  expect(history(await saveHub(page))).toEqual(history(before));
});

test('T11 legacy version-4 fixture with no history remains playable and gains history on first save', async ({ page }) => {
  await loadFixture(page, 'legacy');
  await expect(page.locator('.topbar')).toContainText('残り143試合');
  const loaded = await readSave(page);
  expect(loaded.gameResultsMap).toEqual({});
  await runSingle(page, false); await roundTrip(page, 1);
});
