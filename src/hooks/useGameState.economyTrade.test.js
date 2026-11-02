import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { useGameState } from './useGameState';
import { saveGame, loadGame, getSaveQueueSnapshot } from '../engine/saveload';
import { quoteAnnualSpendingPlan } from '../engine/annualSpending';
import { fromAnnualState, toAnnualState } from '../engine/contractEconomy';
import { tradeFixture } from '../engine/__tests__/fixtures/tradeWorld';
import { tradeRequest } from '../engine/humanTrade';
import { useOffseason } from './useOffseason';
import { TradeTab } from '../components/tabs/TradeTab';
import { renewalEnvelope } from '../engine/__tests__/fixtures/economyWorld';
vi.mock('../engine/trade', async original => ({ ...await original(), evalTradeForCpu: vi.fn(() => ({ favorable: true, reasons: [] })) }));
import { evalTradeForCpu } from '../engine/trade';

let gs, os, view, storage;
const primary = 'baseball_manager_v1';
beforeEach(() => {
  storage = new Map();
  vi.stubGlobal('localStorage', { getItem: k => storage.get(k) ?? null,
    setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) });
  vi.stubGlobal('indexedDB', new IDBFactory()); vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  for (const level of ['log', 'warn', 'error', 'table']) vi.spyOn(console, level).mockImplementation(() => {});
});
afterEach(async () => {
  if (view) act(() => view.unmount()); view = null;
  for (let i = 0; i < 150 && getSaveQueueSnapshot().isSaving; i++) await new Promise(r => setTimeout(r, 10));
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});
async function setup(world = tradeFixture(), panel = false) {
  expect((await saveGame(world, { skipCompression: true })).ok).toBe(true);
  function Harness() {
    gs = useGameState();
    os = useOffseason(gs);
    return panel && gs.myTeam ? React.createElement(TradeTab, { myTeam: gs.myTeam, teams: gs.teams,
      annualGs: gs, onTrade: os.handleTrade, offerMails: gs.mailbox.filter(m => m.type === 'trade') }) : null;
  }
  await act(async () => { view = create(React.createElement(Harness)); });
  act(() => expect(gs.hydrateSavedWorld(world, { progressToken: gs.getProgressToken(), sessionToken: gs.getProgressSessionToken() })).toBe(true));
  act(() => gs.setScreen('hub'));
}
async function run(operation) {
  let result, done = false, task;
  act(() => { task = Promise.resolve(operation()).then(r => { done = true; result = r; }); });
  for (let i = 0; i < 150 && !done; i++) await act(async () => { await new Promise(r => setTimeout(r, 10)); });
  await task; await act(async () => {}); return result;
}

