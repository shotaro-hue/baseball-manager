import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
const fixture = JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/new-game.json.gz', import.meta.url))).toString());

test('save generations recover their histories after primary corruption and disappearance', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async fixture => {
    const mod = await import('/baseball-manager/src/engine/saveload.js');
    const make = day => ({ ...fixture, year:2026, gameDay:day, saveId:'recovery',
      news:[{day}],mailbox:[{day}],seasonHistory:{day},gameResultsMap:{[day]:{day}} });
    const first = await mod.saveGame(make(1)), second = await mod.saveGame(make(2));
    localStorage.setItem('baseball_manager_v1', 'broken');
    const restored = await mod.loadGame(), corruptStatus = mod.getLastLoadResult();
    localStorage.removeItem('baseball_manager_v1');
    return {first,second,restored,corruptStatus,hasSave:mod.hasSave()};
  }, fixture);
  expect(result.first.ok).toBe(true); expect(result.second.ok).toBe(true);
  expect(result.restored.gameDay).toBe(1); expect(result.restored.news).toEqual([{day:1}]);
  expect(result.corruptStatus.status).toBe('recovered'); expect(result.hasSave).toBe(true);
  await page.reload(); await page.getByRole('button',{name:'続きから',exact:true}).click();
  await expect(page.locator('.topbar')).toBeVisible();
  await expect(page.locator('body')).toContainText('バックアップ');
});

test('save generations isolate IDB abort, quota and auxiliary metadata failure', async ({ page }) => {
 await page.goto('/');
 const result = await page.evaluate(async () => {
   const mod=await import('/baseball-manager/src/engine/saveload.js');
   const make=day=>({teams:[{id:0,name:'球団',players:[],farm:[]}],myId:0,year:2026,gameDay:day,saveId:'fault',news:[{day}],mailbox:[{day}],seasonHistory:{day}});
   await mod.saveGame(make(1));
   const originalTx=IDBDatabase.prototype.transaction;
   IDBDatabase.prototype.transaction=function(stores,mode,...rest){const tx=originalTx.call(this,stores,mode,...rest);
    if(mode==='readwrite'&&stores==='save_chunks') queueMicrotask(()=>tx.abort()); return tx;};
   const abort=await mod.saveGame(make(2)); IDBDatabase.prototype.transaction=originalTx;
   const afterAbort=await mod.loadGame();
   const originalSet=Storage.prototype.setItem;
   Storage.prototype.setItem=function(k,v){if(k==='baseball_manager_v1')throw new DOMException('full','QuotaExceededError');return originalSet.call(this,k,v);};
   const quota=await mod.saveGame(make(3));Storage.prototype.setItem=originalSet;const afterQuota=await mod.loadGame();
   Storage.prototype.setItem=function(k,v){if(k==='baseball_manager_v1_meta')throw new Error('meta');return originalSet.call(this,k,v);};
   const meta=await mod.saveGame(make(4));Storage.prototype.setItem=originalSet;
   return {abort,afterAbort,quota,afterQuota,meta,afterMeta:await mod.loadGame()};
 });
 expect(result.abort.ok).toBe(false); expect(result.afterAbort.news).toEqual([{day:1}]);
 expect(result.quota).toMatchObject({ok:false,quota:true});expect(result.afterQuota.news).toEqual([{day:1}]);
 expect(result.meta).toMatchObject({ok:true,warnings:['metadata_failed']});expect(result.afterMeta.gameDay).toBe(4);
});

test('save generations reject stale writes from another tab', async ({page,context})=>{
 await page.goto('/');
 await page.evaluate(async()=>{const m=await import('/baseball-manager/src/engine/saveload.js');await m.saveGame({teams:[{id:0,players:[]}],myId:0,year:2026,gameDay:1,saveId:'tabs',news:[],mailbox:[],seasonHistory:{}});});
 const other=await context.newPage();await other.goto('/');
 await other.evaluate(async()=>{window.oldSave=await(await import('/baseball-manager/src/engine/saveload.js')).loadGame();});
 await page.evaluate(async()=>{const m=await import('/baseball-manager/src/engine/saveload.js');const s=await m.loadGame();s.gameDay=2;await m.saveGame(s);});
 const stale=await other.evaluate(async()=>await(await import('/baseball-manager/src/engine/saveload.js')).saveGame(window.oldSave));
 expect(stale).toMatchObject({ok:false,reason:'save_conflict'});
});
