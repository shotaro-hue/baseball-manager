import { test, expect } from '@playwright/test';
import { loadFixture, saveHub, reloadAndLoad, readSave, runSingle, runBatch, progressSignature, mainNavigation } from './progression';


// Registered once by the existing CI progression spec.
export function registerHomeCases({ consumeExpectedError } = {}) {
for (const width of [390,760,761,1440]) test(`UI-01B shared progress controls stay visible and clickable ${width}`,async({page},testInfo)=>{
 test.setTimeout(90_000);await page.setViewportSize({width,height:900});await loadFixture(page,'opening');
 const mobile=width<=760,home=page.locator(mobile?'.mobile-home':'.calm-dashboard');
 await home.getByRole('button',{name:'まとめて進める',exact:true}).click();
 const homeSingle=home.locator('.home-settings').getByRole('button',{name:'1試合',exact:true});
 await expect(homeSingle).toBeHidden();
 await expect(home.getByRole('button',{name:mobile?'1試合ずつ采配':'試合へ進む',exact:true})).toBeVisible();
 for(const tab of ['日程','編成']){
  await mainNavigation(page,width<1024).getByRole('button',{name:new RegExp('^'+tab+'(?: \\d+)?$')}).click();
  const panel=page.locator('.flow-sim-settings');await panel.locator('summary').click();
  const single=panel.getByRole('button',{name:'1試合',exact:true});
  await expect(single).toBeVisible();await expect(single).toBeEnabled();
  await expect(panel.getByRole('button',{name:'まとめてシム',exact:true})).toBeVisible();
  await expect(panel.getByRole('button',{name:/^残り全\d+試合$/})).toBeVisible();
  const checks=panel.getByRole('checkbox');await checks.nth(0).check();await expect(checks.nth(1)).not.toBeChecked();
  await checks.nth(0).uncheck();await checks.nth(1).check();await expect(checks.nth(0)).not.toBeChecked();
  await page.screenshot({path:testInfo.outputPath(`shared-${tab}-${width}.png`),fullPage:true});
  await single.click();await page.getByRole('button',{name:/オートシムモード/}).click();
  await page.getByRole('button',{name:'ホームに戻る',exact:true}).click();
  await mainNavigation(page,width<1024).getByRole('button',{name:'ホーム',exact:true}).click();
  await expect(home.getByRole('heading',{name:'ホーム',exact:true})).toBeVisible();
 }
 const saved=await saveHub(page);expect(progressSignature(saved).played).toBe(2);
});

for(const width of [390,1440]) test(`UI-01B corrupt saves cannot start regular games ${width}`,async({page})=>{
 test.setTimeout(60_000);await page.setViewportSize({width,height:900});
 for(const kind of ['missing','duplicate','cursor']){
  await loadFixture(page,'opening');
  await page.evaluate(async kind=>{
   const {loadGame,saveGame}=await import('/baseball-manager/src/engine/saveload.js');const s=await loadGame();
   if(kind==='missing')delete s.schedule[s.gameDay];
   if(kind==='duplicate')s.gameResultsMap[s.gameDay]={won:true,myScore:1,oppScore:0};
   if(kind==='cursor')s.gameDay+=1;
   if(!(await saveGame(s)).ok)throw new Error('corrupt fixture save failed');
  },kind);
  const before=progressSignature(await readSave(page));
  // Farm migration validates the official position before publishing a hub.
  // A corrupt save is rejected at load; do not bypass that safety gate in E2E.
  await page.reload();
  const rejected=page.waitForEvent('console',{predicate:message=>message.type()==='error'&&message.text().startsWith('セーブデータの読み込みに失敗しました:')});
  await page.getByRole('button',{name:'続きから',exact:true}).click();await rejected;
  await expect(page.getByRole('button',{name:'続きから',exact:true})).toBeVisible();
  await expect(page.locator('.calm-shell')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'まとめてシム',exact:true})).toHaveCount(0);
  expect(progressSignature(await readSave(page))).toEqual(before);
 }
});

