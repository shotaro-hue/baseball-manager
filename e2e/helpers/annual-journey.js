import { expect } from '@playwright/test';
import { openBatch, waitSaveIdle } from './progression';

// These helpers only observe real saves and operate the existing UI. They do
// not manufacture results, advance the date, or replace simulation/storage.
export async function annualSnapshot(page) {
  await waitSaveIdle(page);
  return page.evaluate(async () => {
    console.info('[annual-stage] reading save');
    const state = await (await import('/baseball-manager/src/engine/saveload.js')).loadGame();
    console.info(`[annual-stage] loaded ${state.year}/${state.gameDay}`);
    const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest(
      'SHA-256', new TextEncoder().encode(JSON.stringify(value)),
    )), b => b.toString(16).padStart(2, '0')).join('');
    const mine = state.teams.find(t => t.id === state.myId);
    const receipt = await (await import('/baseball-manager/src/engine/battedBallReceipts.js')).readBattedBallReceipt(state.battedBallReceipt);
    console.info(`[annual-stage] receipt ${receipt.status}/${receipt.recordCount}`);
    const ids = state.teams.flatMap(t => [...t.players, ...t.farm].map(p => p.id));
    return {
      year: state.year, gameDay: state.gameDay, saveId: state.saveId,
      teamsHash: await hash(state.teams), historyHash: await hash(state.seasonHistory),
      resultsHash: await hash([state.gameResultsMap, state.allTeamResultsMap, state.scheduleArchive]),
      farmHash: await hash(state.farmCompetition), receipt,
      receiptRef: state.battedBallReceipt,
      receiptHead: state.battedBallReceipt?.head,
      duplicateIds: ids.filter((id, i) => ids.indexOf(id) !== i),
      teams: state.teams.map(t => ({ id: t.id, wins: t.wins, losses: t.losses, draws: t.draws ?? 0,
        budget: t.budget, results: Object.keys(state.allTeamResultsMap?.[t.id] ?? {}).length })),
      myResultCount: Object.keys(state.gameResultsMap ?? {}).length,
      measuredBatting: mine.players.reduce((n, p) => n + (p.stats?.PA ?? 0), 0),
      farm: { year: state.farmCompetition?.year, nextRound: state.farmCompetition?.nextRound,
        cards: state.farmCompetition?.cards.length,
        played: state.farmCompetition?.cards.filter(c => c.status === 'played').length,
        unplayed: state.farmCompetition?.cards.filter(c => c.status !== 'played').map(c => ({ id: c.id, reasons: c.reasons })) },
      past: state.scheduleArchive?.map(a => ({ year: a.year, games: Object.keys(a.gameResultsMap ?? {}).length })),
      standings: state.seasonHistory?.standingsHistory,
      farmArchives: state.seasonHistory?.farmArchives?.map(a => ({ year: a.year, nextRound: a.nextRound, standings: a.standings })),
    };
  });
}

export async function progressAnnualBatch(page, mobile, count, { final = false } = {}) {
  const panel = await openBatch(page, mobile);
  await panel.getByLabel('まとめて進める試合数').selectOption(String(count));
  await panel.getByRole('checkbox', { name: 'フル自動編成', exact: true }).first().check();
  await panel.getByRole('button', { name: 'まとめてシム', exact: true }).click();
  if (final) {
    await expect(page.getByRole('heading', { name: /年 ポストシーズン$/ })).toBeVisible({ timeout: 120_000 });
  } else {
    const back = page.getByRole('button', { name: 'ホームへ戻る', exact: true });
    await expect(back).toBeVisible({ timeout: 120_000 });
    await back.click();
    await answerAnnualPress(page);
  }
}

export async function answerAnnualPress(page) {
  const press = page.getByRole('dialog', { name: '記者会見', exact: true });
  await expect(press).toBeVisible();
  await press.getByRole('button').filter({ hasNotText: '回答する' }).first().click();
  await press.getByRole('button', { name: '回答する', exact: true }).click();
  await expect(press).toHaveCount(0);
}

export async function finishAnnualOffseason(page, year) {
  await page.getByRole('button', { name: '残り全試合をまとめてシム', exact: true }).click();
  await page.getByRole('button', { name: '引退・シーズン終了後の手続きへ', exact: true }).click();
  const next = page.getByRole('button', { name: '引退結果を確認して次へ', exact: true });
  await expect(next).toBeVisible();
  const retire = page.getByRole('button', { name: '引退を受け入れる', exact: true });
  while (await retire.count()) await retire.first().click();
  await next.click();
  await page.getByRole('dialog').getByRole('button', { name: '確定して国内FA補強へ', exact: true }).click();
  await page.getByRole('button', { name: '交渉・補強を始める', exact: true }).click();
  // A real first season has expiring contracts, unlike the old late-season
  // fixture. Offer the requested salary through the ordinary batch UI.
  await page.getByRole('button', { name: '自球団', exact: true }).click();
  await page.getByRole('button', { name: 'まとめて提示を開く', exact: true }).click();
  await page.getByRole('button', { name: '提示可能な全員を選択', exact: true }).click();
  const apply = page.getByRole('button', { name: '選択した選手の下書きに適用', exact: true });
  if (await apply.isEnabled()) {
    await page.getByLabel('金額の基準').selectOption('demand');
    await page.getByLabel('基準額に対する割合（%）', { exact: true }).fill('100');
    await apply.click();
    await page.getByRole('button', { name: '選択した選手の提示内容を確認', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '各選手へ1回ずつ提示する', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '結果を閉じる', exact: true }).click();
  }
  await page.getByRole('button', { name: '結果確認', exact: true }).click();
  await expect(page.getByRole('button', { name: '編成終了の最終確認', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: '編成終了の最終確認', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '確認して確定する', exact: true }).click();
  await page.getByRole('button', { name: 'ドラフトへ進む', exact: true }).click();
  await page.getByRole('button', { name: /ドラフト会議を開始する/ }).click();
  await page.getByRole('button', { name: /全ドラフト自動処理/ }).click();
  await page.getByRole('button', { name: /結果レビューへ/ }).click();
  await page.getByRole('button', { name: new RegExp(`${year + 1}年シーズン開幕`) }).click();
  await page.getByRole('button', { name: /キャンプ終了・開幕へ/ }).click();
  await page.getByRole('button', { name: /開幕！/ }).click();
}
