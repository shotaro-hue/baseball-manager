import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { useGameState } from './useGameState';
import { useOffseason } from './useOffseason';
import HubContentRouter from '../components/hub/HubContentRouter';
import { saveGame, loadGame, getSaveQueueSnapshot } from '../engine/saveload';
import { postingDecisionRequest } from '../engine/humanPosting';
import { postingUiWorld } from '../engine/__tests__/fixtures/postingUi';
import { postingApplicationViews } from '../engine/annualPostingApplications';
import { reduceEconomyCommand, toAnnualState } from '../engine/contractEconomy';
import { envelope } from '../engine/__tests__/fixtures/faDeclarations';
import { isIkuseiPlayer } from '../engine/rosterCapacity';

let gs, view, rows;
const primary = 'baseball_manager_v1';
beforeEach(() => {
  rows = new Map();
  vi.stubGlobal('localStorage', { getItem: k => rows.get(k) ?? null, setItem: (k, v) => rows.set(k, String(v)), removeItem: k => rows.delete(k) });
  vi.stubGlobal('indexedDB', new IDBFactory()); vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  for (const level of ['log', 'warn', 'error', 'table']) vi.spyOn(console, level).mockImplementation(() => {});
});
afterEach(async () => {
  if (view) act(() => view.unmount()); view = null;
  for (let i = 0; i < 150 && getSaveQueueSnapshot().isSaving; i++) await new Promise(r => setTimeout(r, 10));
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});
async function setup(w = postingUiWorld(), panel = false) {
  expect((await saveGame(w, { skipCompression: true })).ok).toBe(true);
  w = await loadGame();
  function Harness() {
    gs = useGameState(); const os = useOffseason(gs);
    return panel && gs.myTeam ? React.createElement(HubContentRouter, { app: { gs, os, sf: {} }, tab: 'mailbox', onOpen: vi.fn() }) : null;
  }
  await act(async () => { view = create(React.createElement(Harness)); });
  act(() => { expect(gs.hydrateSavedWorld(w, { progressToken: gs.getProgressToken(), sessionToken: gs.getProgressSessionToken() })).toBe(true); gs.setScreen('hub'); });
}
async function run(operation) {
  let task, result, done = false;
  act(() => { task = Promise.resolve(operation()).then(r => { result = r; done = true; }); });
  for (let i = 0; i < 150 && !done; i++) await act(async () => { await new Promise(r => setTimeout(r, 10)); });
  await task; await act(async () => {}); return result;
}
const content = n => typeof n === 'string' ? n : (n.children || []).map(content).join('');
const button = label => view.root.findAllByType('button').find(b => content(b) === label);
const click = label => act(() => button(label).props.onClick());
const open = () => act(() => view.root.findAllByType('button').find(b => content(b).includes('【ポスティング申請】')).props.onClick());

