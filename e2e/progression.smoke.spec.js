import { test, expect } from '@playwright/test';
import { startNewGame, mainNavigation, runBatch, runSingle, startSingle, saveHub, waitSaveIdle, readSave, reloadAndLoad, progressSignature, loadFixture } from './helpers/progression';

// Measured E1 includes real detailed Worker simulation and multiple IDB loads.
test.setTimeout(60_000);
let errors = [];
test.beforeEach(async ({ page }) => { errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', msg => { if (msg.type() === 'error' && /runSingleDaySimulation failed|runBatchGames failed|Save failed|Auto save failed|年度更新処理に失敗/.test(msg.text())) errors.push(msg.text()); }); });
test.afterEach(async () => { expect(errors, 'Unhandled page exceptions').toEqual([]); });

test('E1 new game, five games, persisted reload, one more game', async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === 'mobile-webkit';
  await startNewGame(page);
  const initial = progressSignature(await saveHub(page, { progressOnly: true }));
  await expect(page.locator('.topbar')).toContainText('残り143試合');
  if (mobile) await mainNavigation(page, true).getByRole('button', { name: '日程', exact: true }).click();
  if (mobile) await mainNavigation(page, true).getByRole('button', { name: 'ホーム', exact: true }).click();
  await runBatch(page, mobile);
  const saved = await saveHub(page, { progressOnly: true }), before = progressSignature(saved);
  expect(before.played - initial.played).toBe(5);
  expect(before.gameDay).toBe(initial.gameDay + 5);
  await expect(page.locator('.topbar')).toContainText('残り138試合');
  await reloadAndLoad(page);
  await expect(page.locator('.topbar')).toContainText('残り138試合');
  expect(progressSignature(await saveHub(page, { progressOnly: true, playerId: before.player.id }), before.player.id)).toEqual(before);
  await runSingle(page, mobile);
  const after = progressSignature(await saveHub(page, { progressOnly: true, playerId: before.player.id }), before.player.id);
  expect(after.played).toBe(before.played + 1);
  expect(after.gameDay).toBe(before.gameDay + 1);
  await expect(page.locator('.topbar')).toContainText('残り137試合');
});

test('E2 final regular game, postseason save/reload, offseason and next year', async ({ page }) => {
  test.setTimeout(120_000); // Full annual lifecycle includes real simulation, storage and lazy screens.
  await loadFixture(page, 'late');
  const before = progressSignature(await readSave(page));
  const press = page.getByRole('dialog', { name: '記者会見', exact: true });
  await expect(press).toBeVisible();
  // Choose the first offered answer deliberately, within this modal.
  const choices = press.getByRole('button').filter({ hasNotText: '回答する' });
  await choices.nth(0).click();
  await press.getByRole('button', { name: '回答する', exact: true }).click();
  await expect(press).toHaveCount(0);
  await expect(page.locator('.topbar')).toContainText('残り1試合');
  await startSingle(page, false);
  await page.getByRole('button', { name: /オートシムモード/ }).click();
  await expect(page.getByRole('heading', { name: `${before.year}年 ポストシーズン`, exact:true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'まとめてシム', exact:true })).toHaveCount(0);
  await page.getByRole('button', { name: '次の1試合を進める', exact:true }).click();
  await expect(page.getByRole('status')).toBeVisible();
  await waitSaveIdle(page);
  await page.getByRole('button', { name: '進行を保存', exact:true }).click();
  await waitSaveIdle(page);
  const during = await readSave(page);
  expect(Object.values(during.offseasonPlan?.playoff ?? {}).reduce((n,s) => n + (s?.games?.length ?? 0),0)).toBe(1);
  expect(progressSignature(during).played).toBe(143);
  const series = await page.locator('.playoff-series[data-active="true"]').innerText();
  await reloadAndLoad(page);
  await expect(page.locator('.playoff-series[data-active="true"]')).toHaveText(series, { useInnerText: true });
  expect((await readSave(page)).offseasonPlan.playoff).toEqual(during.offseasonPlan.playoff);
  await page.getByRole('button', { name: '編成を見直す', exact:true }).click();
  await expect(page.locator('.topbar')).toContainText('残り0試合');
  await expect(page.getByRole('button', { name: 'まとめてシム', exact:true })).toHaveCount(0);
  await page.getByRole('button', { name: 'ポストシーズンに戻る', exact:true }).click();
  await page.getByRole('button', { name: '残り全試合をまとめてシム', exact:true }).click();
  await page.getByRole('button', { name: '引退・シーズン終了後の手続きへ', exact:true }).click();
  // Every required choice is made through normal UI, including real retirement
  // candidates, contract renewal, the draft and spring training.
  const retire = page.getByRole('button', { name: '引退を受け入れる', exact:true });
  while (await retire.count()) await retire.nth(0).click();
  await page.getByRole('button', { name: '引退結果を確認して次へ', exact:true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '確定して国内FA補強へ', exact:true }).click();
  await page.getByRole('button', { name: '方針を確認して補強市場を開く', exact:true }).click();
  await page.getByRole('button', { name: '結果確認', exact:true }).click();
  await page.getByRole('button', { name: '編成終了の最終確認', exact:true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '確認して確定する', exact:true }).click();
  await page.getByRole('button', { name: 'ドラフトへ進む', exact:true }).click();
  await page.getByRole('button', { name: /ドラフト会議を開始する/ }).click();
  await page.getByRole('button', { name: /全ドラフト自動処理/ }).click();
  await page.getByRole('button', { name: /結果レビューへ/ }).click();
  await page.getByRole('button', { name: new RegExp(`${before.year + 1}年シーズン開幕`) }).click();
  await page.getByRole('button', { name: /キャンプ終了・開幕へ/ }).click();
  await page.getByRole('button', { name: /開幕！/ }).click();
  await expect(page.locator('.topbar')).toContainText(`${before.year + 1}年`);
  await expect(page.locator('.topbar')).toContainText('残り143試合');
  const next = await saveHub(page), nextProgress = progressSignature(next);
  expect(nextProgress).toMatchObject({year:before.year+1,gameDay:1,wins:0,losses:0,draws:0});
  expect(next.seasonHistory.championships.some(c => c.year === before.year)).toBe(true);
  const career = await page.evaluate(async ({id,saveId}) => (await import('/baseball-manager/src/engine/saveload.js')).loadPlayerCareerLogById(id,saveId), {id:before.player.id,saveId:next.saveId});
  const previousCareer = career.find(entry => entry.year === before.year && entry.teamId === before.myId);
  expect(previousCareer).toBeDefined();
  const regularStats = progressSignature(during, before.player.id).player.stats;
  for (const [key, value] of Object.entries(previousCareer.stats)) expect(value, `previous ${key}`).toBe(regularStats[key] ?? 0);
  const previousStandings = next.seasonHistory.standingsHistory.find(entry => entry.year === before.year);
  const previousTeam = [...previousStandings.central, ...previousStandings.pacific].find(team => team.id === before.myId);
  expect(previousTeam.wins + previousTeam.losses + previousTeam.draws).toBe(143);
  expect(next.scheduleArchive.at(-1).year).toBe(before.year);
  expect(Object.keys(next.scheduleArchive.at(-1).gameResultsMap)).toHaveLength(143);
  expect(next.gameResultsMap).toEqual({}); expect(next.recentResults).toEqual([]);
  expect(next.allStarDone).toBe(false); expect(next.lastPressDay).toBe(0);
  await reloadAndLoad(page);
  const reopened = await saveHub(page);
  expect(reopened.scheduleArchive).toEqual(next.scheduleArchive);
  expect(progressSignature(reopened)).toEqual(nextProgress);
  await runSingle(page, false);
  expect(progressSignature(await saveHub(page)).played).toBe(1);
});

test('E2 draw-inclusive completed fixture cannot start regular games', async ({ page }) => {
  await loadFixture(page, 'draw-complete');
  await page.getByRole('button', { name: '編成を見直す', exact:true }).click();
  await expect(page.locator('.topbar')).toContainText('残り0試合');
  const before = progressSignature(await readSave(page));
  expect(before.played).toBe(143); expect(before.draws).toBe(1);
  await mainNavigation(page, false).getByRole('button', { name: 'ホーム',exact:true }).click();
  await expect(page.locator('.desktop-dashboard').getByRole('button', { name: '試合へ進む',exact:true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'まとめてシム',exact:true })).toHaveCount(0);
  expect(progressSignature(await saveHub(page))).toEqual(before);
});

test('E3 invalid lineup, useful guidance, UI repair, one game', async ({ page }) => {
  await loadFixture(page, 'invalid-lineup');
  const before = progressSignature(await readSave(page));
  await startSingle(page, false);
  await expect(page.getByText(/先発メンバーが不足しています/)).toBeVisible();
  await expect(page.locator('.topbar')).toContainText('第1戦');
  await expect(page.locator('.topbar')).toContainText('残り143試合');
  await expect(page.locator('.topbar')).toContainText('0勝0敗0分');
  expect(progressSignature(await readSave(page))).toEqual(before);
  await page.getByRole('button', { name: 'ロスターへ', exact:true }).click();
  await page.locator('details.roster-full-settings > summary').click();
  await page.locator('details.roster-full-settings').getByRole('button', { name: '自動編成', exact:true }).click();
  await mainNavigation(page, false).getByRole('button', { name: 'ホーム',exact:true }).click();
  await runSingle(page, false);
  await expect(page.getByText(/先発メンバーが不足しています/)).toHaveCount(0);
  const after = progressSignature(await saveHub(page));
  expect(after.played).toBe(before.played+1); expect(after.gameDay).toBe(before.gameDay+1);
});

test('E4 shortstop injury, emergency fielding moves, batch and persisted reload', async ({ page }) => {
  await loadFixture(page, 'new');
  const fixture = await readSave(page);
  const expected = await page.evaluate(async state => {
    const { createInitialTeams } = await import('/baseball-manager/src/engine/bootstrapTeams.js');
    const { saveGame } = await import('/baseball-manager/src/engine/saveload.js');
    const random = Math.random;
    let seed = 1;
    // Fix only fixture construction; Worker simulation and storage stay real.
    try {
      Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
      state.teams = createInitialTeams();
    } finally { Math.random = random; }
    state.myId = 4;
    const team = state.teams.find(t => t.id === state.myId);
    const shortstop = team.players.find(p => team.fieldingNoDh[p.id] === '遊撃手');
    const second = team.players.find(p => team.fieldingNoDh[p.id] === '二塁手');
    shortstop.injuryDaysLeft = 10;
    shortstop.injury = '軽微';
    const result = await saveGame(state);
    if (!result.ok) throw new Error('injury fixture save failed');
    return { shortstop: shortstop.id, second: second.id,
      retainedOrder: team.lineupNoDh.filter(id => id !== shortstop.id), rotation: team.rotation,
      starter: team.rotation[team.rotIdx % team.rotation.length],
      injuryHistories: Object.fromEntries([...team.players,...team.farm].map(p=>[p.id,JSON.stringify(p.injuryHistory || [])])) };
  }, fixture);
  await reloadAndLoad(page);
  await runBatch(page, false);
  const saved = await saveHub(page);
  const team = saved.teams.find(t => t.id === saved.myId);
  expect(progressSignature(saved).played).toBe(5);
  expect(team.lineupNoDh).toHaveLength(8);
  expect(team.lineupNoDh).not.toContain(expected.shortstop);
  // The first game starts before any new post-game injuries. Check its exact
  // batting order and starter rather than assuming five random games stay healthy.
  const firstLog = saved.gameResultsMap[1].log;
  const batting = firstLog.filter(e => e.scorer && e.batId && !e.isStolenBase && e.result !== 'change');
  const pitching = firstLog.filter(e => !e.scorer && e.pitcherId && !e.isStolenBase && e.result !== 'change');
  expect(batting.slice(0, 7).map(e => e.batId)).toEqual(expected.retainedOrder);
  expect(new Set(batting.slice(0, 8).map(e => e.batId)).size).toBe(8);
  expect(pitching[0].pitcherId).toBe(expected.starter);
  // Further random injuries can legitimately reassign a healthy outfielder when
  // covering an injured infielder. Preserve the exact single-injury expectation
  // only while its premise holds; always validate the resulting active lineup.
  const additionalInjuries = [...team.players,...team.farm].filter(p =>
    JSON.stringify(p.injuryHistory || []) !== expected.injuryHistories[p.id]);
  const validation = await page.evaluate(async team => {
    const {validateLineup,validateTeamRoster}=await import('/baseball-manager/src/engine/rosterAutomation.js');
    return {lineup:validateLineup(team,false),roster:validateTeamRoster(team)};
  },team);
  expect(validation.lineup.errors).toEqual([]);
  expect(validation.roster.valid).toBe(true);
  const healthy = new Set(team.players.filter(p => !(p.injuryDaysLeft > 0)).map(p => p.id));
  if (!additionalInjuries.some(p => !p.isPitcher)) {
    const retainedHealthy = expected.retainedOrder.filter(id => healthy.has(id));
    expect(team.lineupNoDh.filter(id => retainedHealthy.includes(id))).toEqual(retainedHealthy);
    if (healthy.has(expected.second)) expect(team.fieldingNoDh[expected.second]).toBe('遊撃手');
  }
  if (!additionalInjuries.some(p => p.isPitcher)) {
    const healthyRotation = expected.rotation.filter(id => healthy.has(id));
    expect(team.rotation.filter(id => healthyRotation.includes(id))).toEqual(healthyRotation);
  }
  await reloadAndLoad(page);
  const reopened = await saveHub(page);
  expect(progressSignature(reopened)).toEqual(progressSignature(saved));
  const resumed = reopened.teams.find(t => t.id === reopened.myId);
  expect(resumed.lineupNoDh).toEqual(team.lineupNoDh);
  expect(resumed.fieldingNoDh).toEqual(team.fieldingNoDh);
});