test('UI-01B non-home batch action uses the native flow',async({page})=>{
 test.setTimeout(90_000);await page.setViewportSize({width:1440,height:900});await loadFixture(page,'opening');
 await mainNavigation(page,false).getByRole('button',{name:'日程',exact:true}).click();
 const panel=page.locator('.flow-sim-settings');await panel.locator('summary').click();
 await panel.getByLabel('まとめて進める試合数').selectOption('5');
 await panel.getByRole('button',{name:'まとめてシム',exact:true}).click();
 await page.getByRole('button',{name:'ホームへ戻る',exact:true}).click();
 expect(progressSignature(await saveHub(page)).played).toBe(5);
});

test('UI-01B non-home remaining season action uses the native flow',async({page})=>{
 test.setTimeout(60_000);await page.setViewportSize({width:1440,height:900});await loadFixture(page,'late');
 const press=page.getByRole('dialog',{name:'記者会見',exact:true});await expect(press).toBeVisible();
 await press.getByRole('button').filter({hasNotText:'回答する'}).nth(0).click();await press.getByRole('button',{name:'回答する',exact:true}).click();
 await mainNavigation(page,false).getByRole('button',{name:'日程',exact:true}).click();
 const panel=page.locator('.flow-sim-settings');await panel.locator('summary').click();await panel.getByRole('button',{name:'残り全1試合',exact:true}).click();
 await expect(page.getByRole('heading',{name:/2026年 ポストシーズン/})).toBeVisible({timeout:30_000});
 await page.getByRole('button',{name:'進行を保存',exact:true}).click();
 await expect.poll(async()=>{
  const saved=await readSave(page);
  // A concurrent publication may invalidate the old generation during a read.
  // Keep polling the persisted result instead of throwing on that transient null.
  return saved ? progressSignature(saved).played : null;
 }).toBe(143);
});

for(const [width,height] of [[360,800],[390,844],[1440,900]]) {
 test(`UI-01B real game, batch, saved resume and home actions ${width}`,async({page},testInfo)=>{
  test.setTimeout(90_000);await page.setViewportSize({width,height});const mobile=width<=760;
  const errors=[];page.on('pageerror',error=>errors.push(error.message));await loadFixture(page,'opening');
  const home=page.locator(mobile?'.mobile-home':'.calm-dashboard');
  await expect(home.getByRole('heading',{name:'ホーム',exact:true})).toBeVisible();
  await expect(home.locator('[data-ds="metrics"]')).toContainText('0−0−0');
  if(!mobile){
   const player=home.locator('tbody button').nth(1);await player.click();await expect(player).toHaveAttribute('aria-pressed','true');
   await home.getByRole('button',{name:'選手詳細を開く',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();
   await page.getByRole('button',{name:'＋ 比較',exact:true}).click();await page.getByRole('button',{name:'選手詳細を閉じる',exact:true}).click();
   await expect(page.getByRole('button',{name:'2人を比較'})).toBeVisible();
  }
  await runSingle(page,mobile);await expect(home.locator('.home-results')).toContainText('日程・結果');
  await expect(page.locator('.home-save')).not.toContainText('保存失敗');
  const first=await saveHub(page);expect(progressSignature(first).played).toBe(1);
  await reloadAndLoad(page);expect(progressSignature(await readSave(page))).toEqual(progressSignature(first));
  await runBatch(page,mobile,5);const batched=await saveHub(page);expect(progressSignature(batched).played).toBe(6);
  await expect(page.locator('.home-save')).toContainText('保存済み');
  await reloadAndLoad(page);expect(progressSignature(await readSave(page))).toEqual(progressSignature(batched));
  for(const [w,h] of [[360,800],[390,844],[760,900],[761,900],[1023,900],[1024,900],[1440,900]]) {
   await page.setViewportSize({width:w,height:h});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   const controls=await page.locator('.home-surface :is(button,select,summary):visible,.home-save button:visible').evaluateAll(elements=>elements.map(e=>({text:e.textContent,height:e.getBoundingClientRect().height})));
   expect(controls.filter(control=>control.height<44)).toEqual([]);
  }
  await page.setViewportSize({width,height});await page.screenshot({path:testInfo.outputPath(`real-home-${width}.png`),fullPage:true});
  await home.getByRole('button',{name:'編成を見直す',exact:true}).click();await expect(mobile?page.locator('.mobile-roster'):page.locator('.roster-full-settings')).toBeVisible();expect(errors).toEqual([]);
 });
}

test('UI-01B actual save pending, saving, failure and retry remain truthful',async({page})=>{
 test.setTimeout(60_000);await page.setViewportSize({width:390,height:844});await loadFixture(page,'opening');
 await runSingle(page,true);await saveHub(page);await expect(page.locator('.home-save')).toContainText('保存済み');
 await mainNavigation(page,true).getByRole('button',{name:'編成',exact:true}).click();
 await page.locator('.mobile-roster').getByLabel(/の打順/).first().selectOption('2');
 await mainNavigation(page,true).getByRole('button',{name:'ホーム',exact:true}).click();
 await expect(page.locator('.home-save')).toContainText('保存待ち');
 // Hold the existing browser origin lock, then request a real save through the UI.
 await page.evaluate(()=>{window.releaseHomeSaveLock=null;window.homeSaveLock=navigator.locks.request('baseball-manager-save',()=>new Promise(resolve=>{window.releaseHomeSaveLock=resolve;}));});
 await expect.poll(()=>page.evaluate(()=>typeof window.releaseHomeSaveLock)).toBe('function');
 await page.getByRole('button',{name:'保存',exact:true}).click();await expect(page.locator('.home-save')).toContainText('保存中');
 await page.evaluate(()=>window.releaseHomeSaveLock());await expect(page.locator('.home-save')).toContainText('保存済み');
 // A real localStorage write failure must not be replaced by an idle/success label.
 await page.evaluate(()=>{window.homeOriginalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='baseball_manager_v1')throw new DOMException('full','QuotaExceededError');return window.homeOriginalSet.call(this,key,value);};});
 await page.getByRole('button',{name:'保存',exact:true}).click();await expect(page.locator('.home-save')).toContainText('保存失敗');
  // Consume exactly one expected diagnostic from this intentional quota fault.
  consumeExpectedError('Save failed: storage quota exceeded; committed generations retained');
 await expect(page.getByRole('button',{name:'保存',exact:true})).toBeEnabled();
 await page.evaluate(()=>{Storage.prototype.setItem=window.homeOriginalSet;});await page.getByRole('button',{name:'保存',exact:true}).click();await expect(page.locator('.home-save')).toContainText('保存済み');
});

