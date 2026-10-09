import { test, expect } from '@playwright/test';
import { startNewGame, runSingle, runBatch, startSingle, saveHub, reloadAndLoad, loadFixture, readSave } from './helpers/progression';

for (const useDh of [false, true]) for (const isHome of [false, true]) {
  test(`confirmed tactical roster, substitutions and saved stats (DH=${useDh}, home=${isHome})`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => {
      if (m.type() === 'error' && m.text().includes('[TacticalPostGame]')) errors.push(m.text());
    });
    await loadFixture(page, 'legacy');
    const setup = await page.evaluate(async ({ useDh, isHome }) => {
      const { loadGame, saveGame } = await import('/baseball-manager/src/engine/saveload.js');
      const { generateSeasonSchedule } = await import('/baseball-manager/src/engine/scheduleGen.js');
      const { prepareTeamForGame } = await import('/baseball-manager/src/engine/rosterAutomation.js');
      const s = await loadGame();
      const schedule = generateSeasonSchedule(s.year, s.teams);
      const match = schedule[1].matchups[0];
      s.myId = isHome ? match.homeId : match.awayId;
      const my = s.teams.find(t => t.id === s.myId);
      const opp = s.teams.find(t => t.id === (isHome ? match.awayId : match.homeId));
      // Home's rule must win when the clubs have opposite DH preferences.
      my.dhEnabled = isHome ? useDh : !useDh;
      opp.dhEnabled = isHome ? !useDh : useDh;
      my.rosterAutomationMode = 'manual';
      my.rosterDhMode = !useDh;
      my.lineupNoDh.reverse(); my.lineupDh.reverse();
      my.lineup = [...(useDh ? my.lineupNoDh : my.lineupDh)];
      my.rotIdx = 1;
      const prepared = prepareTeamForGame(my, useDh);
      const starterId = prepared.rotation[prepared.rotIdx % prepared.rotation.length];
      const pitcherName = my.players.find(p => p.id === starterId).name;
      const ordinary = Object.fromEntries(['lineup', 'lineupNoDh', 'lineupDh', 'fieldingNoDh', 'fieldingDh', 'rotation'].map(k => [k, my[k]]));
      if (!(await saveGame(s)).ok) throw new Error('fixture save failed');
      return { myId: my.id, oppId: opp.id, lineup: prepared.lineup, starterId, pitcherName, ordinary,
        players: my.players.concat(my.farm) };
    }, { useDh, isHome });
    await reloadAndLoad(page);
    // The opposite saved lineup survives load; the game must still use its DH-specific lineup.
    const before = await saveHub(page);
    await startSingle(page, false);
    await page.getByRole('button', { name: /🎮 試合モード/ }).click();
    await expect(page.locator('.gscreen')).toBeVisible();
    await expect(page.locator('.tg-section').nth(1)).toContainText(setup.pitcherName);
    const advance = page.getByRole('button', { name: '▶▶ 1打席進む', exact: true });
    const stepOnce = async () => {
      if (await advance.count()) await advance.click();
      else {
        // Advisory stops hide the single-step button. A normal strategy command
        // deliberately clears the stop and advances exactly one plate appearance.
        await page.getByRole('button', { name: '🎯 作戦', exact: true }).click();
        await page.getByRole('button', { name: '通常で実行！', exact: true }).click();
      }
    };
    // In non-DH games, pinch-hit for the pitcher and verify the relief pitcher's
    // inherited batting slot on the next turn through the order.
    const pinch = page.getByRole('button', { name: '👤 代打', exact: true });
    const readyForPinch = async () => (await pinch.isEnabled()) && (useDh || (await page.locator('.tg-section').nth(2).innerText()).includes(setup.pitcherName));
    for (let i = 0; !(await readyForPinch()) && i < 120; i++) await stepOnce();
    expect(await readyForPinch()).toBe(true);
    // Observe the inning before substitution, independently of the persisted log.
    // An away starter may be pinch-hit in the first top half before ever pitching.
    const pinchInning = Number((await page.locator('.tg-score-divider').innerText()).match(/^\d+/)?.[0]);
    expect(pinchInning).toBeGreaterThan(0);
    const starterHadDefended = isHome || pinchInning > 1;
    await pinch.click();
    const phRow = page.locator('.gscreen .card2').filter({ has: page.getByRole('button', { name: '代打！', exact: true }) }).first();
    const phName = await phRow.locator('.fsb > div > span').first().innerText();
    await phRow.getByRole('button', { name: '代打！', exact: true }).click();
    await advance.click(); // Record the substitute's actual plate appearance.
    await page.getByRole('button', { name: '🔄 投手交代', exact: true }).click();
    const rpRow = page.locator('.gscreen .card2').filter({ has: page.getByRole('button', { name: 'この投手に交代', exact: true }) }).first();
    const rpName = await rpRow.locator('.fsb > div > span').first().innerText();
    await rpRow.getByRole('button', { name: 'この投手に交代', exact: true }).click();
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
    await finish.click();
    await page.getByRole('button', { name: 'ホームに戻る', exact: true }).click();
    const after = await roundTrip(page, 1);
    const my = after.teams.find(t => t.id === setup.myId);
    const old = before.teams.find(t => t.id === setup.myId);
    for (const k of Object.keys(setup.ordinary)) expect(my[k]).toEqual(old[k]);
    const log = after.gameResultsMap[1].log;
    const batting = log.filter(e => e.scorer && e.batId && !e.isStolenBase && e.result !== 'change');
    const pitching = log.filter(e => !e.scorer && e.pitcherId && !e.isStolenBase && e.result !== 'change');
    const players = my.players.concat(my.farm);
    const ph = players.find(p => p.name === phName.trim());
    const rp = players.find(p => p.name === rpName.trim());
    expect(ph).toBeDefined(); expect(rp).toBeDefined();
    expect(batting[useDh ? 0 : 8].batId).toBe(ph.id);
    // The remaining original batting slots, including the non-DH pitcher slot,
    // must stay in order. A relief pitcher inherits the fixed pitcher slot.
    const firstRound = [...setup.lineup]; firstRound[useDh ? 0 : 8] = ph.id;
    expect(batting.slice(0, 9).map(e => e.batId)).toEqual(firstRound);
    expect(pitching.some(e => e.pitcherId === rp.id)).toBe(true);
    expect(pitching[0].pitcherId).toBe(starterHadDefended ? setup.starterId : rp.id);
    if (!useDh) {
      expect(batting[17].batId).toBe(rp.id);
      expect(batting.filter(e => e.batId === setup.starterId)).toHaveLength(0);
    }
    for (const [teamId, scorer] of [[setup.myId, true], [setup.oppId, false]]) {
      const team = after.teams.find(t => t.id === teamId);
      const previous = before.teams.find(t => t.id === teamId);
      for (const p of team.players.concat(team.farm)) {
        const base = previous.players.concat(previous.farm).find(q => q.id === p.id);
        const atBats = log.filter(e => e.scorer === scorer && e.batId === p.id && !e.isStolenBase && e.result !== 'change');
        const faced = log.filter(e => e.scorer !== scorer && e.pitcherId === p.id && !e.isStolenBase && e.result !== 'change');
        expect((p.stats?.PA || 0) - (base?.stats?.PA || 0)).toBe(atBats.length);
        expect((p.stats?.BF || 0) - (base?.stats?.BF || 0)).toBe(faced.length);
      }
    }
    expect(after.gameResultsMap[1].isHome).toBe(isHome);
    expect(errors).toEqual([]);
  });
}

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

