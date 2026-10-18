import {test,expect} from '@playwright/test';
import {loadFixture,reloadAndLoad,readSave} from './helpers/progression';
import {savePlanning} from './helpers/planning-app-cases';

test('AI-03 real CPU planning class survives save resume and market completion',async({page})=>{
 test.setTimeout(120000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await loadFixture(page,'draw-complete',{resume:false});
 await page.evaluate(async()=>{
  const {loadGame,saveGame}=await import('/baseball-manager/src/engine/saveload.js');
  const s=await loadGame();
  // Begin at the real retirement callback, with no player retirement/renewal
  // decision pending. The tournament itself is outside this focused journey.
  s.offseasonPlan.resumeScreen='retire_phase';s.offseasonPlan.playoff.champion={id:1,name:s.teams[1].name};
  for(const t of s.teams)for(const p of [...t.players,...t.farm]){
   p.age=29;p.isRetired=false;delete p._retireNow;
   if(t.id===s.myId){p.contractYearsLeft=3;p.contractYears=3;}
  }
  if(!(await saveGame(s)).ok)throw Error('AI03 fixture save failed');
 });
 await reloadAndLoad(page);
 await page.getByRole('button',{name:'引退結果を確認して次へ',exact:true}).click();
 await page.getByRole('button',{name:'確定して国内FA補強へ',exact:true}).click();
 await expect(page.locator('.planning-screen')).toBeVisible();
 const before=await savePlanning(page),plan=before.offseasonPlan;
 expect(plan.cpuOpportunityPlanning).toBe(1);expect(plan.draftPool.length).toBeGreaterThanOrEqual(160);
 expect(plan.draftEvaluation.candidateIds).toHaveLength(plan.draftPool.length);
 expect(JSON.stringify(plan)).not.toContain('cpuDecisions');
 await reloadAndLoad(page);await expect(page.locator('.planning-screen')).toBeVisible();
 const resumed=await readSave(page);expect(resumed.offseasonPlan.draftPool).toEqual(plan.draftPool);
 expect(resumed.offseasonPlan.draftEvaluation).toEqual(plan.draftEvaluation);
 await page.getByRole('button',{name:'交渉・補強を始める',exact:true}).click();
 await page.getByRole('button',{name:'結果確認',exact:true}).click();
 await page.getByRole('button',{name:'編成終了の最終確認',exact:true}).click();
 await page.getByRole('button',{name:'確認して確定する',exact:true}).click();
 await expect(page.getByRole('button',{name:'ドラフトへ進む',exact:true})).toBeVisible();
 // This full-screen phase uses the existing autosave, with no hub save button.
 await expect.poll(async()=>(await readSave(page)).offseasonPlan.stage,{timeout:30000}).toBe('results');
 const after=await readSave(page);
 expect(after.offseasonPlan.draftPool).toEqual(plan.draftPool);
 expect(after.offseasonPlan.draftEvaluation).toEqual(plan.draftEvaluation);
 for(const t of after.teams){
  expect([...t.players,...t.farm].filter(p=>!p.育成&&!p.isIkusei).length).toBeLessThanOrEqual(70);
  expect(t.budget).toBeGreaterThanOrEqual(0);
 }
 await reloadAndLoad(page);await expect(page.getByRole('button',{name:'ドラフトへ進む',exact:true})).toBeVisible();
 expect(errors).toEqual([]);
});