const action = { toId: 1, outgoingIds: [0], incomingIds: ['b'], cashManYen: 500 };
const content = n => n == null ? '' : typeof n === 'object' ? (Array.isArray(n) ? n : n.children || []).map(content).join('') : String(n);
const button = label => view.root.findAllByType('button').find(b => content(b) === label);
const click = label => act(() => button(label).props.onClick());
const confirmation = () => content(view.root.findByProps({ 'aria-label': 'トレード条件の最終確認' }));
function openTrade(cashManYen = 500) {
  click('相手球団と交渉する');
  act(() => view.root.findByProps({ 'aria-label': '放出選手を放出候補に選ぶ' }).props.onChange({ target: { checked: true } }));
  click('獲得候補を選ぶ');
  act(() => view.root.findByProps({ 'aria-label': '獲得選手を獲得候補に選ぶ' }).props.onChange({ target: { checked: true } }));
  act(() => view.root.findByProps({ 'aria-label': '支払金額（万円）' }).props.onChange({ target: { value: String(cashManYen) } }));
  click('トレードを提案する');
}
it('commits once, rejects double clicks and replays exactly after adoption', async () => {
  await setup(); const r = tradeRequest(gs, action), session = gs.getProgressSessionToken(); let duplicate;
  expect(await run(() => { const p = gs.commitTradeRequest(r, session); duplicate = gs.commitTradeRequest(r, session); return p; })).toMatchObject({ ok: true });
  expect(await duplicate).toMatchObject({ ok: false, reason: 'economy_commit_pending' });
  expect(await run(() => gs.commitTradeRequest(r, session))).toMatchObject({ ok: true, replayed: true });
  const saved = await loadGame();
  expect(saved.contractEconomy.engine.transactions).toHaveLength(1);
  expect(saved.contractEconomy.engine.spending.oneOffCosts.map(c => c.amountManYen)).toEqual([500, -500]);
  expect(saved.seasonHistory.transfers).toHaveLength(1); expect(saved.news).toHaveLength(1);
  act(() => gs.setScreen('title'));
  act(() => expect(gs.hydrateSavedWorld(saved, { progressToken: gs.getProgressToken(), sessionToken: gs.getProgressSessionToken() })).toBe(true));
  expect(await run(() => gs.commitTradeRequest(r, session))).toMatchObject({ ok: false, reason: 'economy_session_conflict' });
});
it.each([500, 0])('retains accepted terms after a failed save and retries without another negotiation roll (cash=%s)', async cashManYen => {
  await setup(tradeFixture(), true); openTrade(cashManYen);
  expect(confirmation()).toContain('5,484万円'); expect(confirmation()).toContain('4,516万円');
  const root = storage.get(primary), before = structuredClone(gs.teams), economy = structuredClone(gs.contractEconomy), write = localStorage.setItem;
  localStorage.setItem = (k, v) => { if (k === primary) throw Error('quota'); write(k, v); };
  const confirm = button('確認して提案する').props.onClick; evalTradeForCpu.mockClear();
  await run(() => { confirm(); confirm(); });
  for (let i = 0; i < 150 && !content(view.root).includes('保存できませんでした'); i++) await act(async () => { await new Promise(r => setTimeout(r, 10)); });
  expect(content(view.root)).toContain('保存できませんでした');
  expect(storage.get(primary)).toBe(root); expect(gs.teams).toEqual(before); expect(gs.contractEconomy).toEqual(economy);
  expect(evalTradeForCpu).toHaveBeenCalledOnce();
  localStorage.setItem = write; await run(() => button('同じ条件で保存を再試行する').props.onClick());
  for (let i = 0; i < 150 && !content(view.root).includes('トレード成立！'); i++) await act(async () => { await new Promise(r => setTimeout(r, 10)); });
  expect(content(view.root)).toContain('トレード成立！'); expect(evalTradeForCpu).toHaveBeenCalledOnce();
  expect((await loadGame()).contractEconomy.engine.transactions).toHaveLength(1);
  expect(gs.seasonHistory.transfers).toHaveLength(1);
});
it('rejects an open confirmation after another contract and requires a fresh review', async () => {
  const w = tradeFixture(); await setup(w, true); openTrade(); const confirm = button('確認して提案する').props.onClick;
  expect(await run(() => gs.commitEconomyCommand(renewalEnvelope(w)))).toMatchObject({ ok: true });
  const root = storage.get(primary), before = structuredClone(gs.contractEconomy);
  expect(confirmation()).toContain('状態が変更'); expect(button('確認して提案する').props.disabled).toBe(true);
  await run(confirm); expect(storage.get(primary)).toBe(root); expect(gs.contractEconomy).toEqual(before);
  expect(gs.teams[0].players[0].id).toBe(0);
});
it('recovers a published trade without new cash, roster or history writes', async () => {
  await setup(); const r = tradeRequest(gs, action), read = localStorage.getItem; let interrupted = false;
  localStorage.getItem = key => { if (key === primary && gs.contractEconomy?.revision === 1 && !interrupted) { interrupted = true; throw Error('ack'); } return read(key); };
  expect(await run(() => gs.commitTradeRequest(r, gs.getProgressSessionToken()))).toMatchObject({ ok: false, reason: 'economy_adoption_required' });
  localStorage.getItem = read; const root = storage.get(primary);
  expect(await run(() => gs.recoverEconomyCommand())).toMatchObject({ ok: true });
  expect(storage.get(primary)).toBe(root); expect(gs.contractEconomy.engine.transactions).toHaveLength(1);
  expect((await loadGame()).seasonHistory.transfers).toHaveLength(1);
});
it('rejects legacy and retained legacy trade callbacks in an annual session', async () => {
  const legacy = tradeFixture(); delete legacy.contractEconomy;
  await setup(legacy); const callback = os.handleTrade;
  act(() => gs.setScreen('title')); const w = tradeFixture();
  act(() => expect(gs.hydrateSavedWorld(w, { progressToken: gs.getProgressToken(), sessionToken: gs.getProgressSessionToken() })).toBe(true));
  const before = structuredClone(gs.teams);
  expect(await run(() => callback([before[0].players[0]], [before[1].players[0]], before[1], 500))).toBe(false);
  expect(await run(() => os.handleTrade([before[0].players[0]], [before[1].players[0]], before[1], 500))).toBe(false);
  expect(gs.teams).toEqual(before);
});
it.each(['salary', 'deadline', 'capacity', 'epoch', 'session'])('rejects the open trade after %s hydration with the same revision', async change => {
  await setup(tradeFixture(), true); openTrade(); const confirm = button('確認して提案する').props.onClick;
  let changed = tradeFixture(change === 'capacity' ? { count: 70 } : change === 'deadline' ? { date: '2026-08-01' } : change === 'salary' ? { salary: 12000 } : {});
  if (change === 'epoch') changed.contractEconomy.epoch = 'next-epoch';
  act(() => gs.setScreen('title'));
  act(() => expect(gs.hydrateSavedWorld(changed, { progressToken: gs.getProgressToken(), sessionToken: gs.getProgressSessionToken() })).toBe(true));
  const root = storage.get(primary), before = structuredClone(gs.contractEconomy);
  expect(confirmation()).toContain('変更されています'); expect(button('確認して提案する').props.disabled).toBe(true);
  await run(confirm); expect(storage.get(primary)).toBe(root); expect(gs.contractEconomy).toEqual(before);
});
it.each([false, true])('saves a received mail decision atomically (decline=%s)', async decline => {
  const w = tradeFixture({ date: decline ? '2026-08-01' : '2026-07-16' });
  w.mailbox = [{ id: 'offer', type: 'trade', title: '受信した提案', offer: {
    from: w.teams[1], want: [w.teams[0].players[0]], offer: [w.teams[1].players[0]], cash: 5000000 } }];
  await setup(w, true); click('受信した提案'); click(decline ? '辞退内容を確認する' : '承諾内容を確認する');
  await run(() => button(decline ? '辞退を確定する' : '承諾を確定する').props.onClick());
  for (let i = 0; i < 150 && !gs.mailbox[0].resolved; i++) await act(async () => { await new Promise(r => setTimeout(r, 10)); });
  const saved = await loadGame(); expect(saved.mailbox[0]).toMatchObject({ resolved: true, read: true });
  expect(saved.teams[0].players[0].id).toBe(decline ? 0 : 'b');
  expect(saved.contractEconomy.engine.transactions).toHaveLength(1);
});

