import { test, expect } from '@playwright/test';
import { seedPlanning } from './helpers/planning-app-cases';
import { readSave, reloadAndLoad, waitSaveIdle } from './helpers/progression';

for (const width of [360, 390, 1440]) test(`offseason save failure stays visible and retries without discarding edits ${width}`, async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.setViewportSize({width, height:width === 360 ? 800 : width === 390 ? 844 : 900});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const info = await seedPlanning(page, {resume:false});
  await reloadAndLoad(page);
  await expect(page.locator('.planning-screen')).toBeVisible({timeout:15_000});
  const save = page.getByRole('button', {name:'編成内容を保存する', exact:true});
  await expect(save).toBeEnabled();
  await save.click();
  await waitSaveIdle(page);
  await expect(page.locator('.planning-save')).toContainText('保存済み', {timeout:15_000});
  const target = info.targets[0];
  await page.evaluate(() => {
    const keys = ['baseball_manager_v1', 'baseball_manager_v1_bk1', 'baseball_manager_v1_bk2'];
    window.feedbackRootsBefore = keys.map(key => localStorage.getItem(key));
    const original = Storage.prototype.setItem;
    window.restoreFeedbackStorage = () => {Storage.prototype.setItem = original;};
    Storage.prototype.setItem = function(key, value) {
      if (key === 'baseball_manager_v1') throw new DOMException('injected quota failure', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await page.getByRole('button', {name:`${target.name}の契約更改`, exact:true}).click();
  await page.getByRole('button', {name:'放出候補にする', exact:true}).click();
  await page.getByRole('button', {name:'← 選手一覧に戻る', exact:true}).click();
  await expect(save).toBeEnabled();
  await save.click();
  const failure = page.locator('.planning-save-failure');
  await expect(failure).toContainText('保存容量が不足しています', {timeout:15_000});
  await expect(failure).toContainText('今回の変更は未保存です');
  await expect(failure).toContainText('画面を閉じる');
  await expect(failure).toContainText('再試行');
  // This route has no HubShell notification; wait beyond notify's 3.5s lifetime anyway.
  await page.waitForTimeout(4_000);
  await expect(page.locator('.notif')).toHaveCount(0);
  await page.getByRole('button', {name:'放出候補', exact:true}).click();
  await expect(failure).toBeVisible();
  await expect(page.getByRole('button', {name:`${target.name}の契約更改`, exact:true})).toBeVisible();
  // Let the view-change autosave debounce finish before taking a stable failure image.
  await page.waitForTimeout(1_000);
  await waitSaveIdle(page);
  expect(await page.evaluate(() => ['baseball_manager_v1', 'baseball_manager_v1_bk1', 'baseball_manager_v1_bk2']
    .every((key, index) => localStorage.getItem(key) === window.feedbackRootsBefore[index]))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await failure.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(failure).toContainText('quota_exceeded');
  const controls = await page.locator('.planning-save button,.planning-save summary').evaluateAll(nodes =>
    nodes.filter(node => node.getClientRects().length).map(node => node.getBoundingClientRect().height));
  expect(controls.every(height => height >= 44)).toBe(true);
  await page.screenshot({path:testInfo.outputPath(`after-${width}.png`), fullPage:true});

  await page.evaluate(() => {
    window.restoreFeedbackStorage();
    const original = navigator.locks.request.bind(navigator.locks);
    window.feedbackSaveGate = new Promise(resolve => {window.releaseFeedbackSave = resolve;});
    navigator.locks.request = (...args) => window.feedbackSaveGate.then(() => original(...args));
    window.restoreFeedbackLock = () => {navigator.locks.request = original;};
  });
  await save.click();
  await expect(save).toBeDisabled();
  await expect(page.locator('.planning-save')).toContainText('保存中');
  await expect(failure).toBeVisible();
  await page.evaluate(() => {window.releaseFeedbackSave();window.restoreFeedbackLock();});
  await expect(failure).toHaveCount(0, {timeout:15_000});
  await expect(page.locator('.planning-save')).toContainText('保存済み');
  await expect(save).toBeEnabled();
  await waitSaveIdle(page);
  const saved = await readSave(page);
  expect(saved.offseasonPlan.intents).toContainEqual({id:target.id,value:'release'});
  if (width === 390) {
    await reloadAndLoad(page);
    await expect(page.locator('.planning-screen')).toBeVisible({timeout:15_000});
    await expect(page.getByRole('button', {name:'放出候補', exact:true})).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', {name:`${target.name}の契約更改`, exact:true})).toBeVisible();
    expect((await readSave(page)).offseasonPlan.intents).toContainEqual({id:target.id,value:'release'});
  }
  expect(errors).toEqual([]);
});
