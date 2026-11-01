import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import { AnnualContractTab } from './AnnualContractTab';
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