test('tactical CPU injury preparation commits every scheduled game and survives reload', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && message.text().includes('[TacticalPostGame]')) errors.push(message.text());
  });
  await loadFixture(page, 'legacy');
  const setup = await page.evaluate(async () => {
    const { loadGame, saveGame } = await import('/baseball-manager/src/engine/saveload.js');
    const { getMyMatchup, generateSeasonSchedule } = await import('/baseball-manager/src/engine/scheduleGen.js');
    const state = await loadGame();
    state.schedule = generateSeasonSchedule(state.year, state.teams);
    const opponentId = getMyMatchup(state.schedule, 1, state.myId).oppId;
    const injuries = [];
    for (const team of state.teams.filter(t => t.id !== state.myId)) {
      const id = team.lineupNoDh[0];
      team.players = team.players.map(p => p.id === id ? { ...p, injury: 'test', injuryDaysLeft: 3 } : p);
      team.rosterAutomationMode = 'manual';
      injuries.push({ teamId: team.id, playerId: id });
    }
    if (!(await saveGame(state)).ok) throw new Error('fixture save failed');
    return { opponentId, injuries };
  });
  await reloadAndLoad(page);
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
  await finish.click();
  await page.getByRole('button', { name: 'ホームに戻る', exact: true }).click();
  const saved = await roundTrip(page, 1);
  expect(saved.gameDay).toBe(2);
  for (const team of saved.teams) expect(team.wins + team.losses + team.draws).toBe(1);
  for (const injury of setup.injuries) {
    const team = saved.teams.find(t => t.id === injury.teamId);
    expect(team.lineupNoDh).not.toContain(injury.playerId);
    expect(team.lineupDh).not.toContain(injury.playerId);
  }
  const opponent = saved.teams.find(t => t.id === setup.opponentId);
  const injuredId = setup.injuries.find(i => i.teamId === opponent.id).playerId;
  expect(opponent.farm.find(p => p.id === injuredId).injuryDaysLeft).toBe(2);
  expect(saved.recentResults).toHaveLength(1);
  expect(errors).toEqual([]);
});
