import { test, expect } from '@playwright/test';
import { TEAM, waitForNewGameReady, saveHub, reloadAndLoad } from './helpers/progression';

async function initialContents(page) {
  return page.evaluate(async () => {
    const { loadGame } = await import('/baseball-manager/src/engine/saveload.js');
    const saved = await loadGame();
    const { openBaseballManagerDb } = await import('/baseball-manager/src/engine/baseballManagerDb.js');
    const db = await openBaseballManagerDb();
    const rows = await new Promise((resolve,reject) => {
      const tx = db.transaction('career_logs','readonly'), store = tx.objectStore('career_logs');
      const all = store.getAll(), keys = store.getAllKeys();
      tx.oncomplete = () => resolve({ keys: keys.result, rows: all.result }); tx.onerror = () => reject(tx.error);
    }); db.close();
    const players = saved.teams.flatMap(t => [...t.players,...t.farm]);
    const historyIds = players.filter(p => p.careerLogSummary?.trimmedEntries > 0).map(p => p.id);
    const { generateSeasonSchedule } = await import('/baseball-manager/src/engine/scheduleGen.js');
    const schedule = generateSeasonSchedule(saved.year,saved.teams);
    return { myId:saved.myId, teamCount:saved.teams.length, playerIds:players.map(p=>p.id),
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
  await expect(page.getByTestId('new-game-initialization')).toHaveAttribute('aria-busy','true');
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
    const original=IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction=function(stores,mode,...rest){
      const names=typeof stores==='string'?[stores]:Array.from(stores);
      if(mode==='readwrite' && names.includes('career_logs')){
        window.initialHistoryAttempts++;
        if(window.failInitialHistory){
          const tx=original.call(this,stores,mode,...rest);
          // Abort after the initialization code has queued its writes; verify rollback.
          queueMicrotask(()=>tx.abort());
          return tx;
        }
      }
      return original.call(this,stores,mode,...rest);
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
      const request=db.transaction('career_logs','readonly').objectStore('career_logs').getAllKeys();
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
  expect(before.teamCount).toBe(12);expect(before.playerIds).toHaveLength(661);
  expect(new Set(before.playerIds).size).toBe(661);
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
