import { writeFileSync,mkdirSync } from 'node:fs';
import { offseasonPostingRequest,reduceOffseasonPostingRequest } from '../engine/humanPosting';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { useGameState } from './useGameState';
import { useOffseason } from './useOffseason';
import { saveGame, loadGame } from '../engine/saveload';
import { renewalFixture } from '../engine/__tests__/fixtures/renewalWorld';
import { growthSource, growthCommand } from '../engine/__tests__/fixtures/yearEndGrowth';
import { createInitialTeams } from '../engine/bootstrapTeams';
import { cpuContractsRequest } from '../engine/annualCpuContracts';
import { quoteAnnualSpendingPlan } from '../engine/annualSpending';
import { fromAnnualState, toAnnualState, reduceEconomyCommand } from '../engine/contractEconomy';
import { renewalRequest, reduceRenewalRequest } from '../engine/renewalDecisions';
let gs, os, view, storage;
const primary = 'baseball_manager_v1';
beforeEach(() => {
  storage = new Map();
  vi.stubGlobal('localStorage', { getItem: k => storage.get(k) ?? null,
    setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) });
  vi.stubGlobal('indexedDB', new IDBFactory()); vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  for (const level of ['log', 'warn', 'error', 'table']) vi.spyOn(console, level).mockImplementation(() => {});
});
afterEach(() => { if (view) act(() => view.unmount()); view = null; vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function setup(world = renewalFixture()) {
  expect((await saveGame(world, { skipCompression: true })).ok).toBe(true);
  world = await loadGame();
  function Harness() { gs = useGameState(); os = useOffseason(gs); return null; }
  await act(async () => { view = create(React.createElement(Harness)); });
  act(() => expect(gs.hydrateSavedWorld(world, { progressToken: gs.getProgressToken(), sessionToken: gs.getProgressSessionToken() })).toBe(true));
}
async function run(operation) {
  let result, done = false, task;
  act(() => { task = Promise.resolve(operation()).then(r => { done = true; result = r; }); });
  for (let i = 0; i < 150 && !done; i++) await act(async () => { await new Promise(r => setTimeout(r, 10)); });
  await task; await act(async () => {}); return result;
}


const winter=()=>renewalFixture({phase:'offseason',date:'2026-12-01'});
it('saves CPU contracts atomically across failure, cold reload, retry and replay',async()=>{
 await setup(winter());const request=cpuContractsRequest(gs),before=structuredClone(gs.contractEconomy),root=storage.get(primary),write=localStorage.setItem;
 localStorage.setItem=(k,v)=>{if(k===primary)throw Error('full');write(k,v);};
 expect(await run(()=>os.handleCpuContracts())).toMatchObject({ok:false});expect(gs.contractEconomy).toEqual(before);expect(storage.get(primary)).toBe(root);
 localStorage.setItem=write;const old=await loadGame();
 act(()=>expect(gs.hydrateSavedWorld(old,{progressToken:gs.getProgressToken(),sessionToken:gs.getProgressSessionToken()})).toBe(true));
 expect(await run(()=>os.handleCpuContracts())).toMatchObject({ok:true});
 const loaded=await loadGame();expect(loaded.contractEconomy).toEqual(gs.contractEconomy);expect(loaded.teams).toEqual(gs.teams);expect(loaded.faPool).toEqual(gs.faPool);
 const saved=storage.get(primary);expect(await run(()=>gs.commitCpuContractsRequest(request,gs.getProgressSessionToken()))).toMatchObject({ok:true,replayed:true});expect(storage.get(primary)).toBe(saved);
});
it('rejects duplicate operations and old session callbacks',async()=>{
 await setup(winter());const callback=os.handleCpuContracts;let duplicate;
 expect(await run(()=>{const p=callback();duplicate=callback();return p;})).toMatchObject({ok:true});
 expect(await duplicate).toMatchObject({ok:false,reason:'economy_commit_pending'});
 const loaded=await loadGame();act(()=>gs.hydrateSavedWorld(loaded,{progressToken:gs.getProgressToken(),sessionToken:gs.getProgressSessionToken()}));
 expect(await run(callback)).toMatchObject({ok:false,reason:'economy_session_conflict'});
});
let realWorld;
beforeAll(() => {
 const source=growthSource(createInitialTeams());const grown=reduceEconomyCommand(source,growthCommand(source));expect(grown.ok,grown.error).toBe(true);
 const posted=reduceOffseasonPostingRequest(grown.world,offseasonPostingRequest(grown.world));expect(posted.ok,posted.error).toBe(true);
 realWorld=posted.world;
 if(process.env.CPU_VALIDATION_DIR){mkdirSync(process.env.CPU_VALIDATION_DIR,{recursive:true});writeFileSync(process.env.CPU_VALIDATION_DIR+'/source.json',JSON.stringify(realWorld));}
},60000);
beforeEach(async ({ task }) => { if(task.name.startsWith('uses real twelve-club')) await setup(realWorld); });
it('uses real twelve-club producers and retains CPU contracts, rosters, budgets, markets and histories after reload',async()=>{
 const started=performance.now();const human=structuredClone(gs.teams.find(t=>t.id===gs.myId));
 expect(await run(()=>os.handleCpuContracts())).toMatchObject({ok:true});
 const loaded=await loadGame();expect(loaded.teams).toHaveLength(12);expect(loaded.teams.find(t=>t.id===gs.myId)).toEqual(human);
 expect(loaded.contractEconomy).toEqual(gs.contractEconomy);expect(loaded.teams).toEqual(gs.teams);expect(loaded.faPool).toEqual(gs.faPool);
 const g=loaded.contractEconomy.engine.transactions.at(-1).cpuContracts;expect(g.rows.length).toBeGreaterThan(700);
 const future=quoteAnnualSpendingPlan(toAnnualState(loaded).spending);
 for(const t of loaded.teams)expect(t.budget).toBe(future.find(r=>r.teamId===t.id&&r.season===2027).remainingManYen);
 if(process.env.CPU_VALIDATION_DIR)writeFileSync(process.env.CPU_VALIDATION_DIR+'/result.json',JSON.stringify({elapsedMs:performance.now()-started,teams:loaded.teams.length,rows:g.rows.length,outcomes:g.rows.reduce((n,r)=>(n[r.outcome]=(n[r.outcome]??0)+1,n),{})},null,2));
},60000);
it('recovers a published CPU candidate without a second write or a second judgment',async()=>{
 await setup(winter());const revision=gs.contractEconomy.revision,read=localStorage.getItem;let interrupted=false;
 localStorage.getItem=k=>{if(k===primary&&gs.contractEconomy.revision===revision+1&&!interrupted){interrupted=true;throw Error('ack');}return read(k);};
 expect(await run(()=>os.handleCpuContracts())).toMatchObject({ok:false,reason:'economy_adoption_required'});
 const root=storage.get(primary);localStorage.getItem=read;
 expect(await run(()=>gs.recoverEconomyCommand())).toMatchObject({ok:true});expect(storage.get(primary)).toBe(root);
 expect(gs.contractEconomy.engine.transactions.filter(t=>t.cpuContracts)).toHaveLength(1);
});
it('retains market removal, history and budgets together after a failed save and retry',async()=>{
 let w=winter();for(const a of w.contractEconomy.engine.spending.authorizations)if(a.teamId===1&&a.season>=2027)a.approvedManYen=0;
 for(const a of w.contractEconomy.budgetPolicies)if(a.teamId===1&&a.season>=2027)a.approvedManYen=0;
 w=fromAnnualState(w,toAnnualState(w));await setup(w);const root=storage.get(primary),write=localStorage.setItem;
 localStorage.setItem=(k,v)=>{if(k===primary)throw Error('full');write(k,v);};
 expect(await run(()=>os.handleCpuContracts())).toMatchObject({ok:false});expect(storage.get(primary)).toBe(root);expect(gs.teams[1].players).toHaveLength(1);
 localStorage.setItem=write;expect(await run(()=>os.handleCpuContracts())).toMatchObject({ok:true});
 const loaded=await loadGame();expect(loaded.faPool.find(p=>p.id==='b')).toMatchObject({departureReason:'expiry'});
 expect(loaded.teams[1].players).toHaveLength(0);expect(loaded.teams[1].history.at(-1).exitReason).toBe('契約満了');
 expect(loaded.contractEconomy).toEqual(gs.contractEconomy);
});
it('leaves human pending answers and human roster judgments to the existing reply action',async()=>{
 const w=winter(),offered=reduceRenewalRequest(w,renewalRequest(w,{type:'offer',playerId:0,salary:12000,years:1}));expect(offered.ok,offered.error).toBe(true);
 await setup(offered.world);const human=structuredClone(gs.teams[0]),decisions=structuredClone(gs.contractEconomy.decisions),clock=structuredClone(gs.contractEconomy.clock);
 expect(await run(()=>os.handleCpuContracts())).toMatchObject({ok:true});
 expect(gs.teams[0]).toEqual(human);expect(gs.contractEconomy.decisions).toEqual(decisions);expect(gs.contractEconomy.clock).toEqual(clock);
 expect((await loadGame()).contractEconomy.decisions).toEqual(decisions);
});
