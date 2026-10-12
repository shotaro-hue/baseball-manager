import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, it, expect, vi } from 'vitest';
import { LeaderboardTab } from './LeaderboardTab';
import { emptyStats } from '../../engine/playerCore';

const text = n => typeof n === 'string' || typeof n === 'number' ? String(n) : (n.children || []).map(text).join('');
const player = (id, stats = {}, isPitcher = false) => ({ id, name: `選手${id}`, age: 25, pos: isPitcher ? '投手' : '外野', isPitcher, stats: { ...emptyStats(), PA: 10, AB: 10, H: 2, IP: 5, ...stats } });
const team = (players, farm = [], extra = {}) => ({ id: 0, name: '球団ゼロ', short: 'ゼロ', league: 'セ', players, farm, ...extra });
const mount = (teams, extra = {}) => {
  let view;
  act(() => { view = create(React.createElement(LeaderboardTab, { teams, myId: 0, ...extra })); });
  return view;
};
const click = (view, label) => act(() => view.root.findAllByType('button').find(n => n.props['aria-label'] === label || text(n) === label).props.onClick());
const rows = view => view.root.findByType('tbody').findAllByType('tr');
const names = view => rows(view).map(n => n.props['aria-label']);
const topNames = view => view.root.findAllByType('button').filter(n => n.props['aria-label']?.endsWith('の詳細を開く')).map(n => n.props['aria-label']);
const cell = (view, key, id) => {
  const index = view.root.findByType('thead').findAllByType('th').findIndex(n => n.findAllByType('button').some(b => b.props['aria-label'] === `${key}で並び替え`));
  return text(rows(view).find(n => n.props['aria-label'] === `選手${id}の詳細を開く`).findAllByType('td')[index]);
};

describe('first-team season leaderboard', () => {
  it('retains demoted participants including ID zero, uses first-team stats and leaves inputs untouched', () => {
    const batter = player(0, { HR: 7 }); batter.stats2 = { PA: 100, HR: 99 };
    const pitcher = player(1, { SV: 8 }, true);
    const farmOnly = player(2, { PA: 0, AB: 0, H: 0, IP: 0 }); farmOnly.stats2 = { PA: 100, HR: 99 };
    const teams = [team([player(3)], [batter, pitcher, farmOnly])];
    const before = structuredClone(teams);
    const open = vi.fn(), compare = vi.fn();
    const view = mount(teams, { onPlayerClick: open, onToggleCompare: compare, comparePlayerIds: [0] });
    click(view, '本塁打で並び替え');
    expect(names(view)).toEqual(['選手0の詳細を開く', '選手3の詳細を開く']);
    expect(cell(view, '本塁打', 0)).toBe('7');
    click(view, '選手0の詳細を開く');
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ id: 0, stats: batter.stats }), '球団ゼロ', 'battedBall');
    act(() => rows(view)[0].findAllByType('button')[0].props.onClick({ stopPropagation() {} }));
    expect(compare).toHaveBeenCalledWith(expect.objectContaining({ id: 0 }), '球団ゼロ');
    click(view, '⚾ 投手');
    expect(names(view)).toEqual(['選手1の詳細を開く']);
    click(view, '選手1の詳細を開く');
    expect(open).toHaveBeenLastCalledWith(expect.objectContaining({ id: 1 }), '球団ゼロ', 'stats');
    expect(teams).toEqual(before);
    act(() => view.unmount());
  });

  it('preserves minimum appearances, league filtering, scaled rate qualification and counting eligibility', () => {
    const teams = [team([player(0, { PA: 9 }), player(1), player(2, { PA: 27 }), player(3, { IP: 4 }, true), player(4, {}, true), player(5, { IP: 9 }, true)]), team([player(6, { PA: 50 })], [], { id: 1, league: 'パ' })];
    const view = mount(teams, { gameDay: 10 });
    expect(names(view)).toHaveLength(3);
    click(view, 'セリーグ');
    act(() => view.root.findByType('input').props.onChange({ target: { checked: true } }));
    expect(names(view)).toEqual(['選手2の詳細を開く']);
    click(view, '本塁打で並び替え');
    expect(view.root.findByType('input').props.disabled).toBe(true);
    expect(names(view)).toEqual(['選手1の詳細を開く', '選手2の詳細を開く']);
    click(view, '⚾ 投手');
    expect(names(view)).toEqual(['選手5の詳細を開く']);
    click(view, '勝で並び替え');
    expect(names(view)).toEqual(['選手4の詳細を開く', '選手5の詳細を開く']);
    act(() => view.unmount());
  });

  for (const [key, label, isPitcher] of [['HR', '本塁打', false], ['RBI', '打点', false], ['SB', '盗塁', false], ['W', '勝', true], ['SV', 'S', true], ['HLD', 'H', true], ['QS', 'QS', true], ['Kp', '奪三振', true]]) {
    it(`${key} preserves zero, puts missing values last in both directions and excludes them from top three`, () => {
      const missing = player(0, {}, isPitcher); delete missing.stats[key];
      const players = [missing, player(1, { [key]: 0 }, isPitcher), player(2, { [key]: 2 }, isPitcher), player(3, { [key]: null }, isPitcher), player(4, { [key]: NaN }, isPitcher), player(5, { [key]: Infinity }, isPitcher)];
      const view = mount([team(players)]);
      if (isPitcher) click(view, '⚾ 投手');
      click(view, `${label}で並び替え`);
      expect(names(view)).toEqual([2, 1, 0, 3, 4, 5].map(id => `選手${id}の詳細を開く`));
      expect(cell(view, label, 1)).toBe('0');
      for (const id of [0, 3, 4, 5]) expect(cell(view, label, id)).toBe('-');
      expect(topNames(view)).toEqual(['選手2の詳細を開く', '選手1の詳細を開く']);
      click(view, `${label}で並び替え`);
      expect(names(view)).toEqual([1, 2, 0, 3, 4, 5].map(id => `選手${id}の詳細を開く`));
      expect(topNames(view)).toEqual(['選手1の詳細を開く', '選手2の詳細を開く']);
      act(() => view.unmount());
    });
  }
});
