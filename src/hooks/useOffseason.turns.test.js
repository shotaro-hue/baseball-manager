import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { reviewRenewalWinter } from '../engine/__tests__/fixtures/renewalGrowth';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { useGameState } from './useGameState';
import { useOffseason } from './useOffseason';
import { saveGame, loadGame, loadPlayerCareerLogById } from '../engine/saveload';
import { renewalFixture } from '../engine/__tests__/fixtures/renewalWorld';
import { growthSource, growthCommand } from '../engine/__tests__/fixtures/yearEndGrowth';
import { createInitialTeams } from '../engine/bootstrapTeams';
import { advanceOffseasonTurn, offseasonTurnRequest } from '../engine/economyDecisions';
import { quoteAnnualSpendingPlan } from '../engine/annualSpending';
import { toAnnualState, reduceEconomyCommand } from '../engine/contractEconomy';
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


const pendingWinter = () => {
 const w=renewalFixture({phase:'offseason',date:'2026-12-01'});
 const r=reduceRenewalRequest(w,renewalRequest(w,{type:'offer',playerId:0,salary:12000,years:1}));
 expect(r.ok,r.error).toBe(true);return r.world;
};
it('saves clock and answer together, preserving the source on failure and retrying once across reload and backup',async()=>{
 await setup(pendingWinter());const due=gs.contractEconomy.decisions[0].dueTurn;
 while(gs.contractEconomy.clock.offseasonTurn<due-1)expect((await run(()=>os.handleAdvanceOffseasonTurn())).ok).toBe(true);
 const before=structuredClone(gs.contractEconomy),root=storage.get(primary),write=localStorage.setItem;
 localStorage.setItem=(k,v)=>{if(k===primary)throw Error('full');write(k,v);};
 expect(await run(()=>os.handleAdvanceOffseasonTurn())).toMatchObject({ok:false});
 expect(gs.contractEconomy).toEqual(before);expect(storage.get(primary)).toBe(root);
 localStorage.setItem=write;
 const loaded=await loadGame();expect(loaded.contractEconomy).toEqual(before);
 act(()=>expect(gs.hydrateSavedWorld(loaded,{progressToken:gs.getProgressToken(),sessionToken:gs.getProgressSessionToken()})).toBe(true));
 expect(await run(()=>os.handleAdvanceOffseasonTurn())).toMatchObject({ok:true});
 expect(gs.contractEconomy.decisions[0].status).toBe('accepted');expect(gs.contractEconomy.clock.offseasonTurn).toBe(due);
 const saved=storage.get(primary),final=structuredClone(gs.contractEconomy);
 storage.set('baseball_manager_v1_bk1',saved);storage.delete(primary);
 expect((await loadGame()).contractEconomy).toEqual(final);
});
it('rejects double clicks, stale revision and callbacks from an old session',async()=>{
 await setup(pendingWinter());const callback=os.handleAdvanceOffseasonTurn;let duplicate;
 expect(await run(()=>{const r=callback();duplicate=callback();return r;})).toMatchObject({ok:true});
 expect(await duplicate).toMatchObject({ok:false,reason:'economy_commit_pending'});
 expect(await run(callback)).toMatchObject({ok:false});expect(gs.contractEconomy.clock.offseasonTurn).toBe(1);
 const current=os.handleAdvanceOffseasonTurn,w=await loadGame();
 act(()=>expect(gs.hydrateSavedWorld(w,{progressToken:gs.getProgressToken(),sessionToken:gs.getProgressSessionToken()})).toBe(true));
 expect(await run(current)).toMatchObject({ok:false,reason:'economy_session_conflict'});
});
it('recovers a published turn and answer without writing or processing them twice',async()=>{
 await setup(pendingWinter());const due=gs.contractEconomy.decisions[0].dueTurn;
 while(gs.contractEconomy.clock.offseasonTurn<due-1)expect((await run(()=>os.handleAdvanceOffseasonTurn())).ok).toBe(true);
 const revision=gs.contractEconomy.revision,read=localStorage.getItem;let interrupted=false;
 localStorage.getItem=k=>{if(k===primary&&gs.contractEconomy.revision===revision+1&&!interrupted){interrupted=true;throw Error('ack');}return read(k);};
 expect(await run(()=>os.handleAdvanceOffseasonTurn())).toMatchObject({ok:false,reason:'economy_adoption_required'});
 const root=storage.get(primary);localStorage.getItem=read;
 expect(await run(()=>gs.recoverEconomyCommand())).toMatchObject({ok:true});expect(storage.get(primary)).toBe(root);
 expect(gs.contractEconomy.clock.offseasonTurn).toBe(due);expect(gs.contractEconomy.decisions[0].status).toBe('accepted');
});
it('uses actual twelve-club year-end producers and saves their due reply through the real barrier',async()=>{
 const source=growthSource(createInitialTeams()),sourceBefore=structuredClone(source);
 expect(advanceOffseasonTurn(source,offseasonTurnRequest(source))).toMatchObject({ok:false,world:source});expect(source).toEqual(sourceBefore);
 const grown=reduceEconomyCommand(source,growthCommand(source));expect(grown.ok,grown.error).toBe(true);
 const p=grown.world.teams[0].players.find(p=>p.contractYearsLeft===1);
 const offer=reduceRenewalRequest(grown.world,renewalRequest(grown.world,{type:'offer',playerId:p.id,salary:Math.max(p.salary,20000),years:1}));expect(offer.ok,offer.error).toBe(true);
 let ready=offer.world;const d=ready.contractEconomy.decisions.at(-1);
 while(ready.contractEconomy.clock.offseasonTurn<d.dueTurn-1){const r=advanceOffseasonTurn(ready,offseasonTurnRequest(ready));expect(r.ok,r.error).toBe(true);ready=r.world;}
 await setup(ready);expect(gs.teams).toHaveLength(12);
 const before=structuredClone(gs.contractEconomy.engine.transactions),teams=structuredClone(gs.teams);
 expect((await run(()=>os.handleAdvanceOffseasonTurn())).ok).toBe(true);
 expect(gs.contractEconomy.decisions.at(-1).status).toBe(d.willAccept?'accepted':'rejected');
 const loaded=await loadGame();expect(loaded.contractEconomy).toEqual(gs.contractEconomy);expect(loaded.teams.map(({budget,...t})=>t)).toEqual(teams.map(({budget,...t})=>t));
 const quotes=quoteAnnualSpendingPlan(toAnnualState(loaded).spending);
 for(const t of loaded.teams)expect(t.budget).toBe(quotes.find(q=>q.teamId===t.id&&q.season===loaded.contractEconomy.engine.spending.budgetSeason).remainingManYen);
 expect(loaded.contractEconomy.engine.transactions.slice(0,before.length)).toEqual(before);
 expect(await loadPlayerCareerLogById(p.id,loaded.saveId)).toEqual(p.careerLog);
},60000);
it('flushes an acknowledged mail-read base before the turn CAS without losing the read or promise',async()=>{
 await setup(pendingWinter());const mailId=gs.mailbox[0].id;
 act(()=>os.handleMailRead(mailId));
 expect(await run(()=>os.handleAdvanceOffseasonTurn())).toMatchObject({ok:true});
 const loaded=await loadGame();expect(loaded.mailbox.find(m=>m.id===mailId).read).toBe(true);
 expect(loaded.contractEconomy.clock.offseasonTurn).toBe(1);expect(loaded.contractEconomy.decisions[0].status).toBe('pending');
});

