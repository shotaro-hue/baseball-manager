import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { renewalClosingWorld, openRenewalWinter } from '../../engine/__tests__/fixtures/renewalGrowth';
import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import { AnnualContractTab } from './AnnualContractTab';
import { acquisitionFixture } from '../../engine/__tests__/fixtures/acquisitionWorld';
import { reduceAcquisitionRequest, acquisitionRequest } from '../../engine/acquisitionDecisions';
import { renewalFixture } from '../../engine/__tests__/fixtures/renewalWorld';
import { renewalRequest, reduceRenewalRequest } from '../../engine/renewalDecisions';
import HubContentRouter from '../hub/HubContentRouter';
import ContractRenewalRoute from '../screenRoutes/ContractRenewalRoute';
import { DecisionConfirmation } from '../management/DecisionParts';
import { createAnnualNewGameWorld, fromAnnualState, toAnnualState } from '../../engine/contractEconomy';
import { economyPolicy } from '../../engine/__tests__/fixtures/economyWorld';

const text = node => typeof node === 'string' ? node : (node.children || []).map(text).join('');
let view;
afterEach(() => { if (view) act(() => view.unmount()); view = null; });
const state = (world = renewalFixture()) => ({ ...world, myTeam: world.teams[0], saveQueueState: { isSaving: false },
  getMailboxBySelector: () => world.mailbox, getNewsBySelector: () => world.news,
  getUnreadMailboxCount: () => 0, getLatestNewsId: () => null });
function setup(gs, os) { act(() => { view = create(React.createElement(AnnualContractTab, { gs, os })); }); }
const button = label => view.root.findAllByType('button').find(n => text(n) === label);
const click = label => act(() => button(label).props.onClick());
function prepare() {
  act(() => view.root.findByProps({ 'aria-label': 'Aの契約を確認' }).props.onClick());
  act(() => view.root.findByProps({ 'aria-label': '提示年俸（万円）' }).props.onChange({ target: { value: '12000' } }));
  click('提示条件を確認する');
}

it('waits for acknowledged completion and prevents duplicate clicks before showing success', async () => {
  let finish; const pending = new Promise(resolve => { finish = resolve; });
  const onOffer = vi.fn(() => pending);
  setup(state(), { handleContractOffer: onOffer }); prepare();
  let task; act(() => { task = button('この条件で提示する').props.onClick(); });
  expect(text(view.root)).toContain('保存・反映を確認しています');
  expect(text(view.root)).not.toContain('提示を保存しました');
  act(() => button('この条件で提示する').props.onClick()); expect(onOffer).toHaveBeenCalledTimes(1);
  await act(async () => { finish({ ok: true }); await task; });
  expect(text(view.root)).toContain('提示を保存しました');
});

it('retains the draft on failure and offers explicit recovery after publication', async () => {
  const recover = vi.fn(async () => ({ ok: true }));
  setup({ ...state(), recoverEconomyCommand: recover }, { handleContractOffer: async () => ({ ok: false, reason: 'economy_adoption_required' }) });
  prepare(); await act(async () => { await button('この条件で提示する').props.onClick(); });
  expect(text(view.root)).not.toContain('提示を保存しました');
  expect(view.root.findByProps({ 'aria-label': '提示年俸（万円）' }).props.value).toBe('12000');
  expect(button('保存済みの更改を復旧する')).toBeTruthy();
  await act(async () => { await button('保存済みの更改を復旧する').props.onClick(); });
  expect(recover).toHaveBeenCalledTimes(1); expect(text(view.root)).toContain('保存済みの更改を復旧しました');
});

