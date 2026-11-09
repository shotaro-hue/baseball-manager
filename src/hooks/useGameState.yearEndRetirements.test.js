import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { useGameState } from './useGameState';
import { useOffseason } from './useOffseason';
import { saveGame, loadGame, getSaveQueueSnapshot, loadPlayerCareerLogById } from '../engine/saveload';
import { yearEndReviewWorld } from '../engine/__tests__/fixtures/yearEndRetirements';
import { RetirePhaseScreen } from '../components/OffseasonReviewScreens';
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
async function setup(w = yearEndReviewWorld(), ui = false) {
  expect((await saveGame(w, { skipCompression: true })).ok).toBe(true);
  function Harness() {
    gs = useGameState(); os = useOffseason(gs);
    return ui && gs.myTeam ? React.createElement(RetirePhaseScreen, { teams: gs.teams, myId: gs.myId, year: gs.year,
      annualWorld: gs, onYearEnd: os.handleYearEndRetirements, onPrepare: os.handlePrepareAnnualPosting,
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
const choices = () => [{ playerId: gs.teams[0].players[0].id, choice: 'accept' }];
const commit = decisions => { expect(os.handleYearEndRetirements).toBeTypeOf('function'); return os.handleYearEndRetirements(decisions ?? choices()); };
const facts = () => gs.contractEconomy.engine.transactions.find(t => t.yearEndRetirements)?.yearEndRetirements;

it('saves the full year-end outcome and career then exposes separate posting', async () => {
  const w = await setup(), p = w.teams[0].players[0];
  expect(await run(() => commit())).toBe(true);
  expect(gs.contractEconomy.revision).toBe(w.contractEconomy.revision + 1);
  expect(facts().candidates[0].outcome).toBe('accepted');
  expect(gs.teams[0].players).toEqual([]); expect(gs.saveDirty).toBe(false);
  expect((await loadGame()).contractEconomy).toEqual(gs.contractEconomy);
  expect((await loadPlayerCareerLogById(String(p.id), w.saveId)).filter(r => r.year === w.year)).toHaveLength(1);
  expect(await run(() => os.handlePrepareAnnualPosting())).toBe(true);
});
it('keeps the root and player on failed publication and retries the same decisions once', async () => {
  const w = await setup(), root = storage.get(primary), write = localStorage.setItem, d = choices();
  localStorage.setItem = (k, v) => { if (k === primary) throw Error('full'); write(k, v); };
  expect(await run(() => commit(d))).toBe(false); expect(storage.get(primary)).toBe(root); expect(gs.teams).toEqual(w.teams);
  localStorage.setItem = write;
  expect(await run(() => commit(d))).toBe(true); const saved = storage.get(primary);
  expect(await run(() => commit(d))).toBe(true); expect(storage.get(primary)).toBe(saved);
  expect(gs.contractEconomy.engine.retirementReservations).toHaveLength(2);
});
it('guards the new entry against a stale session and the posting shortcut', async () => {
  const w = await setup(), handler = os.handleYearEndRetirements, root = storage.get(primary);
  expect(await run(() => os.handlePrepareAnnualPosting())).toBe(false); expect(storage.get(primary)).toBe(root);
  act(() => expect(gs.hydrateSavedWorld(w, { progressToken: gs.getProgressToken(), sessionToken: gs.getProgressSessionToken() })).toBe(true));
  expect(await run(() => handler(choices()))).toBe(false); expect(storage.get(primary)).toBe(root);
});
it('recovers an already published outcome without another root write', async () => {
  const w = await setup(), read = localStorage.getItem; let interrupted = false;
  localStorage.getItem = k => {
    if (k === primary && gs.contractEconomy.revision === w.contractEconomy.revision + 1 && !interrupted) { interrupted = true; throw Error('ack'); }
    return read(k);
  };
  expect(await run(() => commit())).toBe(false); const root = storage.get(primary);
  expect(gs.isEconomyRecoveryPending).toBe(true); localStorage.getItem = read;
  expect(await run(() => gs.recoverEconomyCommand())).toMatchObject({ ok: true }); expect(storage.get(primary)).toBe(root);
  expect(facts().candidates).toHaveLength(2);
});
it('collects intent in the annual review screen and shows only saved results', async () => {
  await setup(undefined, true);
  const button = label => view.root.findAllByType('button').find(b => b.children.join('') === label);
  expect(button('引退を受け入れる')).toBeTruthy();
  act(() => button('引退を受け入れる').props.onClick());
  expect(facts()).toBeUndefined();
  act(() => button('期末の引退判断を確認する').props.onClick());
  expect(view.root.findByProps({ role: 'dialog' })).toBeTruthy();
  await run(() => button('引退判断を保存する').props.onClick());
  expect(facts().candidates[0].outcome).toBe('accepted');
  expect(button('引退予約を確定して希望を確認する')).toBeTruthy();
});
