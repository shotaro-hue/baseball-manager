import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, it, expect, vi } from 'vitest';
import { ScheduleTab } from './tabs/ScheduleTab';
import { LeaderboardTab } from './tabs/LeaderboardTab';
import { StandingsTab } from './tabs/StandingsTab';
import { emptyStats } from '../engine/playerCore';

const text = n => typeof n === 'string' ? n : (n.children || []).map(text).join('');
const button = (view, label) => view.root.findAllByType('button').find(n => text(n) === label);
const click = (view, label) => act(() => button(view, label).props.onClick());
const schedule = [null,
  { date: { month: 3, day: 31 }, matchups: [{ homeId: 0, awayId: 1 }] },
  { date: { month: 4, day: 1 }, matchups: [{ homeId: 1, awayId: 0 }] },
];
const team = { id: 0, name: '自球団', short: '自', league: 'セ', wins: 1, losses: 0, draws: 1, rf: 5, ra: 2, players: [] };
const opponent = { ...team, id: 1, name: '相手球団', short: '相', wins: 0, losses: 1 };
const results = { 1: { won: true, drew: false, myScore: 3, oppScore: 1, oppName: '相手球団' } };
const props = { schedule, gameDay: 2, myTeam: team, teams: [team, opponent], year: 2026, gameResultsMap: results };

describe('schedule and league flow', () => {
  it('shows the current month, switches months and opens the saved current-season result', () => {
    const open = vi.fn(); let view;
    act(() => { view = create(React.createElement(ScheduleTab, { ...props, onResultClick: open })); });
    expect(button(view, '4月').props['aria-pressed']).toBe(true);
    click(view, '3月');
    const score = view.root.findByProps({ className: 'schedule-score' });
    act(() => score.props.onClick());
    expect(open).toHaveBeenCalledWith(1);
    click(view, 'カレンダー');
    expect(button(view, '3月').props['aria-pressed']).toBe(true);
    expect(view.root.findAllByProps({ className: 'calendar-day-button' })).toHaveLength(1);
    act(() => view.unmount());
  });

  it('opens archived home box-score data without invoking the current-season handler', () => {
    const open = vi.fn(); let view;
    const box = { ...results[1], homeId: 0, awayId: 1, homeBatting: [{ id: 0, name: '過去の打者', AB: 4, H: 1 }], awayBatting: [] };
    act(() => { view = create(React.createElement(ScheduleTab, { ...props, onResultClick: open, scheduleArchive: [{ year: 2025, schedule, gameResultsMap: results, myTeamResultsMap: { 1: box } }] })); });
    click(view, '2025年');
    act(() => view.root.findByProps({ className: 'schedule-score' }).props.onClick());
    expect(open).not.toHaveBeenCalled();
    expect(text(view.root.findByProps({ role: 'dialog' }))).toContain('過去の打者');
    act(() => view.root.findByProps({ 'aria-label': '試合詳細を閉じる' }).props.onClick());
    expect(button(view, '2025年').props['aria-pressed']).toBe(true);
    act(() => view.unmount());
  });

  it('can load schedule data after an initial empty render without changing hook order', () => {
    let view;
    act(() => { view = create(React.createElement(ScheduleTab, { ...props, schedule: null })); });
    act(() => view.update(React.createElement(ScheduleTab, props)));
    expect(button(view, '一覧').props['aria-pressed']).toBe(true);
    act(() => view.unmount());
  });

  it('ranks a qualified 0.00 ERA first and preserves player-detail navigation', () => {
    const open = vi.fn(); let view;
    const p = (id, er) => ({ id, name: `投手${id}`, isPitcher: true, stats: { ...emptyStats(), IP: 9, BF: 27, ER: er } });
    act(() => { view = create(React.createElement(LeaderboardTab, { teams: [{ ...team, players: [p(1, 1), p(0, 0)] }], myId: 0, onPlayerClick: open })); });
    click(view, '⚾ 投手');
    const rows = view.root.findAllByProps({ className: 'interactive-player-row' });
    expect(text(rows[0])).toContain('投手0');
    expect(text(rows[0])).toContain('0.00');
    act(() => rows[0].props.onClick());
    expect(open.mock.calls[0][0].id).toBe(0);
    expect(open.mock.calls[0][2]).toBe('stats');
    act(() => view.unmount());
  });

  it('shows a perfect winning percentage as 1.000, excluding draws', () => {
    const view = create(React.createElement(StandingsTab, { teams: [team, opponent], myId: 0 }));
    expect(text(view.toJSON())).toContain('1.000');
    expect(text(view.toJSON())).not.toContain('.1000');
    view.unmount();
  });
});
