import React, { useState } from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import { useOffseason } from './useOffseason';

let view;
afterEach(() => { if (view) act(() => view.unmount()); view = null; });
const player = (id, extra = {}) => ({ id, name: `選手${id}`, pos: '一塁手', age: 26, ...extra });
function setup(extra = {}) {
  let current;
  const a = player(0), b = player(1);
  const initial = [{ id: 0, name: '自球団', budget: 1000, players: [a], farm: [],
    lineup: [0], lineupNoDh: [0], lineupDh: [0], rotation: [] },
  { id: 1, name: '相手', budget: 2000, players: [b], farm: [],
    lineup: [1], lineupNoDh: [1], lineupDh: [1], rotation: [] }];
  const notify = vi.fn(), addToHistory = vi.fn(), addNews = vi.fn(), addTransferLog = vi.fn();
  function Harness() {
    const [teams, setTeams] = useState(extra.teams || initial);
    const [mailbox, setMailbox] = useState([{ id: 'offer', type: 'trade', offer: { want: [a], offer: [b], from: initial[1], cash: 5000000 } }]);
    const gs = { teams, setTeams, myId: 0, myTeam: teams[0], year: 2026, gameDay: 1,
      mailbox, setMailbox, getMailboxItemById: id => mailbox.find(m => m.id === id),
      notify, addToHistory, addNews, addTransferLog, setCpuTradeOffers: vi.fn(), ...extra.gs };
    current = { gs, os: useOffseason(gs) };
    return null;
  }
  act(() => { view = create(React.createElement(Harness)); });
  return { get current() { return current; }, a, b, notify, addToHistory, addNews, addTransferLog };
}
it('transfers exactly 500万円, using current player records and preserving DH-specific order', () => {
  const h = setup();
  act(() => h.current.os.handleTrade([h.a], [h.b], { id: 1 }, 500));
  expect(h.current.gs.teams.map(t => t.budget)).toEqual([500, 2500]);
  expect(h.current.gs.teams[0].players.map(p => p.id)).toEqual([1]);
  expect(h.current.gs.teams[1].lineupDh).not.toContain(1);
  expect(h.addTransferLog).toHaveBeenCalledTimes(1);
});
it('rejects repeated calls in one event without duplicate money, players or success side effects', () => {
  const h = setup(); const call = () => h.current.os.handleTrade([h.a], [h.b], { id: 1 }, 0);
  act(() => { call(); call(); });
  expect(h.current.gs.teams.flatMap(t => t.players).map(p => p.id).sort()).toEqual([0, 1]);
  expect(h.addTransferLog).toHaveBeenCalledTimes(1);
  expect(h.addToHistory).toHaveBeenCalledTimes(1);
});
it.each([1001, NaN, Infinity])('rejects invalid/unaffordable cash %s without any success effects', cash => {
  const h = setup(); const before = JSON.stringify(h.current.gs.teams);
  act(() => h.current.os.handleTrade([h.a], [h.b], { id: 1 }, cash));
  expect(JSON.stringify(h.current.gs.teams)).toBe(before);
  expect(h.addTransferLog).not.toHaveBeenCalled(); expect(h.addNews).not.toHaveBeenCalled(); expect(h.addToHistory).not.toHaveBeenCalled();
});
it('converts a legacy CPU mail cash amount once and ignores a resolved/reloaded mail', () => {
  const h = setup();
  act(() => h.current.os.handleMailAction('offer', 'accept'));
  expect(h.current.gs.teams.map(t => t.budget)).toEqual([1500, 1500]);
  const saved = JSON.parse(JSON.stringify(h.current.gs.teams));
  act(() => h.current.os.handleMailAction('offer', 'accept'));
  expect(h.current.gs.teams).toEqual(saved); expect(h.addTransferLog).toHaveBeenCalledTimes(1);
});
it('keeps an unaffordable CPU mail unresolved and does not emit success', () => {
  const h = setup({ gs: {} });
  act(() => h.current.gs.setTeams(prev => prev.map(t => t.id === 1 ? { ...t, budget: 1 } : t)));
  act(() => h.current.os.handleMailAction('offer', 'accept'));
  expect(h.current.gs.mailbox[0].resolved).not.toBe(true);
  expect(h.addTransferLog).not.toHaveBeenCalled();
});
it('enforces the existing deadline at execution even for a pending mail', () => {
  const h = setup({ gs: { gameDay: 96, schedule: { 96: { date: { month: 8, day: 1 } } } } });
  const before = JSON.stringify(h.current.gs.teams);
  act(() => h.current.os.handleMailAction('offer', 'accept'));
  expect(JSON.stringify(h.current.gs.teams)).toBe(before);
  expect(h.current.gs.mailbox[0].resolved).not.toBe(true);
});
it.each(['stale', 'duplicate', 'same-club', 'third-club'])('rejects %s ownership without mutation', kind => {
  const h = setup(); const before = JSON.stringify(h.current.gs.teams);
  const outgoing = kind === 'stale' ? [player(999)] : kind === 'duplicate' ? [h.a, h.a] : [h.a];
  const incoming = kind === 'third-club' ? [player(999)] : [h.b];
  act(() => h.current.os.handleTrade(outgoing, incoming, { id: kind === 'same-club' ? 0 : 1 }, 0));
  expect(JSON.stringify(h.current.gs.teams)).toBe(before); expect(h.addTransferLog).not.toHaveBeenCalled();
});
it('rejects a cash-only purchase that would exceed 70 registered players', () => {
  const h = setup();
  act(() => h.current.gs.setTeams(prev => prev.map(t => t.id === 0 ? { ...t, farm: Array.from({length:69}, (_,i) => player(100+i)) } : t)));
  const before = JSON.stringify(h.current.gs.teams);
  act(() => h.current.os.handleTrade([], [h.b], { id: 1 }, 0));
  expect(JSON.stringify(h.current.gs.teams)).toBe(before);
});
it('places an incoming player in farm when active roster is full without rewriting DH order', () => {
  const h = setup();
  act(() => h.current.gs.setTeams(prev => prev.map(t => t.id === 0 ? { ...t, players: [h.a, ...Array.from({length:27}, (_,i) => player(100+i))], lineupNoDh: [102,0], lineupDh: [0,102] } : t)));
  act(() => h.current.os.handleTrade([], [h.b], { id: 1 }, 0));
  expect(h.current.gs.myTeam.players).toHaveLength(28);
  expect(h.current.gs.myTeam.farm.map(p => p.id)).toEqual([1]);
  expect(h.current.gs.myTeam.lineupNoDh).toEqual([102,0]);
  expect(h.current.gs.myTeam.lineupDh).toEqual([0,102]);
});
it('uses current owned records rather than outdated offer copies and removes farm ownership', () => {
  const h = setup();
  act(() => h.current.gs.setTeams(prev => prev.map(t => t.id === 1 ? { ...t, players: [], farm: [{ ...h.b, salary: 900 }] } : t)));
  act(() => h.current.os.handleTrade([h.a], [h.b], { id: 1 }, 0));
  expect(h.current.gs.myTeam.players[0].salary).toBe(900);
  expect(h.current.gs.teams[1].farm).toEqual([]);
});
it('removes departed fielding assignments and pitching references while preserving other choices', () => {
  const h = setup();
  act(() => h.current.gs.setTeams(prev => prev.map(t => t.id === 0 ? { ...t,
    fieldingNoDh: { 0: '一塁手', keep: '捕手' }, fieldingDh: { 0: 'DH', keep: '捕手' },
    pitchingPattern: { closerId: 0, setupId: 'keep', seventhId: null, middleOrder: [0,'keep'] } } : t)));
  act(() => h.current.os.handleTrade([h.a], [h.b], { id: 1 }, 0));
  expect(h.current.gs.myTeam.fieldingNoDh).toEqual({keep:'捕手'});
  expect(h.current.gs.myTeam.fieldingDh).toEqual({keep:'捕手'});
  expect(h.current.gs.myTeam.pitchingPattern).toEqual({closerId:null,setupId:'keep',seventhId:null,middleOrder:['keep']});
});
it('cannot accept the same mail through a stale callback after declining it in the same event', () => {
  const h=setup(), action=h.current.os.handleMailAction;
  const before=JSON.stringify(h.current.gs.teams);
  act(()=>{action('offer','decline');action('offer','accept');});
  expect(JSON.stringify(h.current.gs.teams)).toBe(before);
  expect(h.addTransferLog).not.toHaveBeenCalled();
});
