import { test, expect } from '@playwright/test';
import { loadFixture, reloadAndLoad, readSave, waitSaveIdle } from './progression';

async function seedRenewal(page, embedded) {
  await loadFixture(page, 'draw-complete'); await waitSaveIdle(page); await page.goto('/');
  const info = await page.evaluate(async embedded => {
    const { loadGame, saveGame } = await import('/baseball-manager/src/engine/saveload.js');
    const s = await loadGame(), team = s.teams.find(t => t.id === s.myId);
    [...team.players, ...team.farm].forEach(p => { p.contractYearsLeft = 3; p.contractYears = 3; });
    const targets = [...team.players.slice(0, 4), ...team.farm.slice(0, 3)];
    targets.forEach((p, i) => { p.contractYearsLeft = 1; p.salary = i === 6 ? 300 : i === 0 || i === 4 ? 1000 : 10000; p.daysOnActiveRoster = i === 3 ? 10000 : 0; p.育成 = i === 6; p.ikuseiYears = i === 6 ? 2 : 0; });
    // The numeric-zero identity is exercised through the real farm update path.
    targets[4].id = 0;
    const demands = Object.fromEntries(targets.map((p, i) => [p.id, { demandSalary: [1, 2, 3, 5].includes(i) ? 50000 : p.salary, minAcceptSalary: [1, 2, 3, 5].includes(i) ? 40000 : p.salary }]));
    s.faPool = [];
    s.offseasonPlan = { version: 1, year: s.year, myId: s.myId, stage: 'open', resumeScreen: embedded ? 'offseason_planning' : 'contract_renewal_phase', tab: 'roster', intents: [], releasedIds: [], growth: { growth: [], decline: [], breakout: [] }, demands };
    if (!(await saveGame(s)).ok) throw Error('renewal fixture save failed');
    return { targets: targets.map(p => ({ id: p.id, name: p.name, salary: p.salary })), budget: team.budget, year: s.year, count: [...team.players, ...team.farm].length };
  }, embedded);
  await reloadAndLoad(page); await expect(page.locator('.renewal-screen')).toBeVisible(); return info;
}
async function sessionEntry(page, id) {
  return page.evaluate(async id => (await (await import('/baseball-manager/src/engine/saveload.js')).loadGame())?.offseasonPlan?.session?.entries.find(e => e.player.id === id), id);
}
async function saveAndRead(page, embedded, id, status) {
  if (embedded) {
    const save = page.getByRole('button', { name: '編成内容を保存する', exact: true });
    await expect(save).toBeEnabled(); await save.click(); await expect(page.locator('.planning-save')).toContainText('保存済み');
  }
  await expect.poll(async () => (await sessionEntry(page, id))?.status, { timeout: 15_000 }).toBe(status);
  await waitSaveIdle(page); return readSave(page);
}
async function offer(page, amount, cut = false) {
  await page.getByLabel('提示年俸（万円）', { exact: true }).fill(String(amount));
  await page.getByRole('button', { name: 'オファーを出す', exact: true }).click();
  await page.getByRole('button', { name: cut ? 'この条件で提示する' : 'この条件を提示する', exact: true }).click();
}
export function registerRenewalAppCases() {
  for (const [embedded, widths] of [[true, [360, 390, 1024, 1440]], [false, [390, 1440]]]) for (const width of widths) test(`UI-03B actual App ${embedded ? 'embedded' : 'standalone'} negotiation save and finish ${width}`, async ({ page }, testInfo) => {
    test.setTimeout(120_000); await page.setViewportSize({ width, height: 900 });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const info = await seedRenewal(page, embedded), target = info.targets;
    const select = p => page.getByRole('button', { name: `${p.name}の契約更改`, exact: true }).click();
    const back = () => page.getByRole('button', { name: '← 選手一覧に戻る', exact: true }).click();
    const screen = page.locator('.renewal-screen');
    await select(target[0]); await page.getByLabel('提示年俸（万円）', { exact: true }).fill('1320');
    if (embedded) { await page.getByRole('button', { name: '補強市場', exact: true }).click(); await page.getByRole('button', { name: '自球団', exact: true }).click(); await expect(page.getByLabel('提示年俸（万円）', { exact: true })).toHaveValue('1320'); }
    const draft = await saveAndRead(page, embedded, target[0].id, 'pending');
    await expect.poll(async () => (await sessionEntry(page, target[0].id))?.salary).toBe('1320');
    await reloadAndLoad(page); await expect(page.getByLabel('提示年俸（万円）', { exact: true })).toHaveValue('1320');
    await offer(page, 1320); await expect(screen.locator('.renewal-agreement')).toContainText('1,320万円・1年'); await back();
    // Numeric ID zero, farm location, multi-year agreement and ikusei cap.
    await select(target[4]); await page.getByLabel('契約年数', { exact: true }).selectOption('2'); await offer(page, 1000); await back();
    await select(target[6]); await expect(page.getByLabel('契約年数', { exact: true }).locator('option')).toHaveCount(1); await offer(page, 300); await back();
    // Stable refusal below demand but inside the cut boundary: three rounds then cooldown.
    await select(target[1]); for (let i = 0; i < 3; i++) await offer(page, 7500);
    await expect(screen.getByRole('button', { name: '再交渉する', exact: true })).toBeVisible(); await back();
    // No automatic free contract; explicit confirmation is still required.
    await select(target[2]); await offer(page, 5000, true);
    await expect(screen).toContainText('減額制限の対応待ち'); await back();
    // FA eligibility is distinct from a rejected over-limit cut.
    await select(target[3]); for (let i = 0; i < 3; i++) await offer(page, 7500);
    await expect(screen).toContainText('FA宣言'); await back();
    // A confirmed non-renewal remains in the ledger after the live roster removes it.
    await select(target[5]); await page.getByText('契約を更新しない場合', { exact: true }).click();
    await page.getByRole('button', { name: '戦力外を検討する', exact: true }).click(); await page.getByRole('button', { name: '戦力外を確定する', exact: true }).click(); await back();
    const beforeReload = await saveAndRead(page, embedded, target[2].id, 'free_requested');
    const team = beforeReload.teams.find(t => t.id === beforeReload.myId);
    expect(team.budget).toBe(info.budget); expect(team.farm.find(p => p.id === 0)).toMatchObject({ salary: 1000, contractYears: 2, contractSignedYear: info.year });
    expect(team.players.some(p => p.id === 0)).toBe(false);
    expect(beforeReload.offseasonPlan.session.entries.map(e => e.status).sort()).toEqual(['signed', 'signed', 'signed', 'cooldown', 'free_requested', 'fa', 'released'].sort());
    await reloadAndLoad(page); await expect(screen).toBeVisible();
    expect((await readSave(page)).offseasonPlan.session).toEqual(beforeReload.offseasonPlan.session);
    if (embedded) { await page.getByRole('button', { name: '結果確認', exact: true }).click(); await expect(page.getByRole('button', { name: '編成終了の最終確認', exact: true })).toBeDisabled(); await page.getByRole('button', { name: '自球団', exact: true }).click(); }
    else await expect(page.getByRole('button', { name: '更改結果を確認する', exact: true })).toBeDisabled();
    await select(target[1]); await page.getByRole('button', { name: '再交渉する', exact: true }).click(); await offer(page, 50000); await back();
    await select(target[2]); await page.getByRole('button', { name: '自由契約の手続きへ', exact: true }).click();
    await page.keyboard.press('Escape'); await expect(page.getByRole('button', { name: '自由契約の手続きへ', exact: true })).toBeFocused();
    await page.getByRole('button', { name: '自由契約の手続きへ', exact: true }).click(); await page.getByRole('button', { name: '自由契約を確定する', exact: true }).click(); await back();
    const done = await saveAndRead(page, embedded, target[2].id, 'free');
    const finalTeam = done.teams.find(t => t.id === done.myId);
    expect(done.faPool.find(p => p.id === target[2].id)).toMatchObject({ departureReason: 'salary_cut' });
    expect(finalTeam.budget).toBe(info.budget); expect(finalTeam.players.find(p => p.id === target[1].id)).toMatchObject({ salary: 50000, contractSignedYear: info.year });
    expect(done.offseasonPlan.session.entries.every(e => ['signed', 'free', 'fa', 'released'].includes(e.status))).toBe(true);
    expect(draft.teams.find(t => t.id === draft.myId).players[0].salary).toBe(target[0].salary);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`actual-${embedded ? 'embedded' : 'standalone'}-${width}.png`), fullPage: true });
    if (embedded) {
      await page.getByRole('button', { name: '結果確認', exact: true }).click(); await page.getByRole('button', { name: '編成終了の最終確認', exact: true }).click(); await page.getByRole('button', { name: '確認して確定する', exact: true }).click();
      await expect(page.getByRole('heading', { name: '自由契約の結果', exact: true })).toBeVisible();
    } else {
      await page.getByRole('button', { name: '更改結果を確認する', exact: true }).click(); await page.getByRole('button', { name: '確定して次へ進む', exact: true }).click();
      await expect(page.getByRole('heading', { name: '選手成長レポート', exact: true })).toBeVisible();
    }
    expect(errors).toEqual([]);
  });
}