async function unreadDuringCooldown(panel = false) {
  const w = tradeFixture();
  w.mailbox = ['first', 'offer'].map(id => ({ id, type: 'trade', read: false, offer: {
    from: w.teams[1], want: [w.teams[0].players[0]], offer: [w.teams[1].players[0]], cash: 5000000 } }));
  await setup(w, panel);
  act(() => os.handleMailRead('first'));
  for (let i = 0; i < 150 && (gs.saveDirty || gs.saveQueueState.isSaving); i++) await act(async () => { await new Promise(r => setTimeout(r, 10)); });
  expect((await loadGame()).contractEconomy.revision).toBe(1);
  act(() => os.handleMailRead('offer'));
  await act(async () => {});
  expect(gs.contractEconomy.revision).toBe(2);
  expect((await loadGame()).contractEconomy.revision).toBe(1);
  expect(gs.saveDirty).toBe(true);
}

it.each([false, true])('flushes unread mail changes during autosave cooldown before a decision (decline=%s)', async decline => {
  await unreadDuringCooldown();
  const request = tradeRequest(gs, { ...action, mailId: 'offer', cashManYen: -500, ...(decline ? { decline: true } : {}) });
  const session = gs.getProgressSessionToken(); let duplicate;
  expect(await run(() => {
    const pending = gs.commitTradeRequest(request, session);
    duplicate = gs.commitTradeRequest(request, session);
    expect(gs.setSaveId('other-session')).toBe(false);
    return pending;
  })).toMatchObject({ ok: true });
  expect(await duplicate).toMatchObject({ ok: false, reason: 'economy_commit_pending' });
  expect(await run(() => gs.commitTradeRequest(request, session))).toMatchObject({ ok: true, replayed: true });
  const saved = await loadGame();
  expect(saved.mailbox[1]).toMatchObject({ read: true, resolved: true });
  expect(saved.contractEconomy.revision).toBe(3);
  expect(saved.contractEconomy.engine.transactions).toHaveLength(1);
  expect(saved.teams[0].players[0].id).toBe(decline ? 0 : 'b');
  expect(gs.saveDirty).toBe(false);
});

