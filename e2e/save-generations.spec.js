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

test('save generations: hook hydrates and resaves annual evidence without activating the title gate', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const React = (await import('/baseball-manager/node_modules/.vite/deps/react.js')).default;
    const { createRoot } = (await import('/baseball-manager/node_modules/.vite/deps/react-dom_client.js')).default;
    const { useGameState } = await import('/baseball-manager/src/hooks/useGameState.js');
    const { economyFixture, renewalEnvelope } = await import('/baseball-manager/src/engine/__tests__/fixtures/economyWorld.js');
    const { reduceEconomyCommand } = await import('/baseball-manager/src/engine/contractEconomy.js');
    const { saveGame, loadGame } = await import('/baseball-manager/src/engine/saveload.js');
    const world = economyFixture(), offered = reduceEconomyCommand(world, renewalEnvelope(world)).world;
    const saved = await saveGame(offered);
    if (!saved.ok) throw new Error(saved.reason);
    const loaded = await loadGame();
    window.hydrationQa = { loaded, expected: JSON.stringify(loaded.contractEconomy) };
    const host = document.createElement('div'); document.body.appendChild(host);
    function Harness() {
      const gs = useGameState(); window.hydrationQa.gs = gs;
      return React.createElement('output', { 'data-testid': 'hydrated-world' }, `${gs.saveId}:${gs.contractEconomy?.revision ?? 'legacy'}`);
    }
    window.hydrationQa.root = createRoot(host);
    window.hydrationQa.root.render(React.createElement(Harness));
  });
  await expect(page.getByTestId('hydrated-world')).toContainText('legacy');
  expect(await page.evaluate(() => {
    const { gs, loaded } = window.hydrationQa;
    return gs.hydrateSavedWorld(loaded, { sessionToken: gs.getProgressSessionToken(), progressToken: gs.getProgressToken() });
  })).toBe(true);
  await expect(page.getByTestId('hydrated-world')).toHaveText('test-save:1');
  expect(await page.evaluate(async () => {
    const qa = window.hydrationQa, result = await qa.gs.handleSave({ silent: true });
    const { loadGame } = await import('/baseball-manager/src/engine/saveload.js');
    const restored = await loadGame();
    return { ok: result.ok, same: JSON.stringify(restored.contractEconomy) === qa.expected };
  })).toEqual({ ok: true, same: true });
  await page.reload();
  const rootBefore = await page.evaluate(() => localStorage.getItem('baseball_manager_v1'));
  await page.getByRole('button', { name: '続きから', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('新契約制度');
  expect(await page.evaluate(() => localStorage.getItem('baseball_manager_v1'))).toBe(rootBefore);
});


for (const large of [false, true]) test(`save generations: real hook commit preserves history, retries and receipts (${large ? 'large' : 'inline'})`, async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async large => {
    const { mountEconomyHook } = await import('/baseball-manager/tests/helpers/economy-hook-harness.jsx');
    const { economyFixture, renewalEnvelope } = await import('/baseball-manager/src/engine/__tests__/fixtures/economyWorld.js');
    const saves = await import('/baseball-manager/src/engine/saveload.js');
    const world = economyFixture();
    if (large) world.teams[0].notes = 'large-root'.repeat(20000);
    await saves.saveGame(world, { skipCompression: true });
    const h = mountEconomyHook(await saves.loadGame());
    const older = h.current().commitEconomyCommand;
    const entry = { year: 2025, teamId: 0, stats: { HR: 23 } };
    h.update(gs => {
      gs.setSeasonHistory({ transfers: [{ id: 'latest' }] });
      gs.setGameResultsMap({ 1: { label: 'latest' } });
      gs.stageCareerEntries([{ playerId: 0, careerEntry: entry }]);
    });
    const set = Storage.prototype.setItem, before = localStorage.getItem('baseball_manager_v1');
    Storage.prototype.setItem = function(k, v) { if (k === 'baseball_manager_v1') throw new DOMException('full', 'QuotaExceededError'); return set.call(this, k, v); };
    const failed = await older(renewalEnvelope(world));
    Storage.prototype.setItem = set;
    const failure = { ok: failed.ok, revision: h.current().contractEconomy.revision,
      dirty: h.current().saveDirty, unchanged: localStorage.getItem('baseball_manager_v1') === before };
    const saved = await older(renewalEnvelope(world));
    const restored = await saves.loadGame();
    const replayed = await h.current().commitEconomyCommand(renewalEnvelope(world));
    const outcome = { failure, saved, replayed, restored,
      career: await saves.loadPlayerCareerLogById('0', world.saveId),
      rendered: document.querySelector('[data-economy-revision]')?.textContent };
    h.unmount(); return outcome;
  }, large);
  expect(result.failure).toEqual({ ok: false, revision: 0, dirty: true, unchanged: true });
  expect(result.saved).toMatchObject({ ok: true, committed: { revision: 1, receiptIds: [0] } });
  expect(result.replayed).toEqual({ ok: true, replayed: true });
  expect(result.restored.seasonHistory.transfers).toEqual([{ id: 'latest' }]);
  expect(result.restored.gameResultsMap).toEqual({ 1: { label: 'latest' } });
  expect(result.restored.contractEconomy.engine.transactions).toHaveLength(1);
  expect(result.career).toEqual([{ year: 2025, teamId: 0, stats: { HR: 23 } }]);
  expect(result.rendered).toBe('1');
});