it('reads pending/accepted terms from decisions after display mail removal and hides unsupported release/clauses', () => {
  const w = renewalFixture(), h = reduceRenewalRequest(w, renewalRequest(w, { type: 'offer', playerId: 0, salary: 12000, years: 3 })).world;
  h.mailbox = [];
  setup(state(h), {});
  act(() => view.root.findByProps({ 'aria-label': 'Aの契約を確認' }).props.onClick());
  expect(text(view.root)).toContain('回答待ち'); expect(text(view.root)).toContain('2026-07-18');
  expect(text(view.root)).toContain('2027');
  expect(view.root.findByProps({ 'aria-label': '提示年俸（万円）' }).props.value).toBe('12000');
  expect(view.root.findByProps({ 'aria-label': '契約年数' }).props.value).toBe(3);
  expect(button('自由契約を確定する')).toBeUndefined(); expect(text(view.root)).not.toContain('オプトアウト');
});

it('distinguishes the saved offer from a replacement draft and keeps that draft after failure', async () => {
  const w = renewalFixture(), h = reduceRenewalRequest(w, renewalRequest(w, { type: 'offer', playerId: 0, salary: 12000, years: 3 })).world;
  setup(state(h), { handleContractOffer: async () => ({ ok: false }) });
  act(() => view.root.findByProps({ 'aria-label': 'Aの契約を確認' }).props.onClick());
  act(() => view.root.findByProps({ 'aria-label': '提示年俸（万円）' }).props.onChange({ target: { value: '13000' } }));
  act(() => view.root.findByProps({ 'aria-label': '契約年数' }).props.onChange({ target: { value: '2' } }));
  click('提示条件を確認する');
  const dialog = view.root.findByType(DecisionConfirmation);
  expect(text(dialog)).toContain('保存済みの提示');
  expect(text(dialog)).toContain('1.20億円'); expect(text(dialog)).toContain('3年');
  expect(text(dialog)).toContain('差替後の提示');
  expect(text(dialog)).toContain('1.30億円'); expect(text(dialog)).toContain('2年');
  await act(async () => { await button('この条件で提示する').props.onClick(); });
  expect(view.root.findByProps({ 'aria-label': '提示年俸（万円）' }).props.value).toBe('13000');
  expect(view.root.findByProps({ 'aria-label': '契約年数' }).props.value).toBe(2);
  expect(h.contractEconomy.decisions[0].request.action).toMatchObject({ salary: 12000, years: 3 });
});

it('loads each selected player independently and preserves drafts on an ordinary state update', () => {
  const base = renewalFixture();
  base.teams[0].players.push({ id: 'c', name: 'C', salary: 800, age: 22, contractYearsLeft: 1 });
  const initial = createAnnualNewGameWorld({ teams: base.teams, faPool: [], myId: 0, saveId: 'two-player-save', season: 2026,
    policy: economyPolicy(base.teams), randomRoot: { algorithmVersion: 1, seed: 'test-seed' } });
  initial.schedule = base.schedule; initial.contractEconomy.clock = base.contractEconomy.clock;
  const w = fromAnnualState(initial, toAnnualState(initial));
  const h = reduceRenewalRequest(w, renewalRequest(w, { type: 'offer', playerId: 0, salary: 12000, years: 3 })).world;
  setup(state(h), {});
  act(() => view.root.findByProps({ 'aria-label': 'Aの契約を確認' }).props.onClick());
  act(() => view.root.findByProps({ 'aria-label': '提示年俸（万円）' }).props.onChange({ target: { value: '13000' } }));
  act(() => view.update(React.createElement(AnnualContractTab, { gs: state(h), os: {} })));
  expect(view.root.findByProps({ 'aria-label': '提示年俸（万円）' }).props.value).toBe('13000');
  act(() => view.root.findByProps({ 'aria-label': 'Cの契約を確認' }).props.onClick());
  expect(view.root.findByProps({ 'aria-label': '提示年俸（万円）' }).props.value).toBe('800');
  expect(view.root.findByProps({ 'aria-label': '契約年数' }).props.value).toBe(1);
  act(() => view.root.findByProps({ 'aria-label': 'Aの契約を確認' }).props.onClick());
  expect(view.root.findByProps({ 'aria-label': '提示年俸（万円）' }).props.value).toBe('12000');
  expect(view.root.findByProps({ 'aria-label': '契約年数' }).props.value).toBe(3);
});

