import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { mainNavigation, readSave, reloadAndLoad, saveHub } from './helpers/progression';

const primary = 'baseball_manager_v1';
const metaKey = `${primary}_meta`;
const roots = [primary, `${primary}_bk1`, `${primary}_bk2`];
const resume = page => page.getByRole('button', { name: '続きから', exact: true });
const active = page => page.locator('[data-hub-route]:not([hidden])');
const fresh = () => JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/new-game.json.gz', import.meta.url))));
async function saveFixture(page, fixture, kind = 'valid') {
  await page.goto('/');
  return page.evaluate(async ({ fixture, kind, primary, metaKey, roots }) => {
    const mod = await import('/baseball-manager/src/engine/saveload.js');
    const original = Storage.prototype.setItem;
    if (kind === 'write-failed') Storage.prototype.setItem = function(key, value) {
      if (key === metaKey) throw new Error('metadata fault');
      return original.call(this, key, value);
    };
    let result;
    try {
      result = await mod.saveGame(fixture);
      if (!result.ok) throw new Error('core fixture save failed');
    } finally { Storage.prototype.setItem = original; }
    if (['backup-corrupt', 'backup-only', 'backup-two'].includes(kind)) {
      const second = await mod.saveGame({ ...fixture, gameDay: 2 });
      if (!second.ok) throw new Error('second generation save failed');
      if (kind === 'backup-two') {
        // Rotation is intentionally throttled for five minutes in production.
        // Advance only that test fixture clock marker; leave save/recovery real.
        localStorage.removeItem('baseball_manager_v1_last_rotate_at');
        if (!(await mod.saveGame({ ...fixture, gameDay: 3 })).ok) throw new Error('third generation save failed');
        localStorage.setItem(roots[1], 'broken');
      }
      if (kind === 'backup-only') localStorage.removeItem(primary);
      else localStorage.setItem(primary, 'broken');
    }
    if (kind !== 'valid') localStorage.removeItem(metaKey);
    if (kind === 'malformed') localStorage.setItem(metaKey, '{broken');
    if (kind === 'invalid-shape') localStorage.setItem(metaKey, '{"teamName":{},"year":2026}');
    return { result, before: roots.map(key => localStorage.getItem(key)) };
  }, { fixture, kind, primary, metaKey, roots });
}

for (const kind of ['valid', 'missing', 'malformed', 'invalid-shape', 'write-failed', 'backup-corrupt', 'backup-only', 'backup-two']) {
  test(`core reliability title resumes ${kind}`, async ({ page }) => {
    const fixture = fresh(); const { result, before } = await saveFixture(page, fixture, kind);
    if (kind === 'write-failed') expect(result).toMatchObject({ ok: true, warnings: ['metadata_failed'] });
    await page.reload(); await expect(resume(page)).toBeVisible();
    if (kind === 'valid') await expect(page.locator('.title')).toContainText(fixture.teams.find(t => t.id === fixture.myId).name);
    else await expect(page.getByText('保存データあり・詳細未取得', { exact: true })).toBeVisible();
    expect(await page.evaluate(roots => roots.map(key => localStorage.getItem(key)), roots)).toEqual(before);
    await resume(page).click(); await expect(page.locator('.topbar')).toBeVisible();
    if (kind.startsWith('backup')) await expect(page.getByText('バックアップから復旧しました。その後の未保存の変更は含まれません。', { exact: true })).toBeVisible();
    const saved = await readSave(page);
    expect(saved.saveId).toBe(fixture.saveId); expect(saved.gameDay).toBe(fixture.gameDay);
  });
}
test('core reliability no roots does not offer resume despite stale metadata', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(metaKey => localStorage.setItem(metaKey, JSON.stringify({ teamName: '過去球団', year: 2026, gameDay: 1 })), metaKey);
  await page.reload();
  await expect(page.getByRole('button', { name: '読売ジャイアンツ', exact: true })).toBeVisible();
  await expect(resume(page)).toHaveCount(0);
});
test('core reliability unrecoverable roots stay intact after failed resume', async ({ page }) => {
  await page.goto('/');
  await page.clock.install();
  await page.evaluate(roots => roots.forEach(key => localStorage.setItem(key, 'broken')), roots);
  await page.reload(); await resume(page).click();
  await expect(page.getByText('セーブとバックアップを復旧できませんでした。必要な履歴が欠損・破損しています。', { exact: true })).toBeVisible();
  await expect(page.locator('.topbar')).toHaveCount(0); await expect(resume(page)).toBeVisible();
  expect(await page.evaluate(roots => roots.map(key => localStorage.getItem(key)), roots)).toEqual(['broken', 'broken', 'broken']);
  // Move beyond the ordinary toast's lifetime, without waiting in real time.
  await page.clock.runFor(5000);
  await expect(page.getByRole('alert')).toContainText('セーブとバックアップを復旧できませんでした');
  await expect(resume(page)).toBeEnabled();
  await resume(page).click();
  await expect(page.getByRole('alert')).toContainText('セーブとバックアップを復旧できませんでした');
  expect(await page.evaluate(roots => roots.map(key => localStorage.getItem(key)), roots)).toEqual(['broken', 'broken', 'broken']);
  const fixture = fresh();
  // Repair the fixture in place, keeping the failed title mounted for the retry.
  expect(await page.evaluate(async fixture => {
    const mod = await import('/baseball-manager/src/engine/saveload.js');
    return (await mod.saveGame(fixture)).ok;
  }, fixture)).toBe(true);
  await resume(page).click(); await expect(page.locator('.topbar')).toBeVisible();
  await expect(page.getByText('セーブとバックアップを復旧できませんでした。必要な履歴が欠損・破損しています。', { exact: true })).toHaveCount(0);
  expect((await readSave(page)).saveId).toBe(fixture.saveId);
});

