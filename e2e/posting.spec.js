import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { reloadAndLoad, saveHub } from './helpers/progression';

async function loadPostingFixture(page, legacy, budget = 1000) {
  const fixture = JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/new-game.json.gz', import.meta.url))));
  const team = fixture.teams.find(t => t.id === fixture.myId);
  const player = team.players.find(p => p.isPitcher);
  Object.assign(player, { age: 25, potential: 100, postingRequested: true,
    pitching: { ...player.pitching, velocity: 20, control: 20, breaking: 20, stamina: 20, clutchP: 20 } });
  team.budget = budget;
  fixture.mailbox = [{ id: 'posting-request', type: 'posting_request', playerId: player.id,
    title: 'D01 ポスティング申請', body: 'MLBへの移籍を希望しています。', from: '選手', read: false, resolved: false }];
  await page.goto('/');
  await page.evaluate(async ({ fixture, legacy }) => {
    if (legacy) {
      localStorage.setItem('baseball_manager_v1', JSON.stringify(fixture));
      localStorage.setItem('baseball_manager_v1_meta', JSON.stringify({ year: fixture.year, gameDay: fixture.gameDay }));
    } else {
      const { saveGame } = await import('/baseball-manager/src/engine/saveload.js');
      if (!(await saveGame(fixture)).ok) throw new Error('posting fixture save failed');
    }
  }, { fixture, legacy });
  await reloadAndLoad(page);
  return { playerId: player.id, name: player.name, morale: player.morale ?? 70 };
}

async function openMail(page) {
  await page.getByRole('complementary', { name: '監督メニュー' }).getByRole('button', { name: /その他/ }).click();
  await page.getByText('D01 ポスティング申請', { exact: true }).click();
}

for (const legacy of [false, true]) {
  test(`D01 approved posting survives real save/reload (${legacy ? 'legacy inline v4' : 'chunked v4'})`, async ({ page }) => {
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const { playerId, name } = await loadPostingFixture(page, legacy);
    const initial = await saveHub(page);
    await openMail(page);
    // tradeValue=20, rngf(0.8,1.5)=1: use real bid logic with a fixed random draw.
    await page.evaluate(() => { window.postingOriginalRandom = Math.random; Math.random = () => 2 / 7; });
    await page.getByRole('button', { name: '✅ 承認する', exact: true }).click();
    await expect(page.getByText(`${name} MLB移籍承認 — 移籍金+2000万円`, { exact: true })).toBeVisible();
    await page.evaluate(() => { Math.random = window.postingOriginalRandom; delete window.postingOriginalRandom; });
    await page.getByText(`【ポスティング成立】${name} 入札額1.0億円`, { exact: true }).click();
    await expect(page.getByText(/球団受取移籍金: 2000万円/)).toBeVisible();
    await page.getByRole('button', { name: '球団運営', exact: true }).click();
    const budgetCard = page.locator('.card').filter({ has: page.getByText('予算 / 年俸上位', { exact: true }) });
    await expect(budgetCard).toContainText('3,000万円');
    const before = await saveHub(page);
    expect(before.teams.find(t => t.id === before.myId).budget).toBe(3000);
    await reloadAndLoad(page);
    const after = await saveHub(page);
    expect(after.teams.find(t => t.id === after.myId).budget).toBe(3000);
    const own = after.teams.find(t => t.id === after.myId);
    expect(own.players.some(p => p.id === playerId)).toBe(false);
    for (const key of ['lineup', 'lineupNoDh', 'lineupDh', 'rotation']) expect(own[key] || []).not.toContain(playerId);
    expect(after.mailbox).toEqual(before.mailbox);
    for (const other of initial.teams.filter(t => t.id !== initial.myId)) {
      const saved = after.teams.find(t => t.id === other.id);
      expect(saved.budget).toBe(other.budget);
      expect(saved.players.map(p => p.id)).toEqual(other.players.map(p => p.id));
      expect(saved.farm.map(p => p.id)).toEqual(other.farm.map(p => p.id));
    }
    await page.getByRole('complementary', { name: '監督メニュー' }).getByRole('button', { name: /その他/ }).click();
    await page.getByText('D01 ポスティング申請', { exact: true }).click();
    await expect(page.getByRole('button', { name: '✅ 承認する', exact: true })).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

for (const legacy of [false, true]) {
test(`D01 rejection preserves the budget and roster through real save/reload (${legacy ? 'legacy inline v4' : 'chunked v4'})`, async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const { playerId, morale } = await loadPostingFixture(page, legacy);
  const initial = await saveHub(page);
  await openMail(page);
  await page.getByRole('button', { name: '❌ 拒否する', exact: true }).click();
  const before = await saveHub(page);
  await reloadAndLoad(page);
  const after = await saveHub(page);
  const team = after.teams.find(t => t.id === after.myId);
  expect(team.budget).toBe(1000);
  expect(team.players.some(p => p.id === playerId)).toBe(true);
  expect(team.players.find(p => p.id === playerId).morale).toBe(Math.max(0, morale - 10));
  expect(after.teams).toEqual(before.teams);
  expect(after.mailbox.some(m => m.type === 'posting_result')).toBe(false);
  expect(after.mailbox.find(m => m.id === 'posting-request')).toMatchObject({ resolved: true, read: true });
  for (const other of initial.teams.filter(t => t.id !== initial.myId)) {
    const saved = after.teams.find(t => t.id === other.id);
    expect(saved.budget).toBe(other.budget);
    expect(saved.players.map(p => p.id)).toEqual(other.players.map(p => p.id));
    expect(saved.farm.map(p => p.id)).toEqual(other.farm.map(p => p.id));
  }
  await openMail(page);
  await expect(page.getByRole('button', { name: '✅ 承認する', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '❌ 拒否する', exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});
}

test('D01 leaves a legacy budget unchanged rather than guessing a historical correction', async ({ page }) => {
  await loadPostingFixture(page, true, 20_001_000);
  const before = await saveHub(page);
  expect(before.teams.find(t => t.id === before.myId).budget).toBe(20_001_000);
  await reloadAndLoad(page);
  const after = await saveHub(page);
  expect(after.teams.find(t => t.id === after.myId).budget).toBe(20_001_000);
});
