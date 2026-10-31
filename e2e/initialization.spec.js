import { test, expect } from '@playwright/test';
import { TEAM, waitForNewGameReady, saveHub, reloadAndLoad } from './helpers/progression';
import {localMasterFixture} from './fixtures/local-master';

test('local master reaches bootstrap through title routing and survives save/reload',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');
 await page.getByText('選手名簿ファイルを使う（新規ゲーム）',{exact:true}).click();
 await page.getByLabel('選手名簿JSON').setInputFiles({name:'local-master.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(localMasterFixture()))});
 await expect(page.getByText('実在900名',{exact:false})).toBeVisible();
 await expect(page.locator('summary')).toContainText('記憶済み');
 await page.reload();
 await expect(page.getByText('実在900名',{exact:false})).toBeVisible();
 await expect(page.locator('summary')).toContainText('記憶済み');
 await page.getByRole('button',{name:TEAM,exact:true}).click();await waitForNewGameReady(page,TEAM);
 const saved=await saveHub(page),all=saved.teams.flatMap(t=>[...t.players,...t.farm]);
 expect(all).toHaveLength(900);expect(new Set(all.map(p=>p.realPlayerId)).size).toBe(900);
 expect(all.filter(p=>p.isIkusei)).toHaveLength(180);expect(saved.teams.flatMap(t=>t.players).some(p=>p.isIkusei)).toBe(false);
 await reloadAndLoad(page);
 const loaded=await saveHub(page);
 expect(loaded.teams.flatMap(t=>[...t.players,...t.farm]).map(p=>p.realPlayerId)).toEqual(all.map(p=>p.realPlayerId));
 expect(errors).toEqual([]);
});

test('local master reset and invalid replacement do not restore a stale roster',async({page})=>{
 const upload=async()=>{
  await page.getByLabel('選手名簿JSON').setInputFiles({name:'local-master.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(localMasterFixture()))});
  await expect(page.locator('summary')).toContainText('記憶済み');
 };
 await page.goto('/');await page.locator('summary').click();await upload();
 await page.getByRole('button',{name:'標準名簿に戻す',exact:true}).click();
 await page.reload();await expect(page.locator('summary')).toHaveText('選手名簿ファイルを使う（新規ゲーム）');
 await page.locator('summary').click();await upload();
 await page.getByLabel('選手名簿JSON').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{}')});
 await expect(page.getByRole('alert')).toContainText('人数');
 await page.reload();await expect(page.locator('summary')).toHaveText('選手名簿ファイルを使う（新規ゲーム）');
 expect(await page.evaluate(()=>localStorage.getItem('npb-local-player-master-selected'))).toBeNull();
});

test('local master remains selectable for this session when its database is unavailable',async({page})=>{
 await page.addInitScript(()=>{
  // Inject the fault for every factory instance, including those accessed
  // after the init script. Verify below that the injection actually ran.
  const open=IDBFactory.prototype.open;
  window.__masterStorageDenied=0;
  IDBFactory.prototype.open=function(name,...args){
   if(name==='npb-player-master-v1'){
    window.__masterStorageDenied++;
    throw new DOMException('Unavailable','SecurityError');
   }
   return open.call(this,name,...args);
  };
 });
 await page.goto('/');await page.locator('summary').click();
 await page.getByLabel('選手名簿JSON').setInputFiles({name:'local-master.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(localMasterFixture()))});
 await expect(page.getByRole('alert')).toContainText('今回の新規ゲームには使えます');
 expect(await page.evaluate(()=>window.__masterStorageDenied)).toBeGreaterThan(0);
 await expect(page.locator('summary')).not.toContainText('記憶済み');
 await page.getByRole('button',{name:TEAM,exact:true}).click();await waitForNewGameReady(page,TEAM);
 const saved=await saveHub(page);
 expect(saved.teams.flatMap(t=>[...t.players,...t.farm])).toHaveLength(900);
 expect(await page.evaluate(()=>localStorage.getItem('npb-local-player-master-selected'))).toBeNull();
});

async function initialContents(page) {
  return page.evaluate(async () => {
    const { loadGame } = await import('/baseball-manager/src/engine/saveload.js');
    const saved = await loadGame();
    const { readCareerGeneration } = await import('/baseball-manager/src/engine/saveGenerations.js');
    const data = await readCareerGeneration(saved);
    const populated = data.players.filter(([, entries]) => entries.length > 0);
    const rows = { keys: populated.map(([id]) => id), rows: populated.map(([, entries]) => entries) };
    const { selectFarmTeam } = await import('/baseball-manager/src/engine/farmSelection.js');
    const catcherCoverage = saved.teams.map(t => ({
      active: t.players.filter(p => !p.isPitcher && p.pos === '捕手'
        && !p.育成 && !p.isIkusei && Number(p.injuryDaysLeft || 0) === 0).length,
      farmStatus: selectFarmTeam(t, { round: 1 }).status,
    }));
    const players = saved.teams.flatMap(t => [...t.players,...t.farm]);
    const historyIds = players.filter(p => p.careerLogSummary?.trimmedEntries > 0).map(p => p.id);
    const { generateSeasonSchedule } = await import('/baseball-manager/src/engine/scheduleGen.js');
    const schedule = generateSeasonSchedule(saved.year,saved.teams);
    return { myId:saved.myId, teamCount:saved.teams.length, catcherCoverage, controlled:saved.teams.map(t=>[...t.players,...t.farm].filter(p=>!p.育成&&!p.isIkusei).length), playerIds:players.map(p=>p.id),
      development:players.filter(p=>p.育成||p.isIkusei).map(p=>p.name.replace(/\s+/g,' ')).sort(),
      activeDevelopment:saved.teams.flatMap(t=>t.players).filter(p=>p.育成||p.isIkusei).length,
      rows:rows.rows.reduce((n,r)=>n+r.length,0), historyKeys:rows.keys, historyIds,
      regularMatchups:schedule.slice(1,144).reduce((n,day)=>n+day.matchups.length,0),
      scheduledTeamGames:saved.teams.map(t=>schedule.slice(1,144).reduce((n,day)=>n+day.matchups.filter(m=>m.homeId===t.id||m.awayId===t.id).length,0)) };
  });
}
test('slow CPU paints pending, blocks title actions and permits only one complete start', async ({page}) => {
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const cdp=await page.context().newCDPSession(page);
  await page.goto('/');
  await page.evaluate(()=>{
    localStorage.setItem('baseball_manager_v1','{}');
    localStorage.setItem('baseball_manager_v1_meta',JSON.stringify({teamName:'保存球団',year:2026,gameDay:1}));
  });
  await page.reload();
  await expect(page.getByRole('button',{name:'続きから',exact:true})).toBeVisible();
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:6});
  await page.evaluate((teamName)=>{
    const teams=[...document.querySelectorAll('.tcard')];
    teams.find(b=>b.getAttribute('aria-label')===teamName).click();
    teams.find(b=>b.getAttribute('aria-label')!==teamName).click();
  },TEAM);
  await expect(page.getByRole('status')).toContainText('初期化中');
  await expect(page.locator('.tgrid').first()).toHaveAttribute('aria-busy','true');
  expect(await page.getByRole('status').evaluate(el=>!!el.closest('[aria-busy="true"]'))).toBe(false);
  await expect(page.locator('.title button:enabled')).toHaveCount(0);
  await page.screenshot({path:test.info().outputPath('pending.png')});
  await waitForNewGameReady(page,TEAM);
  await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});
  const saved=await saveHub(page);
  expect(saved.teams).toHaveLength(12);expect(saved.teams.find(t=>t.id===saved.myId).name).toBe(TEAM);
  expect(errors).toEqual([]);
});
test('failed initial IndexedDB write stays on title and retry saves all history without duplicate records',async({page})=>{
  await page.addInitScript(()=>{
    window.failInitialHistory=true;window.initialHistoryAttempts=0;
    const original=IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add=function(value,...rest){
      const request=original.call(this,value,...rest);
      if(this.name==='save_chunks' && value.scope==='careerLogs'){
        window.initialHistoryAttempts++;
        if(window.failInitialHistory){
          const tx=this.transaction;
          queueMicrotask(()=>tx.abort());
        }
      }
      return request;
    };
  });
  await page.goto('/');
  await page.getByRole('button',{name:TEAM,exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('過去成績を保存できませんでした');
  await expect(page.locator('.topbar')).toHaveCount(0);
  await expect(page.getByRole('button',{name:TEAM,exact:true})).toBeEnabled();
  const failedKeys=await page.evaluate(async()=>{
    const {openBaseballManagerDb}=await import('/baseball-manager/src/engine/baseballManagerDb.js');
    const db=await openBaseballManagerDb();
    const keys=await new Promise((resolve,reject)=>{
      const request=db.transaction('save_chunks','readonly').objectStore('save_chunks').getAllKeys();
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });db.close();return keys;
  });
  expect(failedKeys).toEqual([]);
  await expect(waitForNewGameReady(page,TEAM)).rejects.toThrow(/初期化に失敗/);
  await page.screenshot({path:test.info().outputPath('history-error.png')});
  await page.evaluate(()=>{window.failInitialHistory=false;});
  await page.getByRole('button',{name:TEAM,exact:true}).click();
  await waitForNewGameReady(page,TEAM);
  await saveHub(page);const before=await initialContents(page);
  expect(before.catcherCoverage.every(t => t.active >= 3 && t.farmStatus === 'ready')).toBe(true);
  expect(before.teamCount).toBe(12);expect(before.controlled).toEqual(Array(12).fill(65));expect(before.playerIds).toHaveLength(782);
  expect(new Set(before.playerIds).size).toBe(782);
  expect(before.development).toEqual(['平山 功太','福島 圭音']);expect(before.activeDevelopment).toBe(0);
  expect(before.rows).toBe(2009);expect(before.historyKeys).toHaveLength(376);
  expect([...before.historyIds].sort()).toEqual([...before.historyKeys].sort());
  // schedule[0] is a sentinel; verify actual games instead of counting array keys.
  expect(before.regularMatchups).toBe(858);
  expect(before.scheduledTeamGames).toEqual(Array(12).fill(143));
  expect(new Set(before.historyKeys).size).toBe(376);
  expect(await page.evaluate(()=>window.initialHistoryAttempts)).toBe(2);
  await reloadAndLoad(page);await expect(page.locator('.topbar')).toContainText(TEAM);
  const after=await initialContents(page);expect(after).toEqual(before);
});
