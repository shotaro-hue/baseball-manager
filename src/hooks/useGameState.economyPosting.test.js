import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { useGameState } from './useGameState';
import { useOffseason } from './useOffseason';
import HubContentRouter from '../components/hub/HubContentRouter';
import { saveGame, loadGame, getSaveQueueSnapshot } from '../engine/saveload';
import { postingDecisionRequest, postingMarketRequest, postingGenerationRequest, offseasonPostingRequest } from '../engine/humanPosting';
import { requestGenerationWorld } from '../engine/__tests__/fixtures/postingRequestGeneration';
import { offseasonPostingWorld } from '../engine/__tests__/fixtures/offseasonPosting';
import { generatedPostingWorld } from '../engine/__tests__/fixtures/postingMarketResults';
import { postingUiWorld } from '../engine/__tests__/fixtures/postingUi';
import { postingApplicationViews } from '../engine/annualPostingApplications';
import { reduceEconomyCommand, toAnnualState } from '../engine/contractEconomy';
import { envelope } from '../engine/__tests__/fixtures/faDeclarations';
import { isIkuseiPlayer } from '../engine/rosterCapacity';

let gs, os, view, rows;
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
async function setup(w = postingUiWorld(), panel = false, screen = 'hub') {
  expect((await saveGame(w, { skipCompression: true })).ok).toBe(true);
  w = await loadGame();
  function Harness() {
    gs = useGameState(); os = useOffseason(gs);
    return panel && gs.myTeam ? React.createElement(HubContentRouter, { app: { gs, os, sf: {} }, tab: 'mailbox', onOpen: vi.fn() }) : null;
  }
  await act(async () => { view = create(React.createElement(Harness)); });
  act(() => { expect(gs.hydrateSavedWorld(w, { progressToken: gs.getProgressToken(), sessionToken: gs.getProgressSessionToken() })).toBe(true); gs.setScreen(screen); });
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

it('generates annual wishes through the inbox, saves them once, then uses the existing GM decision and market path', async () => {
  await setup(requestGenerationWorld(), true);
  click('海外挑戦の希望を確認する');
  await run(() => button('希望を確認して保存する').props.onClick());
  const cold = await loadGame(), requests = postingApplicationViews(toAnnualState(cold));
  expect(requests.length).toBeGreaterThan(0);
  expect(content(view.root)).toContain('希望確認済み');
  expect(button('海外挑戦の希望を確認する')).toBeUndefined();
  const requestId = requests[0].id;
  expect(await run(() => gs.commitPostingDecisionRequest(postingDecisionRequest(gs, requestId, 'approve'), gs.getProgressSessionToken()))).toMatchObject({ ok: true });
  expect(await run(() => gs.commitPostingMarketRequest(postingMarketRequest(gs, requestId), gs.getProgressSessionToken()))).toMatchObject({ ok: true });
  expect((await loadGame()).contractEconomy.engine.postingMarketResults.filter(r => r.teamId === 0)).toHaveLength(1);
  expect(requests.filter(r => r.teamId === 1).every(r => !['pending', 'approved'].includes(r.status))).toBe(true);
});
it('keeps generation confirmation on write failure and retries the same wishes', async () => {
  await setup(requestGenerationWorld(), true); click('海外挑戦の希望を確認する');
  const root = rows.get(primary), before = structuredClone(gs.contractEconomy), write = localStorage.setItem;
  localStorage.setItem = (k, v) => { if (k === primary) throw Error('full'); write(k, v); };
  await run(() => button('希望を確認して保存する').props.onClick());
  expect(content(view.root)).toContain('希望を保存できませんでした');
  expect(rows.get(primary)).toBe(root); expect(gs.contractEconomy).toEqual(before);
  localStorage.setItem = write;
  for (let i = 0; i < 150 && button('同じ希望判定で保存を再試行する').props.disabled; i++)
    await act(async () => { await new Promise(r => setTimeout(r, 10)); });
  await run(() => button('同じ希望判定で保存を再試行する').props.onClick());
  expect(content(view.root)).toContain('希望確認済み');
  expect((await loadGame()).contractEconomy.engine.transactions.filter(t => t.generatedPostingRequests)).toHaveLength(2);
});
it('saves an empty wish check and rejects old sessions without starting another batch', async () => {
  await setup(requestGenerationWorld({ interested: false }), true);
  const request = postingGenerationRequest(gs), session = gs.getProgressSessionToken();
  expect(await run(() => gs.commitPostingGenerationRequest(request, session))).toMatchObject({ ok: true });
  expect(content(view.root)).toContain('希望者 0人');
  expect(await run(() => gs.commitPostingGenerationRequest(request, session))).toMatchObject({ ok: true, replayed: true });
  expect(await run(() => gs.commitPostingGenerationRequest(request, session + 1))).toMatchObject({ ok: false, reason: 'economy_session_conflict' });
  expect((await loadGame()).contractEconomy.engine.transactions).toHaveLength(3);
});

it.each(['signed', 'no-offer', 'declined'])('generates %s once through the human save path and replays after cold load', async outcome => {
  await setup(generatedPostingWorld(outcome));
  const before = structuredClone(gs.teams), revision = gs.contractEconomy.revision;
  const request = postingMarketRequest(gs, 'request'), session = gs.getProgressSessionToken();
  let duplicate;
  expect(await run(() => { const p = gs.commitPostingMarketRequest(request, session); duplicate = gs.commitPostingMarketRequest(request, session); return p; })).toMatchObject({ ok: true });
  expect(await duplicate).toMatchObject({ ok: false, reason: 'economy_commit_pending' });
  expect(gs.contractEconomy.revision).toBe(revision + 1);
  const cold = await loadGame(), e = cold.contractEconomy;
  expect(e.engine.postingMarketResults).toHaveLength(1); expect(e.engine.postingMarketResults[0].outcome).toBe(outcome);
  expect(e.engine.postingQualifications).toHaveLength(1);
  expect(e.incomeReceipts).toHaveLength(outcome === 'signed' ? 1 : 0);
  if (outcome !== 'signed') expect(cold.teams).toEqual(before);
  expect(await run(() => gs.commitPostingMarketRequest(request, session))).toMatchObject({ ok: true, replayed: true });
  expect((await loadGame()).contractEconomy).toEqual(e);
});
it('retains market confirmation on failed publication and retries one identical generated result in the inbox', async () => {
  await setup(generatedPostingWorld(), true); open(); click('海外交渉の結果を確認する');
  const root = rows.get(primary), before = structuredClone(gs.teams), write = localStorage.setItem;
  localStorage.setItem = (k, v) => { if (k === primary) throw Error('disk full'); write(k, v); };
  await run(() => button('海外交渉を進めて保存する').props.onClick());
  expect(content(view.root)).toContain('交渉結果を保存できませんでした');
  expect(rows.get(primary)).toBe(root); expect(gs.teams).toEqual(before);
  expect(gs.contractEconomy.engine.postingMarketResults ?? []).toHaveLength(0);
  localStorage.setItem = write;
  for (let i = 0; i < 150 && button('同じ交渉で保存を再試行する').props.disabled; i++)
    await act(async () => { await new Promise(r => setTimeout(r, 10)); });
  await run(() => button('同じ交渉で保存を再試行する').props.onClick());
  expect(content(view.root)).toContain('海外契約成立');
  expect(content(view.root)).toContain('市場評価'); expect((await loadGame()).contractEconomy.incomeReceipts).toHaveLength(1);
});
it('recovers a published market result in the inbox without another receipt or root write', async () => {
  await setup(generatedPostingWorld(), true); open(); click('海外交渉の結果を確認する');
  const revision = gs.contractEconomy.revision, read = localStorage.getItem; let interrupted = false;
  localStorage.getItem = key => {
    if (key === primary && gs.contractEconomy?.revision === revision + 1 && !interrupted) { interrupted = true; throw Error('ack interrupted'); }
    return read(key);
  };
  await run(() => button('海外交渉を進めて保存する').props.onClick());
  expect(button('保存済みの交渉結果を復旧する')).toBeDefined();
  localStorage.getItem = read; const root = rows.get(primary);
  await run(() => button('保存済みの交渉結果を復旧する').props.onClick());
  expect(rows.get(primary)).toBe(root); expect(gs.contractEconomy.incomeReceipts).toHaveLength(1);
  expect((await loadGame()).contractEconomy.engine.postingMarketResults).toHaveLength(1);
  expect(content(view.root)).toContain('海外契約成立');
});

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

it('annual retirement entry saves the CPU posting phase but blocks unfinished year processing with an actionable reason', async () => {
  await setup(requestGenerationWorld());
  const beforeYear = gs.year, original = structuredClone(gs.teams[0]);
  expect(await run(() => os.handleRetirePhaseNext({}))).toBe(false);
  const cold = await loadGame(), views = postingApplicationViews(toAnnualState(cold));
  expect(cold.contractEconomy.engine.transactions.some(t => t.annualPostingPhase)).toBe(true);
  expect(views.filter(r => r.teamId !== cold.myId).every(r => !['pending', 'approved'].includes(r.status))).toBe(true);
  expect(views.filter(r => r.teamId === cold.myId).every(r => r.status === 'pending')).toBe(true);
  expect(gs.year).toBe(beforeYear); expect(gs.myTeam.players.map(p => p.stats)).toEqual(original.players.map(p => p.stats));
  expect(gs.notif.msg).toContain('受信箱');
  expect(gs.notif.msg).toContain('未接続');
  const old = os.handleRetirePhaseNext, root = rows.get(primary);
  act(() => gs.setScreen('title'));
  act(() => expect(gs.hydrateSavedWorld(cold, { progressToken: gs.getProgressToken(), sessionToken: gs.getProgressSessionToken() })).toBe(true));
  expect(await run(() => old({}))).toBe(false); expect(rows.get(primary)).toBe(root);
});
it('annual entry publishes reserved retirements, career details and CPU posting in one durable root', async () => {
  await setup(offseasonPostingWorld(), false, 'retire_phase');
  expect(gs.saveDirty).toBe(false);
  const revision = gs.contractEconomy.revision, write = localStorage.setItem;
  let publications = 0;
  localStorage.setItem = (k, v) => { if (k === primary) publications++; write(k, v); };
  expect(await run(() => os.handleRetirePhaseNext({}))).toBe(false);
  const cold = await loadGame(), e = cold.contractEconomy.engine;
  expect(e.retirementReservations.every(r => r.finalization)).toBe(true);
  expect(publications).toBe(1); expect(cold.contractEconomy.revision).toBe(revision + 1);
  for (const r of e.retirementReservations) {
    const { loadPlayerCareerLogById } = await import('../engine/saveload');
    expect((await loadPlayerCareerLogById(String(r.playerId), cold.saveId)).filter(e => e.year === 2026)).toHaveLength(1);
  }
  const root = rows.get(primary);
  expect(await run(() => os.handleRetirePhaseNext({}))).toBe(false); expect(rows.get(primary)).toBe(root);
  expect(await run(() => os.handleNextYear())).toBe(false); expect(gs.year).toBe(2026);
});
it('guides inbox users to saved retirement reservations before permitting a new wish check', async () => {
  await setup(offseasonPostingWorld(), true);
  expect(content(view.root)).toContain('希望確認の前に引退予約の確定が必要です');
  expect(button('海外挑戦の希望を確認する')).toBeUndefined();
  click('引退予約の確認へ'); expect(gs.screen).toBe('retire_phase');
  expect(gs.contractEconomy.engine.retirementReservations.every(r => !r.finalization)).toBe(true);
  expect(gs.contractEconomy.engine.transactions.some(t => t.annualPostingPhase)).toBe(false);
});
it('keeps both retirement career and posting unpublished after failure, and retries the same candidate', async () => {
  await setup(offseasonPostingWorld(), false, 'retire_phase');
  const before = structuredClone(gs.contractEconomy), root = rows.get(primary), request = offseasonPostingRequest(gs);
  const session = gs.getProgressSessionToken(), write = localStorage.setItem;
  localStorage.setItem = (k, v) => { if (k === primary) throw Error('disk full'); write(k, v); };
  expect(await run(() => gs.commitOffseasonPostingRequest(request, session))).toMatchObject({ ok: false });
  expect(rows.get(primary)).toBe(root); expect(gs.contractEconomy).toEqual(before);
  const { loadPlayerCareerLogById } = await import('../engine/saveload');
  for (const r of before.engine.retirementReservations)
    expect(await loadPlayerCareerLogById(String(r.playerId), gs.saveId)).toEqual([]);
  localStorage.setItem = write;
  expect(await run(() => gs.commitOffseasonPostingRequest(request, session))).toMatchObject({ ok: true });
  const cold = await loadGame(); expect(cold.contractEconomy.engine.retirementReservations.every(r => r.finalization)).toBe(true);
  const published = rows.get(primary);
  expect(await run(() => gs.commitOffseasonPostingRequest(request, session))).toMatchObject({ ok: true, replayed: true });
  expect(rows.get(primary)).toBe(published);
});
it('holds the retirement/posting barrier and rejects old sessions, duplicate preparation and unmount', async () => {
  await setup(offseasonPostingWorld(), false, 'retire_phase');
  const request = offseasonPostingRequest(gs), session = gs.getProgressSessionToken(), root = rows.get(primary);
  expect(await gs.commitOffseasonPostingRequest(request, session + 1)).toMatchObject({ ok: false, reason: 'economy_session_conflict' });
  let task, duplicate;
  act(() => {
    task = gs.commitOffseasonPostingRequest(request, session);
    duplicate = gs.commitOffseasonPostingRequest(request, session);
    expect(gs.setTeams([])).toBe(false); expect(gs.setSaveId('other')).toBe(false);
  });
  expect(await duplicate).toMatchObject({ ok: false, reason: 'economy_commit_pending' });
  act(() => view.unmount()); view = null;
  expect(await task).toMatchObject({ ok: false, reason: 'economy_session_conflict' });
  expect(rows.get(primary)).toBe(root);
});
it('holds the common mutation barrier while the annual posting candidate yields, including duplicate calls', async () => {
  await setup(requestGenerationWorld()); const before = structuredClone(gs.teams), request = postingGenerationRequest(gs), session = gs.getProgressSessionToken();
  let task, duplicate;
  act(() => {
    task = gs.commitPostingGenerationRequest(request, session);
    duplicate = gs.commitPostingGenerationRequest(request, session);
    expect(gs.setTeams([])).toBe(false);
    expect(gs.setSaveId('other-save')).toBe(false);
    expect(gs.hydrateSavedWorld(requestGenerationWorld(), { progressToken: gs.getProgressToken(), sessionToken: session })).toBe(false);
  });
  expect(await duplicate).toMatchObject({ ok: false, reason: 'economy_commit_pending' });
  expect(gs.teams).toEqual(before);
  expect(await run(() => task)).toMatchObject({ ok: true });
  expect((await loadGame()).contractEconomy.engine.transactions.at(-1).annualPostingPhase).toBeDefined();
});
it('does not publish a yielded candidate after the hook unmounts', async () => {
  await setup(requestGenerationWorld()); const root = rows.get(primary), request = postingGenerationRequest(gs), session = gs.getProgressSessionToken();
  let task;
  act(() => { task = gs.commitPostingGenerationRequest(request, session); });
  act(() => view.unmount()); view = null;
  expect(await task).toMatchObject({ ok: false, reason: 'economy_session_conflict' });
  expect(rows.get(primary)).toBe(root);
});
