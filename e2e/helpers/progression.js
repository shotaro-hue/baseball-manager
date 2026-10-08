import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect } from '@playwright/test';

export const TEAM = '読売ジャイアンツ';
export async function startNewGame(page) {
  await page.goto('/');
  await page.getByRole('button', { name: TEAM, exact: true }).click();
  await expect(page.locator('.topbar')).toContainText(TEAM);
}
export function mainNavigation(page, mobile) {
  return mobile ? page.getByRole('navigation', { name: 'メインメニュー' })
    : page.getByRole('complementary', { name: '監督メニュー' });
}
export async function openBatch(page, mobile) {
  if (mobile) {
    await mainNavigation(page, true).getByRole('button', { name: 'ホーム', exact: true }).click();
    await page.locator('main.mobile-home').getByRole('button', { name: 'まとめて進める', exact: true }).click();
    return page.locator('main.mobile-home .flow-sim');
  }
  const details = page.locator('details.calm-batch');
  await details.locator('summary').click();
  return details;
}
export async function runBatch(page, mobile, count = 5) {
  const panel = await openBatch(page, mobile);
  await panel.getByLabel('まとめて進める試合数').selectOption(String(count));
  await panel.getByRole('button', { name: 'まとめてシム', exact: true }).click();
  await expect(page.getByRole('button', { name: 'ホームへ戻る', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'ホームへ戻る', exact: true }).click();
  await expect(page.locator('.topbar')).toContainText(TEAM);
}
export async function startSingle(page, mobile) {
  if (mobile) await page.locator('main.mobile-home').getByRole('button', { name: /1試合ずつ采配/ }).click();
  else await page.locator('.desktop-dashboard').getByRole('button', { name: '試合へ進む', exact: true }).click();
}
export async function runSingle(page, mobile) {
  await startSingle(page, mobile);
  await page.getByRole('button', { name: /オートシムモード/ }).click();
  await expect(page.getByRole('button', { name: 'ホームに戻る', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'ホームに戻る', exact: true }).click();
}
export async function readSave(page) {
  return page.evaluate(async () => (await import('/baseball-manager/src/engine/saveload.js')).loadGame());
}
export async function waitSaveIdle(page) {
  const idle = async () => page.evaluate(async () => {
    const queue = (await import('/baseball-manager/src/engine/saveload.js')).getSaveQueueSnapshot();
    return !queue.isSaving && !queue.hasQueuedSave;
  });
  await expect.poll(idle).toBe(true);
}
export async function saveHub(page) {
  await waitSaveIdle(page);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await waitSaveIdle(page);
  const saved = await readSave(page);
  const signature = progressSignature(saved);
  await expect(page.locator('.topbar')).toContainText(`第${signature.gameDay}戦`);
  await expect(page.locator('.topbar')).toContainText(`${signature.wins}勝${signature.losses}敗`);
  await expect(page.getByText(/セーブに失敗しました|ストレージ容量が不足しています/)).toHaveCount(0);
  return saved;
}

export async function reloadAndLoad(page) {
  await page.reload();
  await page.getByRole('button', { name: '続きから', exact: true }).click();
}
export function progressSignature(save, playerId) {
  const team = save.teams.find(t => t.id === save.myId);
  const player = [...team.players, ...team.farm].find(p => p.id === (playerId ?? team.players[0].id));
  return { year: save.year, myId: save.myId, gameDay: save.gameDay,
    wins: team.wins, losses: team.losses, draws: team.draws ?? 0,
    played: team.wins + team.losses + (team.draws ?? 0),
    player: { id: player.id, name: player.name, stats: player.stats } };
}

// Test-only fixtures use the existing save API. No runtime state injection or
// replacement of Worker/progression/storage code. Counters and result maps are
// derived from fixed scheduled outcomes, including one draw on round 20.
export async function loadFixture(page, kind) {
  await page.goto('/');
  const fixture = JSON.parse(gunzipSync(readFileSync(new URL('../fixtures/new-game.json.gz', import.meta.url))).toString());
  await page.evaluate(async ({kind, fixture}) => {
    const { saveGame } = await import('/baseball-manager/src/engine/saveload.js');
    const { SEASON_GAMES } = await import('/baseball-manager/src/constants.js');
    const { initPlayoff, encodePlayoff } = await import('/baseball-manager/src/engine/playoff.js');
    const state = fixture;
    const { generateSeasonSchedule } = await import('/baseball-manager/src/engine/scheduleGen.js');
    state.schedule = generateSeasonSchedule(state.year, state.teams);
    const played = kind === 'draw-complete' ? SEASON_GAMES : kind === 'late' ? SEASON_GAMES - 1 : 0;
    const byId = new Map(state.teams.map(t => [t.id, t]));
    state.gameResultsMap = {}; state.allTeamResultsMap = {}; state.allTeamBoxScoresMap = {};
    for (const team of state.teams) {
      Object.assign(team, { wins: 0, losses: 0, draws: 0, rf: 0, ra: 0 });
      if (played > 0) for (const player of [...team.players, ...team.farm]) Object.assign(player, { age: 25, contractYearsLeft: 3, contractYears: 3, retireWill: 0 });
    }
    for (let day = 1; day <= played; day++) {
      for (const match of state.schedule[day].matchups) {
        const home = byId.get(match.homeId), away = byId.get(match.awayId);
        const drew = day === 20;
        const homeWon = !drew && (home.id === state.myId || (away.id !== state.myId));
        const homeScore = drew ? 0 : homeWon ? 1 : 0, awayScore = drew ? 0 : homeWon ? 0 : 1;
        for (const [team, opponent, isHome, score, against] of [[home,away,true,homeScore,awayScore],[away,home,false,awayScore,homeScore]]) {
          const result = { won: score > against, drew, myScore: score, oppScore: against, isHome,
            homeId: home.id, awayId: away.id, oppId: opponent.id, oppName: opponent.name, log: [], inningSummary: [] };
          team.wins += result.won ? 1 : 0; team.losses += !result.won && !drew ? 1 : 0; team.draws += drew ? 1 : 0;
          team.rf += score; team.ra += against;
          (state.allTeamResultsMap[team.id] ??= {})[day] = result;
          if (team.id === state.myId) state.gameResultsMap[day] = { ...result, oppTeam: { id: opponent.id, name: opponent.name, short: opponent.short, emoji: opponent.emoji, color: opponent.color, league: opponent.league } };
        }
      }
    }
    state.gameDay = played + 1; state.allStarDone = played > 0; state.recentResults = [];
    state.offseasonPlan = kind === 'draw-complete' ? { version:1,year:state.year,myId:state.myId,stage:'postseason',resumeScreen:'playoff',playoff:encodePlayoff(initPlayoff(state.teams,{year:state.year})) } : null;
    if (kind === 'invalid-lineup') {
      const team = byId.get(state.myId); team.lineup = []; team.lineupNoDh = []; team.lineupDh = [];
    }
    const result = await saveGame(state);
    if (!result.ok) throw new Error('fixture save failed');
  }, { kind, fixture });
  await reloadAndLoad(page);
}