it('routes both the management destination and offseason renewal to the annual view', () => {
  const gs = state();
  act(() => { view = create(React.createElement(HubContentRouter, { app: { gs, os: {}, sf: {} }, tab: 'contract' })); });
  expect(view.root.findAllByType(AnnualContractTab)).toHaveLength(1);
  const oldScreen = vi.fn(() => React.createElement('div', null, 'old screen'));
  act(() => view.update(React.createElement(ContractRenewalRoute, { gs: { ...gs, screen: 'contract_renewal_phase' }, os: {}, myTeam: gs.myTeam, myId: 0, year: 2026, ScreenComponent: oldScreen })));
  expect(view.root.findAllByType(AnnualContractTab)).toHaveLength(1); expect(oldScreen).not.toHaveBeenCalled();
});

it('explains the growth prerequisite, blocks fresh confirmation and links to the year-end screen',()=>{
 const w=openRenewalWinter(),setScreen=vi.fn();setup({...state(w),setScreen},{});
 act(()=>view.root.findByProps({'aria-label':'Playerの契約を確認'}).props.onClick());
 expect(button('提示条件を確認する').props.disabled).toBe(true);
 expect(text(view.root)).toContain('年度末成長');
 click('年度末成長の保存へ');expect(setScreen).toHaveBeenCalledWith('retire_phase');
});

it('keeps cancellation and due replies enabled for old pending offers while blocking replacement',async()=>{
 const w=JSON.parse(gunzipSync(readFileSync(new URL('../../engine/__tests__/fixtures/renewalBeforeGrowthPending.json.gz',import.meta.url))));
 const cancel=vi.fn(async proposalId=>reduceRenewalRequest(w,renewalRequest(w,{type:'cancel',proposalId})));
 setup({...state(w),setScreen:vi.fn()},{handleCancelRenewal:cancel});
 act(()=>view.root.findByProps({'aria-label':'Playerの契約を確認'}).props.onClick());
 expect(button('提示条件を確認する').props.disabled).toBe(true);
 expect(view.root.findAllByType('fieldset')[0].props.disabled).toBe(false);
 click('提示を取り消す');await act(async()=>{await button('取消を確定する').props.onClick();});
 expect(cancel).toHaveBeenCalledWith(w.contractEconomy.decisions[0].proposalId);expect(text(view.root)).toContain('提示を取り消しました');
 const due=structuredClone(w);due.contractEconomy.clock.offseasonTurn=2;
 const resolve=vi.fn(async()=>reduceRenewalRequest(due,renewalRequest(due,{type:'resolve-due'})));
 act(()=>view.update(React.createElement(AnnualContractTab,{gs:state(due),os:{handleResolveRenewals:resolve}})));
 expect(button('届いた回答を確認する').props.disabled).toBe(false);
 await act(async()=>{await button('届いた回答を確認する').props.onClick();});expect(resolve).toHaveBeenCalledTimes(1);
});
it('prevents a confirmation opened before native opening from submitting after the prerequisite changes',()=>{
 const closing=renewalClosingWorld(),offer=vi.fn();setup(state(closing),{handleContractOffer:offer});
 act(()=>view.root.findByProps({'aria-label':'Playerの契約を確認'}).props.onClick());click('提示条件を確認する');
 const opened=openRenewalWinter(closing);
 act(()=>view.update(React.createElement(AnnualContractTab,{gs:state(opened),os:{handleContractOffer:offer}})));
 expect(button('この条件で提示する').props.disabled).toBe(true);
 click('この条件で提示する');expect(offer).not.toHaveBeenCalled();
});