it('retries a failed dirty-base save without rerolling the accepted proposal', async () => {
  await unreadDuringCooldown(true); openTrade();
  const root = storage.get(primary), before = structuredClone(gs.contractEconomy), write = localStorage.setItem;
  localStorage.setItem = (k, v) => { if (k === primary) throw Error('quota'); write(k, v); };
  evalTradeForCpu.mockClear();
  await run(() => button('確認して提案する').props.onClick());
  for (let i = 0; i < 150 && !content(view.root).includes('保存できませんでした'); i++) await act(async () => { await new Promise(r => setTimeout(r, 10)); });
  expect(content(view.root)).toContain('保存できませんでした');
  expect(storage.get(primary)).toBe(root); expect(gs.contractEconomy).toEqual(before); expect(gs.saveDirty).toBe(true);
  expect(evalTradeForCpu).toHaveBeenCalledOnce();
  localStorage.setItem = write;
  await run(() => button('同じ条件で保存を再試行する').props.onClick());
  for (let i = 0; i < 150 && !content(view.root).includes('トレード成立！'); i++) await act(async () => { await new Promise(r => setTimeout(r, 10)); });
  expect(content(view.root)).toContain('トレード成立！'); expect(evalTradeForCpu).toHaveBeenCalledOnce();
  const saved = await loadGame();
  expect(saved.contractEconomy.engine.transactions).toHaveLength(1);
  expect(saved.seasonHistory.transfers).toHaveLength(1);
});

it('does not overwrite a foreign root while flushing the dirty trade base', async () => {
  await unreadDuringCooldown(); const request = tradeRequest(gs, action);
  const foreign = `${storage.get(primary)} `; storage.set(primary, foreign);
  expect(await run(() => gs.commitTradeRequest(request, gs.getProgressSessionToken()))).toMatchObject({ ok: false, reason: 'save_conflict' });
  expect(storage.get(primary)).toBe(foreign); expect(gs.saveDirty).toBe(true);
  expect(gs.contractEconomy.engine.transactions).toHaveLength(0);
});

it.each(['session', 'revision'])('rejects a stale %s before writing the dirty trade base', async stale => {
  await unreadDuringCooldown(); const request = tradeRequest(gs, action), root = storage.get(primary);
  if (stale === 'revision') request.baseRevision--;
  expect(await run(() => gs.commitTradeRequest(request, gs.getProgressSessionToken() - (stale === 'session' ? 1 : 0))))
    .toMatchObject({ ok: false, reason: stale === 'session' ? 'economy_session_conflict' : 'economy_command_invalid' });
  expect(storage.get(primary)).toBe(root); expect(gs.saveDirty).toBe(true);
});

