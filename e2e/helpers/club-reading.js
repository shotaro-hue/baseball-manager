import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { reloadAndLoad, mainNavigation } from './progression.js';

export async function prepareClubReading(page, { longArticle = false } = {}) {
  const fixture = JSON.parse(gunzipSync(readFileSync(new URL('../fixtures/new-game.json.gz', import.meta.url))));
  fixture.mailbox = Array.from({ length: 85 }, (_, i) => ({ id: `reading-mail-${i}`, type: 'info', title: `球団からのお知らせ${i + 1}号`, from: '球団事務局', dateLabel: '2026年4月1日', body: '翌年度へ向けた球団運営のお知らせです。\n閲覧だけでは取引や契約は確定しません。', read: false }));
  fixture.mailbox.unshift({ id: 'reading-posting', type: 'posting_request', title: '海外移籍についての相談', from: '所属選手', body: 'ポスティング判断は確認後に確定します。', read: true, resolved: false });
  fixture.news = [{ id: 'reading-interview', type: 'interview', headline: '新シーズンの方針を聞く', source: 'スポーツ紙', dateLabel: '2026年4月1日', body: '長いシーズンをどう戦いますか。', question: '今年の目標は？', answered: false, options: [{ text: '一戦ずつ大切に戦う', popMod: 1, moraleMod: 1 }] }, ...Array.from({ length: 70 }, (_, i) => ({ id: `reading-news-${i}`, type: 'game', headline: `球界ニュース${i + 1}号`, source: 'スポーツ紙', dateLabel: '2026年4月1日', body: '全球団の動向をお知らせします。' }))];
  if (longArticle) fixture.news[0].body = '長い記事の内容を確認しています。'.repeat(200);
  const mine = fixture.teams.find(t => t.id === fixture.myId);
  mine.history = Array.from({ length: 75 }, (_, i) => ({ ...mine.players[i % mine.players.length], id: `reading-ob-${i}`, name: `歴代選手${i + 1}号`, exitYear: 2025, exitReason: '引退', tenure: 80 - i, careerLog: [], recentCareerLog: [], careerLogSummary: {} }));
  for (const p of mine.history) {
    p.isPitcher = false; p.pos = '外野';
    p.recentCareerLog = [2024,2025].map(year => ({year,teamId:mine.id,teamName:mine.name,stats:{...mine.players[0].stats,PA:100,AB:90,H:30,HR:5,RBI:20},playoffStats:{...mine.players[0].stats,PA:0,AB:0}}));
    p.careerLog = p.recentCareerLog;
  }
  fixture.seasonHistory = { ...fixture.seasonHistory, awards: [{ year: 2025, version: 2, mvp: { central: { name: '表彰選手', teamName: mine.name, pos: '外野', OPS: 0.912 } } }], standingsHistory: [2024, 2025].map(year => ({ year, playerAwards: { mvpCentral: { name: `MVP${year}` } }, central: [{ id: mine.id, name: mine.name, wins: 80, losses: 60 }], pacific: [], titles: { central: { version: 2, hr: { winners: [{ name: `本塁打王${year}`, teamName: mine.name, value: 30 }] } } } })), records: { singleSeasonK: { value: 0, playerName: '記録選手' } }, hallOfFame: [] };
  await page.goto('/');
  await page.evaluate(async fixture => {
    const { saveGame } = await import('/baseball-manager/src/engine/saveload.js');
    if (!(await saveGame(fixture)).ok) throw new Error('reading fixture save failed');
  }, fixture);
  await reloadAndLoad(page);
}
export const readingRoute = page => page.locator('[data-hub-route]:not([hidden])');
export async function visitRecords(page, width, ob = false) {
  await mainNavigation(page, width < 1024).getByRole('button', { name: '成績', exact: true }).click();
  await page.getByRole('navigation', { name: '成績メニュー' }).getByRole('button', { name: '記録・球団史', exact: true }).click();
  if (ob) await page.getByRole('navigation', { name: '記録・球団史メニュー' }).getByRole('button', { name: 'OB', exact: true }).click();
}
