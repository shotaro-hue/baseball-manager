import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { DashboardTab, getDashboardLineup, playerCondition } from './DashboardTab';
import { create, act } from 'react-test-renderer';
import { vi } from 'vitest';

const player = { id: 0, name: '選手ゼロ', pos: '二', age: 24, condition: 85, batting: { contact: 71, power: 62, speed: 80 } };
const team = { id: 0, name: '自軍', league: 'C', players: [player], lineup: [0], farm: [], wins: 0, losses: 0, fieldingNoDh: { 0: '遊' } };
const opponent = { ...team, id: 1, name: '対戦相手', players: [], lineup: [] };
const schedule = { 1: { date: { month: 3, day: 27 }, matchups: [{ homeId: 0, awayId: 1 }] } };
function render(extra = {}) {
  return renderToStaticMarkup(React.createElement(DashboardTab, { myTeam: team, teams: [team, opponent], schedule, gameDay: 1, onTabSwitch() {}, onPlayerClick() {}, onStartGame() {}, ...extra }));
}
describe('Calm Dugout dashboard', () => {
  it('preserves player ID zero and assigned fielding position', () => {
    expect(getDashboardLineup(team)).toEqual([{ player, order: 1, position: '遊' }]);
  });
  it('uses DH assignment when selected', () => {
    expect(getDashboardLineup({ ...team, rosterDhMode: true, fieldingDh: { 0: 'DH' } })[0].position).toBe('DH');
  });
  it('skips missing players without mutating the saved lineup', () => {
    const lineup = [999, 0];
    expect(getDashboardLineup({ ...team, lineup })[0].order).toBe(2);
    expect(lineup).toEqual([999, 0]);
  });
  it.each([[80, '良好'], [79, '普通'], [60, '普通'], [59, '疲労あり']])('labels condition %s', (condition, label) => {
    expect(playerCondition({ condition }).label).toBe(label);
  });
  it('prioritizes injury over good condition', () => expect(playerCondition({ condition: 100, injuryDaysLeft: 2 }).label).toBe('負傷中'));
  it('renders real player data and active selection', () => {
    const html = render();
    expect(html).toContain('選手ゼロ');
    expect(html).toContain('value="71"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('オーダーを確認');
    expect(html).toContain('球団概況・おすすめ・注目選手');
  });
  it('disables game start after the season', () => {
    expect(render({ gameDay: 144 })).toMatch(/class="calm-primary" disabled=""/);
  });
  it('disables game start during batch simulation', () => {
    expect(render({ disableStart: true })).toMatch(/class="calm-primary" disabled=""/);
  });
  it('handles an empty roster', () => {
    expect(render({ myTeam: { ...team, players: [], lineup: [] } })).toContain('表示できる野手がいません');
  });
  it('selects bench players, switches to actual stats, and invokes existing actions', () => {
    const bench = { ...player, id: 2, name: '控え選手', stats: { AB: 100, H: 32, HR: 7, RBI: 21 } };
    const onStartGame = vi.fn();
    const onTabSwitch = vi.fn();
    const onPlayerClick = vi.fn();
    let view;
    act(() => { view = create(React.createElement(DashboardTab, {
      myTeam: { ...team, players: [player, bench] }, teams: [team, opponent], schedule, gameDay: 1,
      onStartGame, onTabSwitch, onPlayerClick,
    })); });
    const text = node => typeof node === 'string' ? node : (node.children ?? []).map(text).join('');
    const button = label => view.root.findAllByType('button').find(b => text(b) === label);
    act(() => { button('控え選手 二').props.onClick(); });
    expect(view.root.findByProps({ className: 'calm-player-name' }).findByType('h3').children).toEqual(['控え選手']);
    act(() => { button('成績').props.onClick(); });
    expect(view.root.findAllByType('dd').map(n => n.children.join(''))).toEqual(['.320', '7', '21']);
    act(() => { button('選手詳細を開く').props.onClick(); button('オーダーを確認').props.onClick(); button('試合へ進む').props.onClick(); });
    expect(onPlayerClick).toHaveBeenCalledWith(bench, team.name);
    expect(onTabSwitch).toHaveBeenCalledWith('roster');
    expect(onStartGame).toHaveBeenCalledOnce();
    act(() => view.unmount());
  });
});