async function openNews(page) {
  await page.getByRole('button', { name: /^通知（未読/ }).click();
  await page.getByRole('navigation', { name: '通知メニュー' }).getByRole('button', { name: 'ニュース', exact: true }).click();
  await expect(active(page)).toHaveAttribute('data-hub-route', 'news');
}
function newsFixture() {
  const fixture = fresh();
  fixture.news = [
    { id: 'core-interview', type: 'interview', headline: 'CORE 回答待ち会見', source: 'テスト紙', dateLabel: '開幕前', body: '今季の抱負', question: '目標は？', options: [{ text: 'CORE 優勝を目指します', popMod: 5, moraleMod: 7 }] },
    { id: 'core-answered', type: 'interview', headline: 'CORE 回答済み会見', source: 'テスト紙', dateLabel: '開幕前', answered: true, options: [{ text: 'CORE 未保存の選択肢', popMod: 8, moraleMod: 4 }] },
  ];
  fixture.seasonHistory.transfers = [
    { id: 'core-old', year: fixture.year - 1, day: 12, headline: 'CORE 昨季移籍', playersIn: ['加入選手A'], playersOut: ['放出選手B'], cash: 0 },
    { id: 'core-current', year: fixture.year, day: 1, headline: 'CORE 今季移籍', playersIn: ['加入選手C'], playersOut: [], cash: 500 },
    { id: 'core-cpu', year: fixture.year, day: 1, headline: 'CORE CPU間金額なし', playersIn: ['CPU加入'], playersOut: ['CPU放出'] },
    { id: 'core-null', year: fixture.year, day: 1, headline: 'CORE 未記録金額', cash: null },
    { id: 'core-invalid', year: fixture.year, day: 1, headline: 'CORE 不正金額', cash: 'invalid' },
    { id: 'core-negative', year: fixture.year, day: 1, headline: 'CORE 金銭受取', cash: -1250 },
    { id: 'core-legacy', year: fixture.year - 1, day: 12, headline: 'CORE 旧金額文字列', cash: '750' },
  ];
  return fixture;
}
for (const width of [360, 390, 1440]) {
  test(`core reliability interview and transfer persistence ${width}px`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width, height: 900 });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const fixture = newsFixture(); await saveFixture(page, fixture); await reloadAndLoad(page);
    await expect(page.locator('.topbar')).toBeVisible();
    const before = await saveHub(page);
    await openNews(page);
    await expect(active(page).getByText('CORE 昨季移籍', { exact: true })).toBeVisible();
    await expect(active(page).getByText('CORE 今季移籍', { exact: true })).toBeVisible();
    await expect(active(page)).not.toContainText('NaN');
    await expect(active(page).getByText('金銭支払い 500万円', { exact: true })).toBeVisible();
    await expect(active(page).getByText('金銭受取 1,250万円', { exact: true })).toBeVisible();
    await expect(active(page).getByText('金銭支払い 750万円', { exact: true })).toBeVisible();
    expect(await active(page).getByText(/金銭(?:支払い|受取) [\d,]+万円/).count()).toBe(3);
    await active(page).getByRole('combobox').selectOption(String(fixture.year - 1));
    await expect(active(page).getByText('CORE 今季移籍', { exact: true })).toHaveCount(0);
    await expect(active(page).getByText('CORE 昨季移籍', { exact: true })).toBeVisible();
    await expect(active(page).getByText('金銭支払い 750万円', { exact: true })).toBeVisible();
    await expect(active(page).getByText('金銭受取 1,250万円', { exact: true })).toHaveCount(0);
    await active(page).getByRole('combobox').selectOption('all');
    await active(page).getByText('CORE 回答済み会見', { exact: true }).click();
    await expect(active(page).getByText('回答済み', { exact: true })).toBeVisible();
    await expect(active(page).getByText('CORE 未保存の選択肢', { exact: true })).toHaveCount(0);
    await active(page).getByRole('button', { name: '✕', exact: true }).click();
    await active(page).getByText('CORE 回答待ち会見', { exact: true }).click();
    const choice = active(page).getByText('CORE 優勝を目指します', { exact: true });
    // Two synchronous DOM events exercise React batching as well as the command guard.
    await choice.evaluate(node => { node.click(); node.click(); });
    await expect(active(page).getByText('回答済み', { exact: true })).toBeVisible();
    await expect(choice).toHaveCount(0);
    await active(page).getByRole('button', { name: '✕', exact: true }).click();
    await active(page).getByText('CORE 回答待ち会見', { exact: true }).click();
    await expect(choice).toHaveCount(0);
    await page.getByRole('navigation', { name: '通知メニュー' }).getByRole('button', { name: /^受信箱/ }).click();
    await page.getByRole('navigation', { name: '通知メニュー' }).getByRole('button', { name: 'ニュース', exact: true }).click();
    await active(page).getByText('CORE 回答待ち会見', { exact: true }).click();
    await expect(active(page).getByText('回答済み', { exact: true })).toBeVisible();
    await expect(choice).toHaveCount(0);
    const after = await saveHub(page), oldTeam = before.teams.find(t => t.id === before.myId), mine = after.teams.find(t => t.id === after.myId);
    expect(mine.popularity).toBe(Math.min(100, (oldTeam.popularity || 50) + 5));
    expect(mine.players.map(p => p.morale)).toEqual(oldTeam.players.map(p => Math.min(100, (p.morale || 60) + 7)));
    expect(mine.farm).toEqual(oldTeam.farm);
    expect(after.teams.filter(t => t.id !== after.myId)).toEqual(before.teams.filter(t => t.id !== before.myId));
    expect(after.news.find(n => n.id === 'core-interview').answered).toBe(true);
    expect(after.seasonHistory.transfers).toEqual(fixture.seasonHistory.transfers);
    await mainNavigation(page, width < 1024).getByRole('button', { name: 'ホーム', exact: true }).click();
    await reloadAndLoad(page); await openNews(page);
    await active(page).getByText('CORE 回答待ち会見', { exact: true }).click();
    await expect(active(page).getByText('回答済み', { exact: true })).toBeVisible();
    await expect(choice).toHaveCount(0);
    await active(page).getByRole('combobox').selectOption(String(fixture.year));
    await expect(active(page).getByText('CORE 今季移籍', { exact: true })).toBeVisible();
    await expect(active(page).getByText('CORE 昨季移籍', { exact: true })).toHaveCount(0);
    await expect(active(page)).not.toContainText('NaN');
    await expect(active(page).getByText('金銭受取 1,250万円', { exact: true })).toBeVisible();
    const persisted = (await readSave(page)).seasonHistory.transfers;
    expect(persisted.find(t => t.id === 'core-cpu')).not.toHaveProperty('cash');
    expect(persisted.find(t => t.id === 'core-null').cash).toBeNull();
    expect(persisted.find(t => t.id === 'core-invalid').cash).toBe('invalid');
    expect((await saveHub(page)).teams).toEqual(after.teams);
    expect(errors).toEqual([]);
  });
}
test('core reliability empty transfer history survives save and reload', async ({ page }) => {
  const fixture = fresh(); fixture.seasonHistory.transfers = [];
  await saveFixture(page, fixture); await reloadAndLoad(page); await openNews(page);
  await expect(active(page).getByText('この年度の移籍ログはまだありません', { exact: true })).toBeVisible();
  expect((await saveHub(page)).seasonHistory.transfers).toEqual([]);
  await reloadAndLoad(page); await openNews(page);
  await expect(active(page).getByText('この年度の移籍ログはまだありません', { exact: true })).toBeVisible();
});
