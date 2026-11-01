import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import { AnnualMarketTab } from './AnnualMarketTab';
import HubContentRouter from '../hub/HubContentRouter';
import OffseasonFaPhaseScreen from '../OffseasonFaPhaseScreen';
import { acquisitionFixture, acquisitionClock } from '../../engine/__tests__/fixtures/acquisitionWorld';
import { acquisitionRequest, reduceAcquisitionRequest } from '../../engine/acquisitionDecisions';

const text = n => typeof n === 'string' ? n : (n.children || []).map(text).join('');
let view;
afterEach(() => { if (view) act(() => view.unmount()); view = null; });
const state = (w = acquisitionFixture()) => ({ ...w, myTeam: w.teams[0], saveQueueState: { isSaving: false },
  getMailboxBySelector: () => w.mailbox, getNewsBySelector: () => [], getUnreadMailboxCount: () => 0, getLatestNewsId: () => null });
const setup = (gs, os = {}) => act(() => { view = create(React.createElement(AnnualMarketTab, { gs, os })); });
const button = label => view.root.findAllByType('button').find(n => text(n) === label);
const click = label => act(() => button(label).props.onClick());
const select = () => act(() => view.root.findByProps({ 'aria-label': '市場選手の交渉を確認' }).props.onClick());
const input = () => view.root.findByProps({ 'aria-label': '提示年俸（万円）' });
const held = () => { const w = acquisitionFixture(); return reduceAcquisitionRequest(w, acquisitionRequest(w, { type: 'offer', playerId: 'free', salary: 12000, years: 3 })).world; };

it('waits for acknowledged save, prevents duplicates, and retains failed drafts', async () => {
  let finish; const pending = new Promise(r => { finish = r; });
  const submit = vi.fn(() => pending); setup(state(), { handleAcquisitionOffer: submit }); select();
  act(() => input().props.onChange({ target: { value: '12000' } })); click('提示条件を確認する');
  let task; act(() => { task = button('この条件で提示する').props.onClick(); });
  expect(text(view.root)).not.toContain('提示を保存しました');
  act(() => button('この条件で提示する').props.onClick()); expect(submit).toHaveBeenCalledTimes(1);
  await act(async () => { finish({ ok: false }); await task; });
  expect(input().props.value).toBe('12000'); expect(text(view.root)).toContain('保存できません');
});

it('initializes saved terms, distinguishes replacement draft and resets on candidate selection', () => {
  const w = held(); w.faPool.push({ ...w.faPool[0], id: 'other', name: '別選手', salary: 800, marketEntry: { ...w.faPool[0].marketEntry, id: 'other-entry' } });
  setup(state(w)); select(); expect(input().props.value).toBe('12000');
  expect(view.root.findByProps({ 'aria-label': '契約年数' }).props.value).toBe(3);
  act(() => input().props.onChange({ target: { value: '13000' } })); click('提示条件を確認する');
  const confirmation = view.root.findByProps({ role: 'region', 'aria-label': '提示条件の最終確認' });
  expect(text(confirmation)).toContain('保存済みの提示'); expect(text(confirmation)).toContain('差替後の提示');
  act(() => view.root.findByProps({ 'aria-label': '別選手の交渉を確認' }).props.onClick());
  expect(input().props.value).toBe('800'); expect(view.root.findByProps({ 'aria-label': '契約年数' }).props.value).toBe(1);
});

it('blocks due edits and retains accepted offseason history after the candidate leaves the pool', () => {
  const due = acquisitionClock(held(), '2026-07-20'); setup(state(due)); select();
  expect(view.root.findByType('fieldset').props.disabled).toBe(true);
  expect(button('届いた回答を確認する')).toBeTruthy();
  act(() => view.unmount());
  const w = acquisitionFixture({ phase: 'offseason', date: '2026-12-01' });
  const h = reduceAcquisitionRequest(w, acquisitionRequest(w, { type: 'offer', playerId: 'free', salary: 12000, years: 3 })).world;
  const d = acquisitionClock(h, '2026-12-01', 4);
  const r = reduceAcquisitionRequest(d, acquisitionRequest(d, { type: 'resolve-due' })).world;
  setup(state(r)); select(); expect(text(view.root)).toContain('翌春の加入待ち'); expect(button('提示条件を確認する')).toBeUndefined();
});

it('keeps unclassified candidates read-only and exposes acknowledgement recovery', async () => {
  const w = acquisitionFixture(); delete w.faPool[0].marketEntry;
  const recover = vi.fn(async () => ({ ok: true })); setup({ ...state(w), recoverEconomyCommand: recover, saveResult: { reason: 'economy_adoption_required' } });
  select(); expect(text(view.root)).toContain('市場区分'); expect(button('提示条件を確認する')).toBeUndefined();
  await act(async () => { await button('保存済みの交渉を復旧する').props.onClick(); }); expect(recover).toHaveBeenCalledTimes(1);
});

it('routes both annual market entry points away from the legacy signing wallet', () => {
  const gs = state();
  act(() => { view = create(React.createElement(HubContentRouter, { app: { gs, os: {}, sf: {} }, tab: 'fa' })); });
  expect(view.root.findAllByType(AnnualMarketTab)).toHaveLength(1);
  act(() => view.update(React.createElement(OffseasonFaPhaseScreen, { gs, os: {}, myTeam: gs.myTeam, myId: 0, year: 2026 })));
  expect(view.root.findAllByType(AnnualMarketTab)).toHaveLength(1);
  expect(button('補強を終了して契約更改へ')).toBeUndefined();
});