test('UI-01B season complete disables progress and retains postseason return',async({page})=>{
 await page.setViewportSize({width:390,height:844});await loadFixture(page,'draw-complete');
 await page.getByRole('button',{name:'編成を見直す',exact:true}).click();
 await mainNavigation(page,true).getByRole('button',{name:'ホーム',exact:true}).click();
 await expect(page.locator('.mobile-home')).toContainText('通常シーズンは終了しています。');
 await expect(page.locator('.mobile-home').getByRole('button',{name:'まとめて進める',exact:true})).toBeDisabled();
 await expect(page.getByRole('button',{name:'ポストシーズンに戻る',exact:true})).toBeVisible();
});

for(const [width,height] of [[360,800],[390,844],[1440,900]]) test(`UI-01B component abnormal states ${width}`,async({page},testInfo)=>{
 await page.setViewportSize({width,height});await page.goto('/baseball-manager/e2e/fixtures/ui01b/index.html');
 const home=page.locator(width<=760?'.mobile-home':'.calm-dashboard');
 for(const [state,reason] of [['no-schedule','未実行の対戦日程を確認できません'],['blocked','成績と日程の進行位置が一致しません'],['processing','試合を進行中です'],['complete','通常シーズンは終了しています']]){
  await page.getByLabel('表示状態').selectOption(state);await expect(home).toContainText(reason);
  await expect(home.getByRole('button',{name:'まとめて進める',exact:true})).toBeDisabled();
  if(state==='no-schedule')await expect(page.locator('.home-header')).toContainText('日程なし');
  if(state==='processing'){await expect(home).toContainText('2/5');await expect(home.getByLabel('まとめて進める試合数')).toBeDisabled();}
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath(`state-${state}-${width}.png`),fullPage:true});
 }
});

}