test('save generations: real hook suspended adoption times out safely and recovers', async ({ page }) => {
  await page.goto('/');
  await page.clock.install();
  await page.evaluate(async () => {
    const { mountEconomyHook } = await import('/baseball-manager/tests/helpers/economy-hook-harness.jsx');
    const { economyFixture, renewalEnvelope } = await import('/baseball-manager/src/engine/__tests__/fixtures/economyWorld.js');
    const saves = await import('/baseball-manager/src/engine/saveload.js');
    const world = economyFixture(); await saves.saveGame(world, { skipCompression: true });
    const h = window.economyHarness = mountEconomyHook(await saves.loadGame());
    h.update(gs => gs.stageCareerEntries([{ playerId: 0, careerEntry: { year: 2025, stats: { HR: 29 } } }]));
    h.block();
    window.economyTask = h.current().commitEconomyCommand(renewalEnvelope(world));
  });
  await page.waitForFunction(() => window.economyHarness.suspended());
  expect(await page.evaluate(() => ({ revision: window.economyHarness.current().contractEconomy.revision,
    dirty: window.economyHarness.current().saveDirty }))).toEqual({ revision: 0, dirty: true });
  await page.clock.fastForward(10001);
  expect(await page.evaluate(() => window.economyTask)).toMatchObject({ ok: false, reason: 'economy_adoption_required' });
  const raw = await page.evaluate(() => localStorage.getItem('baseball_manager_v1'));
  await page.evaluate(() => window.economyHarness.resume());
  await expect(page.locator('[data-economy-revision="1"]')).toHaveText('1');
  expect(await page.evaluate(() => window.economyHarness.current().recoverEconomyCommand()))
    .toMatchObject({ ok: true, committed: { revision: 1, receiptIds: [0] } });
  expect(await page.evaluate(() => localStorage.getItem('baseball_manager_v1'))).toBe(raw);
  await page.waitForFunction(() => !window.economyHarness.current().saveDirty);
  await page.evaluate(() => window.economyHarness.unmount());
});

test('save generations: real hook remount acknowledges the published root and resumes saving', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { mountEconomyHook } = await import('/baseball-manager/tests/helpers/economy-hook-harness.jsx');
    const { economyFixture, renewalEnvelope } = await import('/baseball-manager/src/engine/__tests__/fixtures/economyWorld.js');
    const saves = await import('/baseball-manager/src/engine/saveload.js');
    const world = economyFixture(); await saves.saveGame(world, { skipCompression: true });
    const first = mountEconomyHook(await saves.loadGame());
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function(k, v) { set.call(this, k, v); if (k === 'baseball_manager_v1') first.unmount(); };
    const interrupted = await first.current().commitEconomyCommand(renewalEnvelope(world));
    Storage.prototype.setItem = set;
    const raw = localStorage.getItem('baseball_manager_v1');
    const second = mountEconomyHook(await saves.loadGame());
    const recovered = await second.current().recoverEconomyCommand();
    const unchanged = raw === localStorage.getItem('baseball_manager_v1');
    const saved = await second.current().handleSave({ silent: true });
    second.unmount(); return { interrupted, recovered, unchanged, saved };
  });
  expect(result.interrupted).toMatchObject({ ok: false, reason: 'economy_adoption_required' });
  expect(result.recovered).toMatchObject({ ok: true, committed: { revision: 1, receiptIds: [0] } });
  expect(result.unchanged).toBe(true); expect(result.saved.ok).toBe(true);
});

