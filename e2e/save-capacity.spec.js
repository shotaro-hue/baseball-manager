import {test,expect} from '@playwright/test';
import {existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
test.beforeAll(()=>{
  test.setTimeout(240000);
  if(!existsSync('e2e/fixtures/save-capacity-generated.json.gz'))execFileSync(process.execPath,['scripts/generate-save-capacity-fixture.mjs'],{timeout:240000,stdio:'pipe'});
});
for(const years of [0,10,20])test(`save capacity Hanshin 106 with ${years} equivalent years, three backups and cold reload`,async({page},testInfo)=>{
  test.setTimeout(600000);
  await page.goto('/',{waitUntil:'domcontentloaded'});
  const result=await page.evaluate(async years=>{
    const fixture=await(await fetch('/baseball-manager/e2e/fixtures/save-capacity-generated.json.gz')).json();
    const {capacityScenario,capacitySignature:signature}=await import('/baseball-manager/e2e/helpers/capacity-scenarios.js');
    const save=await import('/baseball-manager/src/engine/saveload.js');
    const {collectSaveDiagnostics}=await import('/baseball-manager/src/engine/saveDiagnostics.js');
    const source=capacityScenario(fixture,years);
    const before=await signature(source),results=[];
    for(let i=0;i<3;i++) {localStorage.setItem('baseball_manager_v1_last_rotate_at','0');results.push(await save.saveGame(source));}
    const loaded=await save.loadGame();
    const expectedCareer=source.teams[0].players[0].careerLog??source.teams[0].players[0].recentCareerLog??[];
    const career=await save.loadPlayerCareerLogById(String(source.teams[0].players[0].id),source.saveId);
    return{results,before,after:await signature(loaded),careerYears:career.filter(e=>e.year<2026&&e.year>=2026-years).length,expectedCareerYears:expectedCareer.filter(e=>e.year<2026&&e.year>=2026-years).length,
      diagnostics:await collectSaveDiagnostics(results.at(-1)),rootBytes:['','_bk1','_bk2'].map(k=>localStorage.getItem('baseball_manager_v1'+k).length*2)};
  },years);
  expect(result.results.every(r=>r.ok&&!r.warnings?.length)).toBe(true);
  expect(result.rootBytes.every(n=>n<1024)).toBe(true);
  expect(result.after).toEqual(result.before);expect(result.careerYears).toBe(result.expectedCareerYears);
  await page.reload({waitUntil:'domcontentloaded'});
  const cold=await page.evaluate(async()=>{const s=await(await import('/baseball-manager/src/engine/saveload.js')).loadGame();return(await import('/baseball-manager/e2e/helpers/capacity-scenarios.js')).capacitySignature(s);});
  expect(cold).toEqual(result.before);
  await testInfo.attach(`capacity-${years}`,{body:JSON.stringify(result,null,2),contentType:'application/json'});
});

test('save capacity preserves large committed roots against a stale tab',async({page,context})=>{
  await page.goto('/');
  await page.evaluate(async()=>{const m=await import('/baseball-manager/src/engine/saveload.js');await m.saveGame({teams:[{id:0,players:[]}],myId:0,year:2026,gameDay:1,saveId:'large-tabs',largeState:'x'.repeat(50000),news:[],mailbox:[],seasonHistory:{}},{skipCompression:true});});
  const other=await context.newPage();await other.goto('/');
  await other.evaluate(async()=>{window.largeOld=await(await import('/baseball-manager/src/engine/saveload.js')).loadGame();});
  await page.evaluate(async()=>{const m=await import('/baseball-manager/src/engine/saveload.js');const s=await m.loadGame();await m.saveGame({...s,gameDay:2},{skipCompression:true});});
  expect(await other.evaluate(async()=>await(await import('/baseball-manager/src/engine/saveload.js')).saveGame(window.largeOld))).toMatchObject({ok:false,reason:'save_conflict'});
  expect(await page.evaluate(async()=>(await(await import('/baseball-manager/src/engine/saveload.js')).loadGame()).gameDay)).toBe(2);
});
