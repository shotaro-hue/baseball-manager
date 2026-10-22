import { test, expect } from '@playwright/test';
import { reloadAndLoad } from './helpers/progression';
for(const width of [360,390]) test(`offseason save real 2026 DeNA progression and reload ${width}`,async({page},testInfo)=>{
 test.setTimeout(480000);await page.setViewportSize({width,height:844});
 const diagnostics=[];page.on('console',msg=>{if(msg.text().includes('[SaveDiagnostic]'))diagnostics.push(msg.text());});
 await page.goto('/');
 const seeded=await page.evaluate(async ()=>{
  const response=await fetch('/baseball-manager/e2e/fixtures/offseason-save-2026.json.gz');
  const fixture=await response.json();
  const save=await import('/baseball-manager/src/engine/saveload.js');const results=[];
  for(const state of [fixture.initial,fixture.midseason,fixture.postseason,fixture.postseason,fixture.postseason]){
   // Model normal saves separated by five minutes, without editing any root.
   localStorage.setItem('baseball_manager_v1_last_rotate_at','0');
   results.push(await save.saveGame(state));
  }
  return {results,rootChars:['','_bk1','_bk2'].map(k=>localStorage.getItem('baseball_manager_v1'+k)?.length)};
 });expect(seeded.results.every(r=>r.ok)).toBe(true);
 expect(seeded.rootChars.every(size=>size>0)).toBe(true);
 await reloadAndLoad(page);
 await page.getByRole('button',{name:'残り全試合をまとめてシム',exact:true}).click();
 await page.getByRole('button',{name:'引退・シーズン終了後の手続きへ',exact:true}).click();
 const next=page.getByRole('button',{name:'引退結果を確認して次へ',exact:true});
 // Wait for the lazy phase and bring its footer into the mobile viewport before inspecting it.
 await next.scrollIntoViewIfNeeded();await expect(next).toBeVisible();
 const retire=page.getByRole('button',{name:'引退を受け入れる',exact:true});while(await retire.count())await retire.first().click();
 await next.click();await page.getByRole('dialog').getByRole('button',{name:'確定して国内FA補強へ',exact:true}).click();
 const panel=page.locator('.planning-save');await expect(panel).toBeVisible({timeout:90000});
 // Let the real 750ms autosave settle before making an explicit save.
 await expect(panel).toContainText('保存済み',{timeout:90000});
 const saveButton=page.getByRole('button',{name:'編成内容を保存する',exact:true});await saveButton.click();
 await expect(panel).toContainText('保存済み',{timeout:90000});
 const signature=()=>page.evaluate(async()=>{
  const s=await(await import('/baseball-manager/src/engine/saveload.js')).loadGame();
  const t=s?.teams.find(t=>t.id===s.myId);
  return {year:s?.year,team:t?.name,owned:[...t.players,...t.farm].map(p=>[p.id,p.salary,p.contractYearsLeft]),stage:s?.offseasonPlan?.stage,planHash:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(s.offseasonPlan))))),fa:s?.faPool.map(p=>p.id)};
 });
 const before=await signature();expect(before.year).toBe(2026);expect(before.team).toBe('横浜DeNAベイスターズ');expect(before.stage).toBe('planning');
 await saveButton.click();await expect(panel).toContainText('保存済み',{timeout:90000});
 await reloadAndLoad(page);await expect(page.locator('.planning-heading')).toContainText('2026');expect(await signature()).toEqual(before);
 await page.screenshot({path:testInfo.outputPath(`progression-${width}.png`),fullPage:true});
 await testInfo.attach('save-diagnostics',{body:JSON.stringify({seeded,diagnostics}),contentType:'application/json'});
});