async function mountHumanRenewal(page, { reload = false, due = false, legacy = false, offseason = false } = {}) {
  await page.evaluate(async ({ reload, due, legacy, offseason }) => {
    const { renewalFixture } = await import('/baseball-manager/src/engine/__tests__/fixtures/renewalWorld.js');
    const { renewalRequest, reduceRenewalRequest } = await import('/baseball-manager/src/engine/renewalDecisions.js');
    const { saveGame, loadGame } = await import('/baseball-manager/src/engine/saveload.js');
    const { mountRenewalView } = await import('/baseball-manager/tests/helpers/renewal-hook-harness.jsx');
    let world = reload ? await loadGame() : renewalFixture();
    if (due) {
      world = reduceRenewalRequest(world, renewalRequest(world, { type: 'offer', playerId: 0, salary: 12000, years: 3 })).world;
      // Seed the clock, not an implementation of day progression (a later slice).
      world.contractEconomy.clock.date = '2026-07-18'; world.schedule[1].date.day = 18; world.mailbox = [];
    }
    if (!reload && !(await saveGame(world, { skipCompression: true })).ok) throw new Error('fixture save failed');
    window.renewalHarness?.unmount();
    window.renewalHarness = mountRenewalView(world, { legacy, offseason });
  }, { reload, due, legacy, offseason });
}
async function humanRenewalTerms(page) {
  await page.getByRole('button', { name: 'Aの契約を確認', exact: true }).click();
  await page.getByRole('spinbutton', { name: '提示年俸（万円）', exact: true }).fill('12000');
  await page.getByRole('combobox', { name: '契約年数', exact: true }).selectOption('3');
}
async function captureRenewal(page, testInfo, stage, width) {
  if (process.env.RENEWAL_CAPTURE) await page.screenshot({
    path: `${process.env.RENEWAL_CAPTURE}/${testInfo.project.name}-${width}-${stage}.png`, fullPage: true,
  });
}
for (const width of [360, 390, 1440]) test(`save generations: human renewal draft, retry and cold reload at ${width}px`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 900 }); await page.goto('/');
  await mountHumanRenewal(page, { legacy: true });
  await page.getByRole('combobox', { name: '契約状態', exact: true }).selectOption('all');
  await page.getByRole('button', { name: 'Aの契約を確認', exact: true }).click();
  await captureRenewal(page, testInfo, 'before', width);
  await mountHumanRenewal(page, { reload: true }); await humanRenewalTerms(page);
  await captureRenewal(page, testInfo, 'after', width);
  await page.getByRole('button', { name: '提示条件を確認する', exact: true }).click();
  await page.evaluate(() => {
    window.renewalWrite = Storage.prototype.setItem;
    window.renewalRoot = localStorage.getItem('baseball_manager_v1');
    Storage.prototype.setItem = function (key, value) {
      if (key === 'baseball_manager_v1') throw new DOMException('full', 'QuotaExceededError');
      return window.renewalWrite.call(this, key, value);
    };
  });
  await page.getByRole('button', { name: 'この条件で提示する', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('保存できません');
  await expect(page.getByText('提示を保存しました。回答待ちです。', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('spinbutton', { name: '提示年俸（万円）', exact: true })).toHaveValue('12000');
  expect(await page.evaluate(() => localStorage.getItem('baseball_manager_v1') === window.renewalRoot)).toBe(true);
  await captureRenewal(page, testInfo, 'write-error', width);
  await page.evaluate(() => { Storage.prototype.setItem = window.renewalWrite; });
  await page.getByRole('button', { name: 'この条件で提示する', exact: true }).click();
  await expect(page.getByText('提示を保存しました。回答待ちです。', { exact: true })).toBeVisible();
  await expect(page.getByText('回答予定：2026-07-18', { exact: true })).toBeVisible();
  await page.getByText('年度別の予算と契約負担', { exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await captureRenewal(page, testInfo, 'pending', width);
  await page.reload(); await mountHumanRenewal(page, { reload: true });
  await page.getByRole('button', { name: 'Aの契約を確認', exact: true }).click();
  await expect(page.getByText('回答予定：2026-07-18', { exact: true })).toBeVisible();
  await expect(page.getByRole('spinbutton', { name: '提示年俸（万円）', exact: true })).toHaveValue('12000');
  await expect(page.getByRole('combobox', { name: '契約年数', exact: true })).toHaveValue('3');
  await captureRenewal(page, testInfo, 'reloaded', width);
  const saved = await page.evaluate(async () => {
    const w = await (await import('/baseball-manager/src/engine/saveload.js')).loadGame();
    return { salary: w.teams[0].players[0].salary, decisions: w.contractEconomy.decisions.length,
      receipts: w.contractEconomy.engine.transactions.length, reservations: w.contractEconomy.engine.spending.reservations.length };
  });
  expect(saved).toEqual({ salary: 10000, decisions: 1, receipts: 1, reservations: 1 });
  await page.getByRole('spinbutton', { name: '提示年俸（万円）', exact: true }).fill('13000');
  await page.getByRole('combobox', { name: '契約年数', exact: true }).selectOption('2');
  await page.getByRole('button', { name: '提示条件を確認する', exact: true }).click();
  const confirmation = page.getByRole('region', { name: '提示条件の最終確認', exact: true });
  await expect(confirmation).toContainText('保存済みの提示：年俸1.20億円・3年');
  await expect(confirmation).toContainText('差替後の提示：2027年度から年俸1.30億円・2年');
  await captureRenewal(page, testInfo, 'replacement', width);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.getByRole('button', { name: 'この条件で提示する', exact: true }).click();
  await expect(page.getByText('提示を保存しました。回答待ちです。', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.renewalHarness.current().contractEconomy.decisions.map(d => d.status))).toEqual(['replaced', 'pending']);
  await page.getByRole('button', { name: '提示を取り消す', exact: true }).click();
  await page.getByRole('button', { name: '取消を確定する', exact: true }).click();
  await expect(page.getByText('提示を取り消しました。', { exact: true })).toBeVisible();
});

test('save generations: human renewal due reply survives missing mail and cold reload', async ({ page }) => {
  await page.goto('/'); await mountHumanRenewal(page, { due: true, offseason: true });
  // Standalone offseason routes must own a readable canvas, independent of the hub shell.
  expect(await page.locator('[data-ds="annual-renewal-screen"]').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(244, 246, 249)');
  await page.getByRole('button', { name: 'Aの契約を確認', exact: true }).click();
  await expect(page.getByRole('button', { name: '提示を取り消す', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '提示条件を確認する', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '届いた回答を確認する', exact: true }).click();
  await expect(page.getByText('届いた回答を保存しました。', { exact: true })).toBeVisible();
  await page.reload(); await mountHumanRenewal(page, { reload: true });
  await page.getByRole('button', { name: 'Aの契約を確認', exact: true }).click();
  await expect(page.locator('.decision-detail')).toContainText('来季契約済み');
  await expect(page.getByRole('spinbutton', { name: '提示年俸（万円）', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => {
    const gs = window.renewalHarness.current();
    return { salary: gs.myTeam.players[0].salary, status: gs.contractEconomy.decisions[0].status,
      agreements: gs.contractEconomy.engine.spending.ledger.records.filter(r => r.contract.startSeason === 2027).length };
  })).toEqual({ salary: 10000, status: 'accepted', agreements: 1 });
});

test('save generations: human renewal recovers acknowledgement without a second transaction', async ({ page }) => {
  await page.goto('/'); await mountHumanRenewal(page); await humanRenewalTerms(page);
  await page.getByRole('button', { name: '提示条件を確認する', exact: true }).click();
  await page.evaluate(() => {
    window.renewalRead = Storage.prototype.getItem;
    let interrupted = false;
    Storage.prototype.getItem = function (key) {
      if (key === 'baseball_manager_v1' && window.renewalHarness.current().contractEconomy.revision === 1 && !interrupted) {
        interrupted = true; throw new Error('ack interrupted');
      }
      return window.renewalRead.call(this, key);
    };
  });
  await page.getByRole('button', { name: 'この条件で提示する', exact: true }).click();
  await expect(page.getByRole('button', { name: '保存済みの更改を復旧する', exact: true })).toBeVisible();
  await expect(page.getByText('提示を保存しました。回答待ちです。', { exact: true })).toHaveCount(0);
  const root = await page.evaluate(() => {
    Storage.prototype.getItem = window.renewalRead;
    return localStorage.getItem('baseball_manager_v1');
  });
  await page.getByRole('button', { name: '保存済みの更改を復旧する', exact: true }).click();
  await expect(page.getByText('保存済みの更改を復旧しました。', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('baseball_manager_v1'))).toBe(root);
  expect(await page.evaluate(() => window.renewalHarness.current().contractEconomy.engine.transactions.length)).toBe(1);
});
