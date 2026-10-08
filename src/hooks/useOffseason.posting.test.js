import React, { useState } from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useOffseason } from './useOffseason';
import { calcPostingBid } from '../engine/posting';
import { FinanceTab } from '../components/tabs/FinanceTab';

vi.mock('../engine/posting', async original => ({ ...await original(), calcPostingBid: vi.fn() }));
let view;
beforeEach(() => {
  vi.clearAllMocks();
  calcPostingBid.mockReturnValue(100_000_000);
  vi.spyOn(Date, 'now').mockReturnValue(1_791_461_806_000);
});
afterEach(() => { if (view) act(() => view.unmount()); view = null; vi.restoreAllMocks(); });

function setup() {
  let current;
  const notify = vi.fn(), addNews = vi.fn();
  const pitcher = { id: 'posting-player', name: '移籍投手', isPitcher: true, age: 25,
    pos: '投手', salary: 100, morale: 70, postingRequested: true };
  const teammate = { ...pitcher, id: 'teammate', name: '残留投手' };
  function Harness() {
    const [teams, setTeams] = useState([{ id: 0, name: '自球団', budget: 1000, players: [pitcher, teammate],
      farm: [], coaches: [], lineup: [pitcher.id, teammate.id], lineupNoDh: [pitcher.id, teammate.id],
      lineupDh: [pitcher.id, teammate.id], rotation: [pitcher.id, teammate.id] },
    { id: 1, name: '他球団', budget: 5000, players: [] }]);
    const [mailbox, setMailbox] = useState([{ id: 'request', type: 'posting_request', playerId: pitcher.id }]);
    const gs = { teams, setTeams, myId: 0, myTeam: teams[0], year: 2026, mailbox, setMailbox,
      getMailboxItemById: id => mailbox.find(m => m.id === id), notify, addNews,
      upd: (id, update) => setTeams(prev => prev.map(t => t.id === id ? update(t) : t)) };
    current = { gs, os: useOffseason(gs) };
    return React.createElement(FinanceTab, { team: gs.myTeam, gameDay: 1 });
  }
  act(() => { view = create(React.createElement(Harness)); });
  return { get current() { return current; }, notify, addNews };
}

it('credits 2000万円 for a 1億円 bid and preserves the yen amount in mail, news and notification', () => {
  const h = setup();
  act(() => h.current.os.handleMailAction('request', 'accept'));
  expect(h.current.gs.myTeam.budget).toBe(3000);
  expect(h.current.gs.teams[1].budget).toBe(5000);
  expect(h.current.gs.myTeam.players.map(p => p.id)).toEqual(['teammate']);
  for (const key of ['lineup', 'lineupNoDh', 'lineupDh', 'rotation']) {
    expect(h.current.gs.myTeam[key]).toEqual(['teammate']);
  }
  const result = h.current.gs.mailbox.find(m => m.type === 'posting_result');
  expect(result.title).toContain('入札額1.0億円');
  expect(result.body).toContain('球団受取移籍金: 2000万円');
  expect(h.notify).toHaveBeenCalledWith('移籍投手 MLB移籍承認 — 移籍金+2000万円', 'ok');
  expect(h.addNews.mock.calls[0][0].body).toContain('球団移籍金収入2000万円');
  expect(JSON.stringify(view.toJSON())).toContain('3,000万円');
  // The departing player is gone; an already-resolved request cannot credit again.
  act(() => h.current.os.handleMailAction('request', 'accept'));
  expect(h.current.gs.myTeam.budget).toBe(3000);
  expect(calcPostingBid).toHaveBeenCalledTimes(1);
});

it('keeps the existing rounded yen fee before converting, without rounding the 万円 balance', () => {
  calcPostingBid.mockReturnValue(100_000_003);
  const h = setup();
  act(() => h.current.os.handleMailAction('request', 'accept'));
  expect(h.current.gs.myTeam.budget).toBeCloseTo(3000.0001, 8);
});

it('does not credit or remove a player on rejection and retains the existing morale penalty', () => {
  const h = setup();
  act(() => h.current.os.handleMailAction('request', 'decline'));
  expect(h.current.gs.myTeam.budget).toBe(1000);
  expect(h.current.gs.myTeam.players.find(p => p.id === 'posting-player').morale).toBe(60);
  expect(h.current.gs.myTeam.rotation).toContain('posting-player');
  expect(h.current.gs.mailbox).toEqual([expect.objectContaining({ resolved: true, read: true })]);
  expect(calcPostingBid).not.toHaveBeenCalled();
  expect(h.addNews).not.toHaveBeenCalled();
});
