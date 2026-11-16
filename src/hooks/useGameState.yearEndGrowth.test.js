import { createInitialTeams } from '../engine/bootstrapTeams';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { useGameState } from './useGameState';
import { useOffseason } from './useOffseason';
import { saveGame, loadGame, getSaveQueueSnapshot, loadPlayerCareerLogById } from '../engine/saveload';
import { growthSource } from '../engine/__tests__/fixtures/yearEndGrowth';
import { yearEndReviewWorld } from '../engine/__tests__/fixtures/yearEndRetirements';
import { RetirePhaseScreen } from '../components/OffseasonReviewScreens';
import { postingGenerationRequest } from '../engine/humanPosting';
import { economyFixture } from '../engine/__tests__/fixtures/economyWorld';
import { winter, wrap } from '../engine/__tests__/fixtures/annualRetirements';
let gs, os, view, storage;
const primary = 'baseball_manager_v1';
beforeEach(() => {
  storage = new Map();
  vi.stubGlobal('localStorage', { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) });
  vi.stubGlobal('indexedDB', new IDBFactory()); vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  for (const k of ['log', 'warn', 'error', 'table']) vi.spyOn(console, k).mockImplementation(() => {});
});
afterEach(async () => {
  if (view) act(() => view.unmount()); view = null;
  for (let i = 0; i < 150 && getSaveQueueSnapshot().isSaving; i++) await new Promise(r => setTimeout(r, 10));
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});
async function setup(w = growthSource(), ui = false) {
  expect((await saveGame(w, { skipCompression: true })).ok).toBe(true);
  function Harness() {
    gs = useGameState(); os = useOffseason(gs);
    return ui && gs.myTeam ? React.createElement(RetirePhaseScreen, { teams: gs.teams, myId: gs.myId, year: gs.year,
      annualWorld: gs, onYearEnd: os.handleYearEndRetirements, onGrowth: os.handleYearEndGrowth, onPrepare: os.handlePrepareAnnualPosting,
      onRecover: gs.recoverEconomyCommand, onOpenInbox: () => {} }) : null;
  }
  await act(async () => { view = create(React.createElement(Harness)); });
  act(() => expect(gs.hydrateSavedWorld(w, { progressToken: gs.getProgressToken(), sessionToken: gs.getProgressSessionToken() })).toBe(true));
  return w;
}
async function run(operation) {
  let task, result, done = false;
  act(() => { task = Promise.resolve(operation()).then(r => { result = r; done = true; }); });
  for (let i = 0; i < 500 && !done; i++) await act(async () => { await new Promise(r => setTimeout(r, 10)); });
  await task; await act(async () => {}); return result;
}
const commit = () => os.handleYearEndGrowth();
const facts = () => gs.contractEconomy.engine.transactions.find(t => t.yearEndGrowth)?.yearEndGrowth;
it('publishes growth once and retains exact results through failure, retry, cold and backup recovery', async () => {
  const w = await setup(), root = storage.get(primary), write = localStorage.setItem;
  localStorage.setItem = (k,v) => { if (k === primary) throw Error('full'); write(k,v); };
  expect(await run(commit)).toBe(false); expect(storage.get(primary)).toBe(root); expect(gs.teams).toEqual(w.teams);
  localStorage.setItem = write;
  expect(await run(commit)).toBe(true); const saved = storage.get(primary), g = structuredClone(facts());
  expect(gs.saveDirty).toBe(false); expect(await run(commit)).toBe(true); expect(storage.get(primary)).toBe(saved);
  storage.set('baseball_manager_v1_bk1',saved); storage.delete(primary);
  vi.stubGlobal('localStorage', { getItem:k=>storage.get(k)??null, setItem:(k,v)=>storage.set(k,String(v)), removeItem:k=>storage.delete(k) });
  const loaded = await loadGame(); expect(loaded.contractEconomy.engine.transactions.at(-1).yearEndGrowth).toEqual(g);
  act(() => expect(gs.hydrateSavedWorld(loaded, { progressToken: gs.getProgressToken(), sessionToken: gs.getProgressSessionToken() })).toBe(true));
  expect(facts()).toEqual(g); expect(await run(commit)).toBe(true); expect(storage.get(primary)).toBeUndefined();
});
it('recovers published growth without a second root write', async () => {
  const w = await setup(), read = localStorage.getItem; let interrupted = false;
  localStorage.getItem = k => {
    if (k === primary && gs.contractEconomy.revision === w.contractEconomy.revision + 1 && !interrupted) { interrupted = true; throw Error('ack'); }
    return read(k);
  };
  expect(await run(commit)).toBe(false); const root = storage.get(primary);
  expect(gs.isEconomyRecoveryPending).toBe(true); localStorage.getItem = read;
  expect(await run(() => gs.recoverEconomyCommand())).toMatchObject({ ok:true }); expect(storage.get(primary)).toBe(root);
  expect(facts()).toBeDefined();
});
it('exposes growth save and the saved reason/result UI', async () => {
  await setup(undefined,true);
  const button = label => view.root.findAllByType('button').find(b=>b.children.join('')===label);
  expect(button('年度末成長・要求年俸を確認する')).toBeTruthy();
  act(()=>button('年度末成長・要求年俸を確認する').props.onClick());
  await run(()=>button('成長・要求年俸を保存する').props.onClick());
  expect(facts()).toBeDefined(); expect(view.root.findByProps({'aria-label':'保存済みの成長・要求年俸'})).toBeTruthy();
});

it('continues to posting only after saving growth', async()=>{ await setup(); expect(await run(()=>os.handlePrepareAnnualPosting())).toBe(false); expect(await run(commit)).toBe(true); expect(await run(()=>os.handlePrepareAnnualPosting())).toBe(true); });

it('publishes actual twelve-club growth through the real save barrier and reloads identical evidence',async()=>{
 const w=await setup(growthSource(createInitialTeams()));
 expect(await run(commit)).toBe(true);const report=structuredClone(facts()),teams=structuredClone(gs.teams);
 expect(report.rows).toHaveLength(w.teams.reduce((n,t)=>n+t.players.length+t.farm.length,0));
 const loaded=await loadGame();expect(loaded.teams).toEqual(teams);
 expect(loaded.contractEconomy.engine.transactions.find(t=>t.yearEndGrowth).yearEndGrowth).toEqual(report);
},60000);
