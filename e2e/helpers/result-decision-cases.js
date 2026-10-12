import { test, expect } from '@playwright/test';
import { loadFixture, startSingle, saveHub, reloadAndLoad } from './progression';
import { decisionFixture, decisionScenarios } from '../../tests/fixtures/pitcherDecisions';
import { computeBoxScore } from '../../src/engine/postGame';

export async function resultDecisionRows(page) {
  const batting = page.getByRole('button', { name: '打者成績', exact: true });
  await expect(page.locator('.detail-result .card').filter({ has: batting }).locator('table').first()).toBeVisible();
  return page.locator('.detail-result .card').filter({ has: page.getByText('勝敗投手', { exact: true }) })
    .locator('.fsb').evaluateAll(rows => rows.map(row => {
      const spans = row.querySelectorAll('span');
      return spans[0].textContent + spans[1].textContent;
    }).sort());
}

export function savedDecisionRows(result, myId) {
  const isHome = result.homeId === myId;
  return [...(result.myPitching ?? (isHome ? result.homePitching : result.awayPitching)),
    ...(result.oppPitching ?? (isHome ? result.awayPitching : result.homePitching))]
    .filter(p => p.result).map(p => p.result + p.name).sort();
}

export function registerResultDecisionCases() {
  for (const width of [360, 390, 1440]) for (const isHome of [true, false]) {
    test(`FIX-S4 fixed result and box score agree ${width} home=${isHome}`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      for (const [scenario, sequence] of Object.entries(decisionScenarios)) {
        const { result, myTeam, oppTeam } = decisionFixture(sequence, isHome);
        const box = computeBoxScore(result.log, [], isHome ? myTeam.players : oppTeam.players,
          isHome ? oppTeam.players : myTeam.players, isHome ? result.score.my : result.score.opp,
          isHome ? result.score.opp : result.score.my);
        const expected = [...box.homePitching, ...box.awayPitching].filter(p => p.result).map(p => p.result + p.name).sort();
        await page.goto(`/baseball-manager/e2e/fixtures/fixs4/index.html?scenario=${encodeURIComponent(scenario)}&home=${isHome}`);
        expect(await resultDecisionRows(page)).toEqual(expected);
        await page.getByRole('button', { name: '投手成績', exact: true }).click();
        for (const decision of expected) {
          const row = page.locator('.detail-result tr').filter({ hasText: decision.slice(1) });
          await expect(row).toContainText(decision[0]);
          await expect(row).toBeVisible();
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        if (scenario === 'own relief loss') {
          await page.screenshot({ path: testInfo.outputPath(`result-${width}-${isHome}.png`), fullPage: true });
        }
        await page.getByRole('button', { name: '同じログの試合詳細', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: '試合詳細' });
        await expect(dialog).toBeVisible();
        await expect(dialog).toContainText(isHome ? 'ホーム' : 'ビジター');
        for (const decision of expected) {
          const row = dialog.locator('tr').filter({ hasText: decision.slice(1) });
          await expect(row).toContainText(decision[0]);
        }
        await page.getByRole('button', { name: '試合詳細を閉じる' }).click();
        await expect(dialog).toHaveCount(0);
      }
      expect(errors).toEqual([]);
    });
  }
  for (const isHome of [true, false]) {
    test(`FIX-S4 auto result survives save/load home=${isHome}`, async ({ page }) => {
      test.setTimeout(90_000);
      await loadFixture(page, 'opening');
      await page.evaluate(async isHome => {
        const { loadGame, saveGame } = await import('/baseball-manager/src/engine/saveload.js');
        const state = await loadGame(), match = state.schedule[1].matchups[0];
        state.myId = isHome ? match.homeId : match.awayId;
        if (!(await saveGame(state)).ok) throw new Error('fixture save failed');
      }, isHome);
      await reloadAndLoad(page);
      const before = await saveHub(page);
      await startSingle(page, false);
      await page.getByRole('button', { name: /オートシムモード/ }).click();
      const shown = await resultDecisionRows(page);
      await page.getByRole('button', { name: 'ホームに戻る', exact: true }).click();
      const saved = await saveHub(page), result = saved.gameResultsMap[1];
      expect(result.isHome).toBe(isHome);
      const box = saved.allTeamResultsMap[saved.myId][1];
      expect(shown).toEqual(savedDecisionRows(box, saved.myId));
      for (const team of saved.teams.filter(t => t.id === box.homeId || t.id === box.awayId)) {
        const oldTeam = before.teams.find(t => t.id === team.id);
        for (const player of [...team.players, ...team.farm]) {
          const old = [...oldTeam.players, ...oldTeam.farm].find(p => p.id === player.id);
          for (const [role, stat] of [['W', 'W'], ['L', 'L'], ['S', 'SV']]) {
            const pitching = team.id === saved.myId ? box.myPitching : box.oppPitching;
            expect((player.stats?.[stat] || 0) - (old?.stats?.[stat] || 0))
              .toBe(pitching.some(p => p.id === player.id && p.result === role) ? 1 : 0);
          }
        }
      }
      await reloadAndLoad(page);
      const loaded = await saveHub(page);
      expect(loaded.gameResultsMap[1]).toEqual(result);
      expect(loaded.allTeamResultsMap[saved.myId][1]).toEqual(box);
      expect(loaded.teams).toEqual(saved.teams);
      await startSingle(page, false);
      await page.getByRole('button', { name: /オートシムモード/ }).click();
      await resultDecisionRows(page);
      await page.getByRole('button', { name: 'ホームに戻る', exact: true }).click();
      const resumed = await saveHub(page);
      expect(Object.keys(resumed.gameResultsMap)).toHaveLength(2);
      expect(resumed.gameResultsMap[1]).toEqual(result);
    });
  }
}