it('keeps the native growth gate after cold reload and allows a turn after growth is actually saved',async()=>{
 await setup(reviewRenewalWinter());const before=structuredClone(gs.contractEconomy),root=storage.get(primary);
 expect(await run(()=>os.handleAdvanceOffseasonTurn())).toMatchObject({ok:false});expect(gs.contractEconomy).toEqual(before);expect(storage.get(primary)).toBe(root);
 const callback=os.handleAdvanceOffseasonTurn,loaded=await loadGame();
 act(()=>expect(gs.hydrateSavedWorld(loaded,{progressToken:gs.getProgressToken(),sessionToken:gs.getProgressSessionToken()})).toBe(true));
 expect(await run(callback)).toMatchObject({ok:false,reason:'economy_session_conflict'});
 expect(await run(()=>os.handleAdvanceOffseasonTurn())).toMatchObject({ok:false});expect(storage.get(primary)).toBe(root);
 expect(await run(()=>os.handleYearEndGrowth())).toBe(true);const grown=structuredClone(gs.contractEconomy.engine),teams=structuredClone(gs.teams);
 expect(await run(()=>os.handleAdvanceOffseasonTurn())).toMatchObject({ok:true});expect(gs.contractEconomy.clock.offseasonTurn).toBe(1);
 expect(gs.contractEconomy.engine).toEqual(grown);expect(gs.teams).toEqual(teams);expect((await loadGame()).contractEconomy).toEqual(gs.contractEconomy);
});
it('rescues a pre-growth saved answer through failure and cold reload, then saves no further empty turns',async()=>{
 const original=JSON.parse(gunzipSync(readFileSync(new URL('../engine/__tests__/fixtures/renewalBeforeGrowthPending.json.gz',import.meta.url))));
 await setup(original);expect((await run(()=>os.handleAdvanceOffseasonTurn())).ok).toBe(true);
 const before=structuredClone(gs.contractEconomy),root=storage.get(primary),write=localStorage.setItem;
 localStorage.setItem=(k,v)=>{if(k===primary)throw Error('quota');write(k,v);};
 expect(await run(()=>os.handleAdvanceOffseasonTurn())).toMatchObject({ok:false});expect(gs.contractEconomy).toEqual(before);expect(storage.get(primary)).toBe(root);
 localStorage.setItem=write;const loaded=await loadGame();
 act(()=>expect(gs.hydrateSavedWorld(loaded,{progressToken:gs.getProgressToken(),sessionToken:gs.getProgressSessionToken()})).toBe(true));
 expect(await run(()=>os.handleAdvanceOffseasonTurn())).toMatchObject({ok:true});expect(gs.contractEconomy.decisions[0].status).toBe('accepted');
 const accepted=structuredClone(gs.contractEconomy),saved=storage.get(primary);
 expect(await run(()=>os.handleAdvanceOffseasonTurn())).toMatchObject({ok:false});expect(gs.contractEconomy).toEqual(accepted);expect(storage.get(primary)).toBe(saved);
 expect(await run(()=>gs.commitRenewalRequest(original.contractEconomy.decisions[0].request,gs.getProgressSessionToken()))).toMatchObject({ok:true,replayed:true});expect(storage.get(primary)).toBe(saved);
});
