import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

// One real save fixture for before/after images and browser regressions.
export function managementFixture() {
  const fixture = JSON.parse(gunzipSync(readFileSync(new URL('../fixtures/new-game.json.gz', import.meta.url))));
  const mine = fixture.teams.find(t => t.id === fixture.myId), other = fixture.teams.find(t => t.id !== fixture.myId);
  const used = new Set([...(mine.lineupDh || []), ...(mine.lineupNoDh || []), ...(mine.rotation || [])]);
  const outgoing = mine.players.find(p => !used.has(p.id));
  const incoming = other.players.find(p => !p.isPitcher);
  incoming.name = '比較対象の移籍候補'; incoming.age = 35; incoming.potential = 30;
  incoming.batting = { ...incoming.batting, contact: 10, power: 10, eye: 10, speed: 10, clutch: 10 };
  const contract = mine.farm.find(p => !p.育成 && !p.isIkusei);
  Object.assign(contract, { name: '契約判断テスト', salary: 1000, contractYearsLeft: 1, contractSignedYear: null });
  const scout = { ...structuredClone(incoming), id: 'ui04c-scout-0', name: 'スカウト候補アルベルト・ロドリゲス', age: 24, salary: 1000 };
  mine.scoutResults = [scout, { ...structuredClone(scout), id: 'ui04c-scout-1', name: '未記録の候補', salary: null }];
  mine.scoutMissions = [];
  fixture.faPool = [{ ...structuredClone(scout), id: 'ui04c-fa-0', name: 'FA比較候補', isFA: true, isForeign: false }];
  fixture.mailbox = [
    { id: 'ui04c-resolved', type: 'trade', title: '対応済みの別案件', read: true, resolved: true, offer: { from: other, want: [outgoing], offer: [incoming], cash: 0 } },
    { id: 'ui04c-selected', type: 'trade', title: '今回検討する案件', read: false, resolved: false, offer: { from: other, want: [outgoing], offer: [incoming], cash: 5000000 } },
  ];
  fixture.news = [];
  return { fixture, mine, other, outgoing, incoming, contract, scout };
}

export async function loadManagementFixture(page, fixture) {
  await page.goto('/');
  await page.evaluate(async fixture => {
    const { saveGame } = await import('/baseball-manager/src/engine/saveload.js');
    if (!(await saveGame(fixture)).ok) throw Error('management fixture save failed');
  }, fixture);
  await page.reload();
  await page.getByRole('button', { name: '続きから', exact: true }).click();
  await page.getByRole('button', { name: '保存', exact: true }).waitFor();
}