it('keeps the existing invalid-data stop message when the annual cycle is absent',()=>{
 const gs=state();delete gs.contractEconomy.cycle;
 expect(()=>setup(gs,{})).not.toThrow();expect(text(view.root)).toContain('更改操作を停止しています');
});

it('shows offseason clock and pending schedules, saves a single turn, and stops at37',async()=>{
 const w=renewalFixture({phase:'offseason',date:'2026-12-01'});
 const offered=reduceRenewalRequest(w,renewalRequest(w,{type:'offer',playerId:0,salary:12000,years:1})).world;
 const advance=vi.fn(async()=>({ok:true}));setup(state(offered),{handleAdvanceOffseasonTurn:advance});
 expect(text(view.root)).toContain('オフ第0ターン');expect(text(view.root)).toContain('更改・獲得の回答待ち：1件');
 expect(text(view.root)).toContain(`第${offered.contractEconomy.decisions[0].dueTurn}ターン`);
 await act(async()=>{await button('オフシーズンを1ターン進める').props.onClick();});expect(advance).toHaveBeenCalledTimes(1);
 const last=structuredClone(offered);last.contractEconomy.clock.offseasonTurn=37;
 act(()=>view.update(React.createElement(AnnualContractTab,{gs:state(last),os:{handleAdvanceOffseasonTurn:advance}})));
 expect(button('オフシーズンを1ターン進める').props.disabled).toBe(true);expect(text(view.root)).toContain('最終回答ターン');
});

it('resolves overdue acquisition-only promises from an old beyond-deadline contract screen',async()=>{
 const w=acquisitionFixture({phase:'offseason',date:'2026-12-01'});
 const pending=reduceAcquisitionRequest(w,acquisitionRequest(w,{type:'offer',playerId:'free',salary:12000,years:1})).world;
 pending.contractEconomy.clock.offseasonTurn=38;
 const resolve=vi.fn(async()=>({ok:true}));setup(state(pending),{handleResolveRenewals:resolve});
 expect(text(view.root)).toContain('現在回答期日に到達');expect(button('届いた回答を確認する')).toBeTruthy();
 await act(async()=>{await button('届いた回答を確認する').props.onClick();});expect(resolve).toHaveBeenCalledTimes(1);
});

it('blocks native empty turns before growth and keeps the growth route available',()=>{
 const w=openRenewalWinter(),setScreen=vi.fn();setup({...state(w),setScreen},{});
 expect(button('オフシーズンを1ターン進める').props.disabled).toBe(true);
 expect(text(view.root)).toContain('年度末成長・要求年俸を保存');
 expect(button('年度末成長の保存へ').props.disabled).toBe(false);
 click('年度末成長の保存へ');expect(setScreen).toHaveBeenCalledWith('retire_phase');
});
it('allows authentic pending rescue and disables further turns as soon as the saved answer resolves',async()=>{
 let w=JSON.parse(gunzipSync(readFileSync(new URL('../../engine/__tests__/fixtures/renewalBeforeGrowthPending.json.gz',import.meta.url))));
 const { advanceOffseasonTurn,offseasonTurnRequest }=await import('../../engine/economyDecisions');
 const os={handleAdvanceOffseasonTurn:async()=>{const r=advanceOffseasonTurn(w,offseasonTurnRequest(w));expect(r.ok,r.error).toBe(true);w=r.world;return r;}};
 setup({...state(w),setScreen:vi.fn()},os);
 expect(button('オフシーズンを1ターン進める').props.disabled).toBe(false);expect(text(view.root)).toContain('回答待ちがなくなったら');
 for(let i=0;i<2;i++){
  await act(async()=>{await button('オフシーズンを1ターン進める').props.onClick();});
  act(()=>view.update(React.createElement(AnnualContractTab,{gs:state(w),os})));
 }
 expect(w.contractEconomy.decisions[0].status).toBe('accepted');expect(button('オフシーズンを1ターン進める').props.disabled).toBe(true);
});
