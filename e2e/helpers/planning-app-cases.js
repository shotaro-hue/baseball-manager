import {test,expect} from '@playwright/test';
import {loadFixture,reloadAndLoad,readSave,waitSaveIdle} from './progression';
export async function seedPlanning(page,{resume=true}={}){
 // Prepare the final save before opening App; do not start and immediately
 // navigate away from an unrelated lazy-loaded postseason screen.
 await loadFixture(page,'draw-complete',{resume:false});
 const info=await page.evaluate(async()=>{
  const {loadGame,saveGame}=await import('/baseball-manager/src/engine/saveload.js');const s=await loadGame(),my=s.teams.find(t=>t.id===s.myId);
  const owned=[...my.players,...my.farm];owned.forEach(p=>{p.contractYearsLeft=3;p.contractYears=3;});const targets=my.players.slice(0,3);targets.forEach(p=>p.contractYearsLeft=1);
  const candidate={...targets[0],id:'ui03a-market',name:'編成確認FA候補',salary:900,contractYears:1,contractYearsLeft:0,isFA:true,isForeign:false,marketEntryReason:'自由契約',faEnteredYear:s.year,faOriginTeamId:s.teams.find(t=>t.id!==s.myId).id,stats:{...targets[0].stats,PA:400,AB:350,H:100,HR:20}};
  s.faPool=[candidate];s.offseasonPlan={version:1,year:s.year,myId:s.myId,stage:'planning',resumeScreen:'offseason_planning',tab:'roster',intents:[],releasedIds:[],growth:{growth:[],decline:[],breakout:[]},demands:Object.fromEntries(targets.map(p=>[p.id,{demandSalary:p.salary,minAcceptSalary:p.salary}]))};
  if(!(await saveGame(s)).ok)throw Error('planning fixture save failed');return {targets:targets.map(p=>({id:p.id,name:p.name,salary:p.salary})),budget:my.budget,year:s.year};
 });if(resume){await reloadAndLoad(page);await expect(page.locator('.planning-screen')).toBeVisible();}return info;
}
export async function savePlanning(page){
 const button=page.getByRole('button',{name:'編成内容を保存する',exact:true});await expect(button).toBeEnabled();await button.click();await expect(page.locator('.planning-save')).toContainText('保存済み');await waitSaveIdle(page);return readSave(page);
}
export function registerPlanningAppCases(){
 for(const width of [360,390,1440])test(`UI-03A actual App drafts release market and save reload ${width}`,async({page},testInfo)=>{
  test.setTimeout(120_000);await page.setViewportSize({width,height:900});const errors=[];page.on('pageerror',e=>errors.push(e.message));const info=await seedPlanning(page);const before=await savePlanning(page);
  const policy=page.locator('.renewal-list'),target=info.targets[2];
  const selectTarget=()=>page.getByRole('button',{name:`${target.name}の契約更改`,exact:true}).click();
  const back=()=>page.getByRole('button',{name:'← 選手一覧に戻る',exact:true}).click();
  await selectTarget();await page.getByRole('button',{name:'放出候補にする',exact:true}).click();const draft=await savePlanning(page);expect(draft.teams).toEqual(before.teams);expect(draft.offseasonPlan.intents).toContainEqual({id:target.id,value:'release'});
  await back();await page.getByRole('button',{name:'放出候補',exact:true}).click();await expect(policy.locator('.renewal-row')).toHaveCount(1);await selectTarget();await page.locator('.renewal-career>summary').click();const profile=page.getByRole('button',{name:`${target.name}の選手詳細・年度別成績`,exact:true});await profile.click();await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(profile).toBeFocused();
  if(width===390){
   testInfo.annotations.push({type:'expected-console-error',description:'Save failed: storage quota exceeded; committed generations retained'});
   await page.evaluate(()=>{const original=Storage.prototype.setItem;window.restorePlanningStorage=()=>{Storage.prototype.setItem=original;};Storage.prototype.setItem=function(key,value){if(key==='baseball_manager_v1')throw new DOMException('planning quota','QuotaExceededError');return original.call(this,key,value);};});
   await page.getByRole('button',{name:'放出候補を取り消して交渉する',exact:true}).click();await back();await expect(page.getByRole('button',{name:'放出候補',exact:true})).toBeFocused();
   const save=page.getByRole('button',{name:'編成内容を保存する',exact:true});await expect(save).toBeEnabled();await save.click();await expect(page.locator('.planning-save')).toContainText('保存失敗');
   expect((await readSave(page)).offseasonPlan.intents).toContainEqual({id:target.id,value:'release'});await page.evaluate(()=>window.restorePlanningStorage());await savePlanning(page);await reloadAndLoad(page);
   await page.getByRole('button',{name:'全員',exact:true}).click();await selectTarget();await expect(page.getByRole('button',{name:'放出候補にする',exact:true})).toBeVisible();await page.getByRole('button',{name:'放出候補にする',exact:true}).click();
  }
  if(await page.locator('.renewal-detail').isVisible())await back();
  await savePlanning(page);await reloadAndLoad(page);
  await page.getByRole('button',{name:'交渉・補強を始める',exact:true}).click();await page.getByRole('button',{name:'自球団',exact:true}).click();
  await page.getByRole('button',{name:'全員',exact:true}).click();await expect(policy.locator('.renewal-row')).toHaveCount(before.teams.find(t=>t.id===before.myId).players.length+before.teams.find(t=>t.id===before.myId).farm.length);
  await page.getByRole('button',{name:'まとめて提示を開く',exact:true}).click();await page.getByRole('button',{name:'提示可能な全員を選択',exact:true}).click();await page.getByRole('button',{name:'選択した選手の提示内容を確認',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('対象 2人');await expect(page.getByRole('dialog')).not.toContainText(target.name);await page.getByRole('dialog').getByRole('button',{name:'戻る',exact:true}).click();await page.getByRole('button',{name:'まとめて提示を閉じる',exact:true}).click();
  await page.locator('.renewal-candidates>summary').click();
  const opener=page.getByRole('button',{name:'放出の影響を確認する',exact:true});await opener.click();let dialog=page.getByRole('dialog',{name:'放出の最終確認',exact:true});await expect(dialog).toContainText(target.name);await page.getByRole('button',{name:'戻って見直す',exact:true}).click();await expect(opener).toBeFocused();
  await opener.click();await page.getByRole('button',{name:'確認して確定する',exact:true}).click();await expect(dialog).toBeHidden();await expect(page.locator('.planning-heading h1')).toBeFocused();
  const released=await savePlanning(page),club=released.teams.find(t=>t.id===released.myId);expect([...club.players,...club.farm].some(p=>p.id===target.id)).toBe(false);expect(club.budget).toBe(info.budget);expect(released.offseasonPlan.releasedIds.filter(id=>id===target.id)).toHaveLength(1);
  // Existing embedded renewal view remains mounted when switching tabs.
  await page.getByRole('button',{name:`${info.targets[0].name}の契約更改`,exact:true}).click();const offer=page.locator('.renewal-screen input[type="number"]').first();await offer.fill(String(info.targets[0].salary+123));
  await page.getByRole('button',{name:'補強市場',exact:true}).click();await page.getByRole('button',{name:'編成確認FA候補の条件を見る',exact:true}).click();await page.getByRole('button',{name:'契約条件を確認する',exact:true}).click();
  dialog=page.getByRole('dialog');await expect(dialog).toContainText('編成確認FA候補');await page.getByRole('button',{name:'契約を確定する',exact:true}).click();await page.getByRole('button',{name:'自球団',exact:true}).click();await expect(offer).toHaveValue(String(info.targets[0].salary+123));
  const signed=await savePlanning(page),now=signed.teams.find(t=>t.id===signed.myId),newPlayer=[...now.players,...now.farm].find(p=>p.id==='ui03a-market');expect(newPlayer).toBeDefined();expect(now.budget).toBe(info.budget-newPlayer.salary*newPlayer.contractYears);expect(signed.offseasonPlan.session.entries.find(e=>e.player.id===info.targets[0].id).salary).toBe(String(info.targets[0].salary+123));
  await back();await page.getByRole('button',{name:'編成確認FA候補の契約更改',exact:true}).click();
  await expect(page.locator('.renewal-conditions')).toContainText('契約年俸');await expect(page.locator('.renewal-conditions')).not.toContainText('前年年俸');await expect(page.locator('.renewal-conditions')).not.toContainText('要求年俸');
  await expect(page.locator('.renewal-player-summary')).toContainText('移籍前の一軍記録');await expect(page.locator('.renewal-player-summary')).toContainText('本塁打 20');expect(newPlayer.stats.HR).toBe(0);
  await page.getByRole('button',{name:'結果確認',exact:true}).click();await expect(page.getByRole('button',{name:'編成終了の最終確認',exact:true})).toBeDisabled();
  await page.screenshot({path:testInfo.outputPath(`actual-review-${width}.png`),fullPage:true});await savePlanning(page);await reloadAndLoad(page);await expect(page.getByRole('button',{name:'結果確認',exact:true})).toHaveAttribute('aria-pressed','true');
  const loaded=await readSave(page);expect(loaded.teams).toEqual(signed.teams);expect(loaded.offseasonPlan.session).toEqual(signed.offseasonPlan.session);expect(errors).toEqual([]);
 });
}
