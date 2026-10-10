import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {reloadAndLoad,waitSaveIdle,readSave} from './helpers/progression';
const fixture=JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/new-game.json.gz',import.meta.url))).toString());

test('career generations isolate partial IDB failures, failed year commits and games with colliding IDs',async({page})=>{
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const m=await import('/baseball-manager/src/engine/saveload.js');
  const make=(id,year)=>({saveId:id,year,gameDay:1,myId:0,teams:[{id:0,name:'球団',players:[{id:'same',recentCareerLog:[]}],farm:[]}],seasonHistory:{},news:[],mailbox:[]});
  const e=year=>({year,teamId:0,teamName:'球団',stats:{HR:year-2020}});
  await m.saveGame(make('a',2026),{initialCareerLogs:[{playerId:'same',careerEntries:[e(2025)]}]});
  const originalAdd=IDBObjectStore.prototype.add;
  IDBObjectStore.prototype.add=function(value,...rest){const req=originalAdd.call(this,value,...rest);if(this.name==='save_chunks'&&value.scope==='careerLogs'){const tx=this.transaction;queueMicrotask(()=>tx.abort());}return req;};
  const abort=await m.saveGame(make('a',2027),{careerEntries:[{playerId:'same',careerEntry:e(2026)}]});
  IDBObjectStore.prototype.add=originalAdd;const afterAbort=await m.loadGame();
  const originalSet=Storage.prototype.setItem;
  Storage.prototype.setItem=function(k,v){if(k==='baseball_manager_v1')throw new Error('body');return originalSet.call(this,k,v);};
  const fail=await m.saveGame(make('a',2027),{careerEntries:[{playerId:'same',careerEntry:e(2026)}]});
  Storage.prototype.setItem=originalSet;const afterFail=await m.loadPlayerCareerLogById('same','a');
  const retry=await m.saveGame(make('a',2027),{careerEntries:[{playerId:'same',careerEntry:e(2026)}]});
  const a=await m.loadPlayerCareerLogById('same','a');
  localStorage.setItem('baseball_manager_v1_last_rotate_at','0');
  const b=await m.saveGame(make('b',2026),{initialCareerLogs:[{playerId:'same',careerEntries:[e(2023)]}]});
  const bRows=await m.loadPlayerCareerLogById('same','b');
  localStorage.setItem('baseball_manager_v1','broken');const recovered=await m.loadGame();
  const recoveredRows=await m.loadPlayerCareerLogById('same',recovered.saveId);
  return{abort,afterAbortYear:afterAbort.year,fail,afterFail,retry,a,b,bRows,recoveredId:recovered.saveId,recoveredRows};
 });
 expect(result.abort.ok).toBe(false);expect(result.afterAbortYear).toBe(2026);expect(result.fail.ok).toBe(false);
 expect(result.afterFail.map(e=>e.year)).toEqual([2025]);expect(result.retry.ok).toBe(true);expect(result.a.map(e=>e.year)).toEqual([2025,2026]);
 expect(result.b.ok).toBe(true);expect(result.bRows.map(e=>e.year)).toEqual([2023]);expect(result.recoveredId).toBe('a');expect(result.recoveredRows).toEqual(result.a);
});

test('career generations repeat real annual UI commits and reload without future records after a failed commit',async({page})=>{
 test.setTimeout(150_000);
 await page.goto('/');
 await page.evaluate(async fixture=>{const m=await import('/baseball-manager/src/engine/saveload.js');fixture.saveId='annual-career';if(!(await m.saveGame(fixture)).ok)throw new Error('seed failed');},fixture);
 const seed=await readSave(page);const id=seed.teams.find(t=>t.id===seed.myId).players.find(p=>!p.isPitcher).id;
 const readCareer=()=>page.evaluate(async id=>(await import('/baseball-manager/src/engine/saveload.js')).loadPlayerCareerLogById(id,'annual-career'),id);
 const before=await readCareer();const closing=[];
 for(let n=0;n<3;n++){
  const year=seed.year+n;closing.push(year);
  // Seed a camp boundary through the actual save API, then run the application's real annual transition.
  await page.evaluate(async({year,id,n})=>{
   const m=await import('/baseball-manager/src/engine/saveload.js');const s=await m.loadGame();
   s.year=year;s.offseasonPlan={version:1,year,myId:s.myId,stage:'results',resumeScreen:'spring_training',draftApplied:true,spring:{conditionDeltas:{},improvements:[]}};
   const p=s.teams.flatMap(t=>[...t.players,...t.farm]).find(p=>p.id===id);p.stats={...p.stats,PA:600,HR:n+1};
   if(!(await m.saveGame(s)).ok)throw new Error('camp seed failed');
  },{year,id,n});
  await reloadAndLoad(page);const complete=page.getByRole('button',{name:/キャンプ終了・開幕へ/});await expect(complete).toBeVisible();
  if(n===0){
   await page.evaluate(()=>{window.originalCareerSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='baseball_manager_v1')throw new DOMException('annual full','QuotaExceededError');return window.originalCareerSet.call(this,k,v);};});
   await complete.click();await expect(page.getByText('新年度の保存に失敗しました。年度は進めていません。再試行してください。')).toBeVisible();
   await expect(page.getByText('新年度の保存に失敗しました。年度は進めていません。再試行してください。')).toContainText('保存容量が不足しています');
   expect((await readSave(page)).year).toBe(year);expect(await readCareer()).toEqual(before);
   await page.evaluate(()=>{Storage.prototype.setItem=window.originalCareerSet;});
  }
  await complete.click();await page.getByRole('button',{name:/開幕！/}).click();await expect(page.locator('.topbar')).toContainText(`${year+1}年`);
  await waitSaveIdle(page);await reloadAndLoad(page);await expect(page.locator('.topbar')).toContainText(`${year+1}年`);
  const saved=await readSave(page);expect(saved.year).toBe(year+1);
  const log=await readCareer();const fresh=log.filter(e=>closing.includes(e.year));expect(fresh.map(e=>e.year)).toEqual(closing);expect(fresh.map(e=>e.stats.HR)).toEqual(closing.map((_,i)=>i+1));
  expect(log.filter(e=>e.year<seed.year)).toEqual(before.filter(e=>e.year<seed.year));
 }
});

