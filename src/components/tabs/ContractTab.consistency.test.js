import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import { ContractTab } from './ContractTab';
import HubContentRouter from '../hub/HubContentRouter';
const text = node => typeof node === 'string' ? node : (node.children || []).map(text).join('');
let view;
afterEach(() => { if (view) act(() => view.unmount()); view = null; });
const p = (id, extra = {}) => ({ id, name: `選手${id}`, age: 25, pos: '捕手', salary: 1000, contractYearsLeft: 1, personality: {}, stats: {}, ...extra });

it('shows farm ID 0, excludes signed contracts, and keeps invalid ikusei years out of offers', () => {
  const team = { id: 0, players: [p(1, { contractSignedYear: 2026 })], farm: [p(0, { 育成: true, ikuseiYears: 2 })], wins: 0, losses: 0 };
  const onOffer = vi.fn(() => false);
  act(() => { view = create(React.createElement(ContractTab, { team, allTeams: [team], year: 2026, onOffer, onRelease: vi.fn() })); });
  expect(text(view.root)).toContain('契約満了選手 (1人)'); expect(text(view.root)).not.toContain('選手1');
  act(() => view.root.findAllByType('td').find(n => text(n) === '選手0').props.onClick());
  expect(view.root.findAllByType('button').some(n => text(n) === '2年')).toBe(false);
  const offer = () => view.root.findAllByType('button').find(n => text(n) === 'この条件で最終オファー');
  act(() => offer().props.onClick());
  expect(onOffer.mock.calls[0][0]).toBe(0); expect(offer().props.disabled).toBe(false);
});

it('explicit farm release uses the shared release path, cleans references, and does not duplicate history or market entries', () => {
  let team = { id: 0, name: '自球団', players: [p(1)], farm: [p(0)], lineup: [0, 1], lineupDh: [0, 1], lineupNoDh: [0, 1], rotation: [0], history: [] }, pool = [];
  const gs = { myId: 0, year: 2026, gameDay: 1, getMailboxBySelector: () => [], getNewsBySelector: () => [], getUnreadMailboxCount: () => 0, getLatestNewsId: () => null,
    upd: (id, fn) => { team = fn(team); }, setFaPool: fn => { pool = fn(pool); }, notify: vi.fn() };
  const draw = () => { gs.myTeam = team; gs.teams = [team]; return React.createElement(HubContentRouter, { app: { gs, sf: {}, os: {} }, tab: 'contract' }); };
  act(() => { view = create(draw()); });
  act(() => view.root.findByType(ContractTab).props.onRelease(0));
  expect(team.farm).toEqual([]); expect(team.lineup).toEqual([1]); expect(team.lineupDh).toEqual([1]); expect(team.rotation).toEqual([]);
  expect(pool[0]).toMatchObject({ id: 0, isFA: true, marketEntryReason: '自由契約', faOriginRoster: 'farm' });
  expect(team.history).toHaveLength(1);
  act(() => view.update(draw())); act(() => view.root.findByType(ContractTab).props.onRelease(0));
  expect(pool).toHaveLength(1); expect(team.history).toHaveLength(1);
});
