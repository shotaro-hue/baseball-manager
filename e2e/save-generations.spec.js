import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
const fixture = JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/new-game.json.gz', import.meta.url))).toString());

for (const large of [false, true]) test(`save generations: annual world survives cold reload and refuses downgrade (${large ? 'large' : 'inline'})`, async ({ page }) => {
  await page.goto('/');
  const initial = await page.evaluate(async large => {
    const { economyFixture, renewalEnvelope } = await import('/baseball-manager/src/engine/__tests__/fixtures/economyWorld.js');
    const { reduceEconomyCommand } = await import('/baseball-manager/src/engine/contractEconomy.js');
    const { saveGame, enqueueSaveGame } = await import('/baseball-manager/src/engine/saveload.js');
    const world = economyFixture(), offered = reduceEconomyCommand(world, renewalEnvelope(world)).world;
    if (large) offered.padding = 'large'.repeat(20000);
    offered.mailbox = [{ id: 'pending', type: 'contract_decision_pending', read: false }];
    const active = enqueueSaveGame(world, { skipCompression: true });
    const economic = enqueueSaveGame(offered, { skipCompression: true });
    const staleAuto = enqueueSaveGame(world, { skipCompression: true });
    const staleManual = saveGame(world, { skipCompression: true });
    const [, saved, autoResult, manualResult] = await Promise.all([active, economic, staleAuto, staleManual]);
    return { saved, autoResult, manualResult, referenced: JSON.parse(localStorage.getItem('baseball_manager_v1')).rootBodyVersion === 1 };
  }, large);
  expect(initial.saved.ok).toBe(true); expect(initial.referenced).toBe(large);
  expect(initial.autoResult).toMatchObject({ ok: false, reason: 'economy_revision_conflict' });
  expect(initial.manualResult).toMatchObject({ ok: false, reason: 'economy_revision_conflict' });
  await page.reload();
  const result = await page.evaluate(async () => {
    const mod = await import('/baseball-manager/src/engine/saveload.js');
    const { reduceEconomyCommand } = await import('/baseball-manager/src/engine/contractEconomy.js');
    const loaded = await mod.loadGame(), before = localStorage.getItem('baseball_manager_v1');
    const { contractEconomy, ...legacy } = loaded;
    const rejected = await mod.saveGame(legacy), unchanged = localStorage.getItem('baseball_manager_v1') === before;
    const roots = () => ['baseball_manager_v1', 'baseball_manager_v1_bk1', 'baseball_manager_v1_bk2'].map(k => localStorage.getItem(k));
    const historyChecks = [];
    for (const kind of ['seed', 'receipt', 'ledger order']) {
      const candidate = structuredClone(loaded), previousRoots = JSON.stringify(roots());
      candidate.contractEconomy.revision++;
      if (kind === 'seed') candidate.contractEconomy.randomRoot.seed = 'changed';
      if (kind === 'receipt') candidate.contractEconomy.engine.transactions.pop();
      if (kind === 'ledger order') candidate.contractEconomy.engine.spending.ledger.records.reverse();
      const input = JSON.stringify(candidate), result = await mod.saveGame(candidate);
      historyChecks.push({ result, rootsUnchanged: JSON.stringify(roots()) === previousRoots, inputUnchanged: JSON.stringify(candidate) === input });
    }
    const accepted = reduceEconomyCommand(loaded, { saveId: loaded.saveId, epoch: contractEconomy.epoch, baseRevision: 1,
      transaction: { id: 'answer', type: 'accept-renewal', proposalId: 'renewal', contractId: loaded.teams[0].players[0].contractId } });
    accepted.world.mailbox = [{ id: 'signed', type: 'contract_reply', read: false }];
    const saved = await mod.enqueueSaveGame(accepted.world, { dirtyScopes: [] });
    const restored = await mod.loadGame();
    return { rejected, unchanged, historyChecks, saved, revision: restored.contractEconomy.revision,
      sameEconomy: JSON.stringify(restored.contractEconomy) === JSON.stringify(accepted.world.contractEconomy), mailbox: restored.mailbox };
  });
  expect(result.rejected).toMatchObject({ ok: false, reason: 'economy_payload_missing' });
  expect(result.historyChecks).toEqual(Array.from({ length: 3 }, () => ({
    result: expect.objectContaining({ ok: false, reason: 'economy_history_conflict' }), rootsUnchanged: true, inputUnchanged: true,
  })));
  expect(result.unchanged).toBe(true); expect(result.saved.ok).toBe(true);
  expect(result.revision).toBe(2); expect(result.sameEconomy).toBe(true);
  expect(result.mailbox).toEqual([{ id: 'signed', type: 'contract_reply', read: false }]);
  await page.reload();
  const before = await page.evaluate(() => localStorage.getItem('baseball_manager_v1'));
  await page.getByRole('button', { name: '続きから', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('新契約制度');
  expect(await page.evaluate(() => localStorage.getItem('baseball_manager_v1'))).toBe(before);
});

test('save generations recover their histories after primary corruption and disappearance', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async fixture => {
    const mod = await import('/baseball-manager/src/engine/saveload.js');
    const make = day => ({ ...fixture, year:2026, gameDay:day, saveId:'recovery',
      teams:fixture.teams.map(t=>({...t,wins:0,losses:0,draws:day-1})),
      news:[{day}],mailbox:[{day}],seasonHistory:{day},
      gameResultsMap:Object.fromEntries(Array.from({length:day-1},(_,i)=>[i+1,{day:i+1}])) });
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

test('save generations: deleting from another tab waits for an active save and leaves no revived roots',async({page,context})=>{
 await page.goto('/');const other=await context.newPage();await other.goto('/');
 await page.evaluate(async()=>{
  const m=await import('/baseball-manager/src/engine/saveload.js');
  const state={teams:[{id:0,players:[]}],myId:0,year:2026,gameDay:1,saveId:'delete-race',news:[],mailbox:[],seasonHistory:{}};
  await m.saveGame(state);
  const original=IDBDatabase.prototype.transaction;let paused=false;
  window.releaseChunks=new Promise(resolve=>{window.releaseChunkCompletion=resolve;});
  IDBDatabase.prototype.transaction=function(stores,mode,...rest){
   const tx=original.call(this,stores,mode,...rest);
   if(stores==='save_chunks'&&mode==='readwrite'&&!paused){paused=true;
    Object.defineProperty(tx,'oncomplete',{set(callback){tx.addEventListener('complete',async event=>{
     window.chunksComplete=true;await window.releaseChunks;callback.call(tx,event);
    });}});
   }return tx;
  };
  window.saving=m.saveGame({...state,gameDay:2}).finally(()=>{IDBDatabase.prototype.transaction=original;});
 });
 await expect.poll(()=>page.evaluate(()=>!!window.chunksComplete)).toBe(true);
 await other.evaluate(async()=>{const m=await import('/baseball-manager/src/engine/saveload.js');window.deleting=m.deleteSave().then(result=>{window.deleted=result;});});
 expect(await other.evaluate(()=>window.deleted)).toBeUndefined();
 await page.evaluate(()=>window.releaseChunkCompletion());
 await other.evaluate(()=>window.deleting);
 expect(await other.evaluate(()=>window.deleted)).toMatchObject({ok:true});
 expect(await page.evaluate(async()=>{await window.saving;const m=await import('/baseball-manager/src/engine/saveload.js');return m.hasSave();})).toBe(false);
 for(const key of ['baseball_manager_v1','baseball_manager_v1_bk1','baseball_manager_v1_bk2'])expect(await page.evaluate(k=>localStorage.getItem(k),key)).toBeNull();
});

test('save generations: deletion invalidates a stale backup-only recovery in another tab',async({page,context})=>{
 await page.goto('/');
 await page.evaluate(async()=>{
  const m=await import('/baseball-manager/src/engine/saveload.js');
  const s={teams:[{id:0,players:[]}],myId:0,year:2026,saveId:'delete-backup',news:[],mailbox:[],seasonHistory:{}};
  await m.saveGame({...s,gameDay:1});await m.saveGame({...s,gameDay:2});localStorage.removeItem('baseball_manager_v1');
 });
 const other=await context.newPage();await other.goto('/');
 await other.evaluate(async()=>{window.recovered=await(await import('/baseball-manager/src/engine/saveload.js')).loadGame();});
 await page.evaluate(async()=>await(await import('/baseball-manager/src/engine/saveload.js')).deleteSave());
 const result=await other.evaluate(async()=>await(await import('/baseball-manager/src/engine/saveload.js')).saveGame(window.recovered));
 expect(result).toMatchObject({ok:false,reason:'save_conflict'});
});

for (const large of [false, true]) test(`save generations: acknowledged contract adoption holds the save barrier (${large ? 'large' : 'inline'})`, async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async large => {
    const mod = await import('/baseball-manager/src/engine/saveload.js');
    const { economyFixture, renewalEnvelope } = await import('/baseball-manager/src/engine/__tests__/fixtures/economyWorld.js');
    const { reduceEconomyCommand } = await import('/baseball-manager/src/engine/contractEconomy.js');
    const { gameStateReducer, G } = await import('/baseball-manager/src/hooks/gameStateReducer.js');
    let current = { world: economyFixture(), sessionToken: 1, progressToken: 1 };
    const expected = { saveId: current.world.saveId, epoch: current.world.contractEconomy.epoch,
      baseRevision: 0, sessionToken: 1, progressToken: 1 };
    const old = structuredClone(current.world);
    const initial = mod.saveGame(old, { skipCompression: true });
    const next = reduceEconomyCommand(old, renewalEnvelope(old)).world;
    if (large) next.padding = 'large'.repeat(20000);
    let release, entered;
    const gate = new Promise(r => release = r), inside = new Promise(r => entered = r);
    const commit = mod.commitEconomyCandidate(next, expected, {
      readCurrent: () => current,
      adopt: async (world, ack, canAdopt) => {
        entered(); await gate;
        if (!canAdopt()) return false;
        current = { ...current, world: gameStateReducer(current.world, { type: G.APPLY_ECONOMY_WORLD, world, expected }), progressToken: 2 };
        return true;
      },
    }, { skipCompression: true });
    await initial;
    await Promise.race([inside, commit.then(result => { throw new Error(JSON.stringify(result)); })]);
    const before = current.world.contractEconomy.revision;
    const auto = await mod.enqueueSaveGame(old), manual = await mod.saveGame(old);
    release(); const saved = await commit;
    return { before, auto, manual, saved, revision: current.world.contractEconomy.revision,
      referenced: JSON.parse(localStorage.getItem('baseball_manager_v1')).rootBodyVersion === 1 };
  }, large);
  expect(result.before).toBe(0); expect(result.revision).toBe(1); expect(result.referenced).toBe(large);
  expect(result.auto).toMatchObject({ ok: false, reason: 'economy_commit_pending' });
  expect(result.manual).toMatchObject({ ok: false, reason: 'economy_commit_pending' });
  expect(result.saved).toMatchObject({ ok: true, committed: { revision: 1, receiptIds: [0] } });
  expect(result.saved.committed.rootSignature).toMatch(/^[a-f0-9]{64}$/);
  await page.reload();
  expect(await page.evaluate(async () => {
    const world = await (await import('/baseball-manager/src/engine/saveload.js')).loadGame();
    return { revision: world.contractEconomy.revision, receipts: world.contractEconomy.engine.transactions.map(r => r.id) };
  })).toEqual({ revision: 1, receipts: [0] });
  expect(await page.evaluate(async () => {
    const mod = await import('/baseball-manager/src/engine/saveload.js');
    const { reduceEconomyCommand } = await import('/baseball-manager/src/engine/contractEconomy.js');
    const { gameStateReducer, G } = await import('/baseball-manager/src/hooks/gameStateReducer.js');
    let current = { world: await mod.loadGame(), progressToken: 1, sessionToken: 2 };
    const expected = { saveId: current.world.saveId, epoch: current.world.contractEconomy.epoch,
      baseRevision: 1, progressToken: 1, sessionToken: 2 };
    const next = reduceEconomyCommand(current.world, { saveId: expected.saveId, epoch: expected.epoch, baseRevision: expected.baseRevision, transaction: { id: 'accept',
      type: 'accept-renewal', proposalId: 'renewal', contractId: current.world.teams[0].players[0].contractId } });
    if (!next.ok) throw new Error(next.error);
    const result = await mod.commitEconomyCandidate(next.world, expected, { readCurrent: () => current,
      adopt: async (world, ack, canAdopt) => {
        if (!canAdopt()) return false;
        current = { ...current, world: gameStateReducer(current.world, { type: G.APPLY_ECONOMY_WORLD, world, expected }) };
        return true;
      } });
    const resaved = await mod.saveGame(current.world);
    return { committed: result.ok, resaved: resaved.ok, revision: (await mod.loadGame()).contractEconomy.revision };
  })).toEqual({ committed: true, resaved: true, revision: 2 });
});