test('career generations detail failure explains incomplete history at mobile and desktop widths',async({page},testInfo)=>{
 test.setTimeout(60_000); // Six captures include Recharts' default 1500ms animation after viewport changes.
 await page.goto('/');
 const props=await page.evaluate(async fixture=>{
  const m=await import('/baseball-manager/src/engine/saveload.js');fixture.teams=(await import('/baseball-manager/src/engine/bootstrapTeams.js')).createInitialTeams();fixture.saveId='detail-widths';await m.saveGame(fixture);
  const saved=await m.loadGame(),team=saved.teams.find(t=>t.id===saved.myId),player=team.players.find(p=>p.careerLogSummary?.trimmedEntries>3&&!p.isPitcher);
  if(!player)throw new Error('fixture requires long career');
  return{player,year:saved.year,teamId:team.id,teamName:team.name,saveId:saved.saveId};
 },fixture);
 await page.evaluate(async props=>{
  const React=(await import('/baseball-manager/node_modules/.vite/deps/react.js')).default;
  const {createRoot}=(await import('/baseball-manager/node_modules/.vite/deps/react-dom_client.js')).default;
  const {CareerTable}=await import('/baseball-manager/src/components/tabs/CareerTable.jsx');
  const host=document.createElement('main');host.id='career-qa';host.style.cssText='padding:16px;box-sizing:border-box;width:100%';document.body.replaceChildren(host);
  window.careerQa={React,CareerTable,root:createRoot(host),props};window.careerQa.root.render(React.createElement(CareerTable,props));
 },props);
 await expect(page.locator('#career-qa table').first()).toBeVisible();
 await expect(page.getByText('成績を読み込み中...')).toHaveCount(0);
 await expect(page.getByText('過去の詳細成績を読み込めませんでした。保存本体に残る履歴のみ表示しています。')).toHaveCount(0);
 await expect(page.getByRole('status').filter({hasText:'過去の詳細成績を読み込めませんでした'})).toHaveCount(0);
 for(const width of [390,360,1440]){
  await page.setViewportSize({width,height:width===1440?900:844});
  await page.waitForTimeout(1600); // Let chart animation finish before visual evidence.
  await page.screenshot({path:testInfo.outputPath(`career-normal-${width}.png`),fullPage:true});
 }
 await page.evaluate(()=>{
  const original=IDBObjectStore.prototype.get;window.careerOriginalGet=original;
  IDBObjectStore.prototype.get=function(...args){if(this.name==='save_chunks')throw new Error('career detail read');return original.apply(this,args);};
  const q=window.careerQa;q.root.render(q.React.createElement(q.CareerTable,{...q.props,player:{...q.props.player,recentCareerLog:[...q.props.player.recentCareerLog]}}));
 });
 const notice=page.getByRole('status').filter({hasText:'過去の詳細成績を読み込めませんでした'});await expect(notice).toBeVisible();
 for(const width of [390,360,1440]){
  await page.setViewportSize({width,height:width===1440?900:844});
  await page.waitForTimeout(1600); // Let chart animation finish before visual evidence.await expect(notice).toBeVisible();
  const box=await notice.boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width);
  await page.screenshot({path:testInfo.outputPath(`career-error-${width}.png`),fullPage:true});
 }
 await page.evaluate(()=>{IDBObjectStore.prototype.get=window.careerOriginalGet;});
});
