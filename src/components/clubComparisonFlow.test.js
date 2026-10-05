import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, it, expect, vi } from 'vitest';
import { TeamDetailScreen } from './TeamDetailScreen';
import { PlayerComparisonDialog, compareRows } from './PlayerComparisonTray';
import { emptyStats } from '../engine/playerCore';

const text = n => typeof n === 'string' ? n : (n.children || []).map(text).join('');
const button = (v, name) => v.root.findAllByType('button').find(n => text(n) === name);
const click = (v, name) => act(() => button(v, name).props.onClick());
const pitcher = { id: 0, name: '投手ゼロ', isPitcher: true, stats: { ...emptyStats(), IP: 9 }, condition: 0, morale: 0 };
const team = { id: 0, name: '球団ゼロ', league: 'セ', wins: 1, losses: 0, players: [pitcher] };
const opponent = { ...team, id: 1, name: '相手球団', players: [] };

describe('club and comparison flow', () => {
  it('distinguishes recorded zero, absent stats and absent condition', () => {
    const rows = Object.fromEntries(compareRows(pitcher, { id: 1, isPitcher: true }).map(([key, ...values]) => [key, values]));
    expect(rows['防御率']).toEqual(['0.00', '---']);
    expect(rows.WHIP).toEqual(['0.00', '---']);
    expect(rows['コンディション']).toEqual([0, '---']);
    expect(rows['モラル']).toEqual([0, '---']);
    expect(rows['今季 WAR'][1]).toBe('---');
  });
  it('shows measured zero OPS and does not invent missing batted-ball numerators', () => {
    const player = { stats: { ...emptyStats(), AB: 4, PA: 4, battedBallProfile: { bip: 4, evN: 4 } } };
    const rows = Object.fromEntries(compareRows(player, { stats: {} }).map(([k, ...v]) => [k, v]));
    expect(rows.OPS).toEqual(['0.000', '---']);
    expect(rows['本塁打']).toEqual([0, '---']);
    expect(rows['平均打球速度']).toEqual(['---', '---']);
    expect(rows['強打球率']).toEqual(['---', '---']);
  });
  it('keeps mixed-role metrics labeled with their units and marks inapplicable values', () => {
    const rows = Object.fromEntries(compareRows({ ...pitcher, pitching: { velocity: 150 } }, { batting: { contact: 70 } }).map(([k, ...v]) => [k, v]));
    expect(rows['球速']).toEqual(['150 km/h', '---']);
    expect(rows['ミート']).toEqual(['---', 70]);
  });
  it('keeps roster navigation, history, schedule and trade accessible with comparison collapsed', () => {
    const open = vi.fn(), trade = vi.fn(), back = vi.fn(); let v;
    act(() => { v = create(React.createElement(TeamDetailScreen, { team, myTeam: opponent, allTeams: [team, opponent], onPlayerClick: open, onOpenTrade: trade, onBack: back })); });
    expect(text(v.toJSON())).toContain('1.000');
    expect(text(v.toJSON())).not.toContain('.1000');
    expect(button(v, '自球団との戦力を比較').props['aria-expanded']).toBe(false);
    click(v, '自球団との戦力を比較');
    expect(text(v.toJSON())).toContain('自球団との戦力比較');
    click(v, '投手'); click(v, '投手ゼロ');
    expect(open).toHaveBeenCalledWith(pitcher, team.name);
    click(v, '日程・結果');
    expect(text(v.toJSON())).toContain('日程データなし');
    click(v, '移籍履歴');
    expect(text(v.toJSON())).toContain('履歴データがありません');
    click(v, '🔄 トレード提案'); expect(trade).toHaveBeenCalledTimes(1);
    click(v, '← 戻る'); expect(back).toHaveBeenCalledTimes(1);
    act(() => v.unmount());
  });
  it('can receive comparison players after an empty render and remove ID zero', () => {
    const remove = vi.fn(); let v;
    const props = { onRemove: remove, onClose: vi.fn() };
    act(() => { v = create(React.createElement(PlayerComparisonDialog, { ...props, players: [] })); });
    act(() => v.update(React.createElement(PlayerComparisonDialog, { ...props, players: [pitcher, { id: 1, name: '相手投手', isPitcher: true }] })));
    act(() => v.root.findByProps({ 'aria-label': '投手ゼロを比較から外す' }).props.onClick());
    expect(remove).toHaveBeenCalledWith(0);
    act(() => v.unmount());
  });
});