it.each(['approve', 'reject'])('commits %s once through real save, preserves the roster and reloads the decision', async decision => {
  await setup(); const before = structuredClone(gs.teams), request = postingDecisionRequest(gs, 'request', decision), session = gs.getProgressSessionToken();
  let duplicate;
  expect(await run(() => { const p = gs.commitPostingDecisionRequest(request, session); duplicate = gs.commitPostingDecisionRequest(request, session); return p; }))
    .toMatchObject({ ok: true });
  expect(await duplicate).toMatchObject({ ok: false, reason: 'economy_commit_pending' });
  expect(await run(() => gs.commitPostingDecisionRequest(request, session))).toMatchObject({ ok: true, replayed: true });
  const saved = await loadGame(); expect(saved.teams).toEqual(before);
  expect(saved.contractEconomy.engine.postingApplications).toHaveLength(2);
  expect(saved.contractEconomy.incomeReceipts).toHaveLength(0);
  expect(postingApplicationViews(toAnnualState(saved))[0].status).toBe(decision === 'approve' ? 'approved' : 'rejected');
  act(() => gs.setScreen('title'));
  act(() => expect(gs.hydrateSavedWorld(saved, { progressToken: gs.getProgressToken(), sessionToken: gs.getProgressSessionToken() })).toBe(true));
  expect(await run(() => gs.commitPostingDecisionRequest(request, session))).toMatchObject({ ok: false, reason: 'economy_session_conflict' });
});
it('retains the exact confirmation after a failed publication and retries through the real inbox', async () => {
  await setup(postingUiWorld(), true); open(); click('承認内容を確認する');
  const root = rows.get(primary), teams = structuredClone(gs.teams), write = localStorage.setItem;
  localStorage.setItem = (k, v) => { if (k === primary) throw Error('disk full'); write(k, v); };
  await run(() => button('承認を確定する').props.onClick());
  expect(content(view.root)).toContain('判断を保存できませんでした');
  expect(rows.get(primary)).toBe(root); expect(gs.teams).toEqual(teams);
  expect(gs.contractEconomy.engine.postingApplications).toHaveLength(1);
  localStorage.setItem = write;
  for (let i = 0; i < 150 && button('同じ判断で保存を再試行する').props.disabled; i++)
    await act(async () => { await new Promise(r => setTimeout(r, 10)); });
  expect(button('同じ判断で保存を再試行する').props.disabled, JSON.stringify(gs.saveQueueState)).toBe(false);
  await run(() => button('同じ判断で保存を再試行する').props.onClick());
  expect(content(view.root), JSON.stringify(gs.saveResult)).toContain('市場結果待ち'); expect(gs.teams).toEqual(teams);
  expect((await loadGame()).contractEconomy.engine.postingApplications).toHaveLength(2);
});
it('rejects a confirmation made stale by another transaction before publication', async () => {
  await setup(postingUiWorld(), true); open(); click('承認内容を確認する');
  expect(await run(() => gs.commitEconomyCommand(envelope(gs, { id: 'other', type: 'decide-posting', requestId: 'request', decision: 'reject' }))))
    .toMatchObject({ ok: true });
  expect(content(view.root)).toContain('球団拒否');
  expect(button('承認を確定する')).toBeUndefined();
  expect((await loadGame()).contractEconomy.engine.postingApplications.at(-1).decision).toBe('reject');
});
it('disables an open confirmation after an unrelated application changes the revision', async () => {
  await setup(postingUiWorld(), true); open(); click('承認内容を確認する');
  const old = button('承認を確定する').props.onClick, p = gs.teams[0].players[1];
  expect(await run(() => gs.commitEconomyCommand(envelope(gs, { id: 'other-request', type: 'request-posting',
    teamId: gs.myId, playerId: p.id, contractId: p.contractId })))).toMatchObject({ ok: true });
  expect(content(view.root)).toContain('状態が変更されています');
  expect(button('承認を確定する').props.disabled).toBe(true);
  const root = rows.get(primary); await run(old); expect(rows.get(primary)).toBe(root);
  expect(gs.contractEconomy.engine.postingApplications).toHaveLength(2);
});
it('recovers an already published decision in the inbox without another receipt or root write', async () => {
  await setup(postingUiWorld(), true); open(); click('承認内容を確認する');
  const read = localStorage.getItem; let interrupted = false;
  localStorage.getItem = key => {
    if (key === primary && gs.contractEconomy?.revision === 2 && !interrupted) { interrupted = true; throw Error('ack interrupted'); }
    return read(key);
  };
  await run(() => button('承認を確定する').props.onClick());
  expect(content(view.root)).toContain('保存済みの判断を画面へ反映できませんでした');
  localStorage.getItem = read; const root = rows.get(primary);
  await run(() => button('保存済みの判断を復旧する').props.onClick());
  expect(rows.get(primary)).toBe(root); expect(gs.contractEconomy.engine.postingApplications).toHaveLength(2);
  expect(content(view.root)).toContain('市場結果待ち');
  expect((await loadGame()).contractEconomy.engine.transactions).toHaveLength(2);
});
it('uses real opening-roster identities and pairs controlled approval with development rejection', async () => {
  const w = postingUiWorld({ realRoster: true }), development = [...w.teams[0].players, ...w.teams[0].farm].find(isIkuseiPlayer);
  expect(development).toBeDefined();
  expect(reduceEconomyCommand(w, envelope(w, { id: 'invalid', type: 'request-posting', teamId: w.myId,
    playerId: development.id, contractId: development.contractId })).ok).toBe(false);
  await setup(w, true); const playerId = w.contractEconomy.engine.postingApplications[0].playerId;
  expect(w.teams[0].players.find(p => p.id === playerId).realPlayerId).toBeTruthy();
  open(); click('承認内容を確認する'); await run(() => button('承認を確定する').props.onClick());
  const cold = await loadGame(); expect(cold.teams[0].players.some(p => p.id === playerId)).toBe(true);
  expect(cold.contractEconomy.engine.postingApplications.at(-1).decision).toBe('approve');
  expect(cold.contractEconomy.incomeReceipts).toHaveLength(0);
});
